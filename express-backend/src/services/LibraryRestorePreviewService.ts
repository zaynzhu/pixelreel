import { serializeBigIntForJson } from '../json'
import {
  calculateLibraryRecordsSha256,
  LIBRARY_EXPORT_FORMAT,
  LIBRARY_EXPORT_VERSION,
  LibraryExportRecords,
  readLibraryExportRecords,
} from './LibraryExportService'

type JsonObject = Record<string, unknown>

export interface LibraryExportCounts {
  movies: number
  tvShows: number
  games: number
  platformProfiles: number
  total: number
}

export interface ValidatedLibraryExportSnapshot {
  format: typeof LIBRARY_EXPORT_FORMAT
  version: typeof LIBRARY_EXPORT_VERSION
  exportedAt: string
  counts: LibraryExportCounts
  integrity: {
    algorithm: 'sha256'
    recordsSha256: string
  }
  records: LibraryExportRecords
}

export interface LibraryRestoreComparisonCounts {
  snapshotOnly: number
  different: number
  unchanged: number
  conflicts: number
  currentOnly: number
}

export interface LibraryRestoreConflict {
  category: 'movie' | 'tvShow' | 'game' | 'platformProfile'
  snapshotId: string
  title: string
  currentIds: string[]
  reason: 'multipleCurrentMatches' | 'profileOwnerMismatch'
}

interface CollectionComparison {
  counts: LibraryRestoreComparisonCounts
  conflicts: LibraryRestoreConflict[]
  matches: Map<string, string>
  snapshotOnlyIds: Set<string>
}

const CONFLICT_DETAIL_LIMIT = 50
const RECORD_IDENTITY_FIELDS = {
  movie: ['doubanId', 'tmdbId', 'imdbId', 'traktId'],
  tvShow: ['doubanId', 'tmdbId', 'imdbId', 'traktId'],
} as const

export class LibraryRestorePreviewValidationError extends Error {
  readonly status = 400

  constructor(message: string) {
    super(message)
    this.name = 'LibraryRestorePreviewValidationError'
  }
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function assertExactKeys(value: JsonObject, expected: string[], label: string) {
  const actual = Object.keys(value).sort()
  const sortedExpected = [...expected].sort()
  if (actual.length !== sortedExpected.length || actual.some((key, index) => key !== sortedExpected[index])) {
    throw new LibraryRestorePreviewValidationError(`${label}字段不完整或包含未知字段`)
  }
}

function parseCount(value: unknown, label: string) {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new LibraryRestorePreviewValidationError(`${label}必须是非负安全整数`)
  }
  return Number(value)
}

function normalizeRecordId(value: unknown, label: string) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value)
  if (typeof value === 'bigint' && value > 0n) return value.toString()
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) return value
  throw new LibraryRestorePreviewValidationError(`${label}必须是正整数`)
}

function normalizeIdentityValue(value: unknown) {
  if (typeof value === 'string') return value.trim() || null
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value)
  if (typeof value === 'bigint' && value >= 0n) return value.toString()
  return null
}

function normalizePlatform(value: unknown) {
  return typeof value === 'string' ? value.trim().toUpperCase() : ''
}

function getPlatformIdentity(entry: JsonObject) {
  const platform = normalizePlatform(entry.platform)
  const externalId = normalizeIdentityValue(entry.externalId)
  return platform && externalId ? `profile:${platform}:${externalId}` : null
}

function getPlatformEntries(game: JsonObject) {
  return Array.isArray(game.platformEntries)
    ? game.platformEntries.filter(isJsonObject)
    : []
}

function getRecordIdentities(category: 'movie' | 'tvShow' | 'game', record: JsonObject) {
  if (category !== 'game') {
    return RECORD_IDENTITY_FIELDS[category].flatMap((field) => {
      const value = normalizeIdentityValue(record[field])
      return value ? [`${field}:${value}`] : []
    })
  }

  const identities: string[] = []
  const rawgId = normalizeIdentityValue(record.rawgId)
  const steamAppId = normalizeIdentityValue(record.steamAppId)
  const xboxId = normalizeIdentityValue(record.xboxId)
  const psnId = normalizeIdentityValue(record.psnId)
  if (rawgId) identities.push(`rawgId:${rawgId}`)
  if (steamAppId) identities.push(`profile:STEAM:${steamAppId}`)
  if (xboxId) identities.push(`profile:XBOX:${xboxId}`)
  if (psnId) identities.push(`profile:PSN:${psnId}`)
  getPlatformEntries(record).forEach((entry) => {
    const identity = getPlatformIdentity(entry)
    if (identity) identities.push(identity)
  })
  return [...new Set(identities)]
}

function validateRecordCollection(
  records: unknown[],
  category: 'movie' | 'tvShow' | 'game',
) {
  const ids = new Set<string>()
  records.forEach((value, index) => {
    if (!isJsonObject(value)) {
      throw new LibraryRestorePreviewValidationError(`${category} 第 ${index + 1} 条记录必须是对象`)
    }
    const id = normalizeRecordId(value.id, `${category} 第 ${index + 1} 条记录 ID`)
    if (ids.has(id)) {
      throw new LibraryRestorePreviewValidationError(`${category} 中存在重复记录 ID: ${id}`)
    }
    ids.add(id)
    if (typeof value.title !== 'string' || !value.title.trim()) {
      throw new LibraryRestorePreviewValidationError(`${category} 记录 ${id} 缺少标题`)
    }
  })
}

function validatePlatformProfiles(games: unknown[]) {
  const profileIds = new Set<string>()
  const identities = new Set<string>()
  games.forEach((gameValue) => {
    const game = gameValue as JsonObject
    const gameId = normalizeRecordId(game.id, '游戏记录 ID')
    if (!Array.isArray(game.platformEntries)) {
      throw new LibraryRestorePreviewValidationError(`游戏记录 ${gameId} 缺少平台档案数组`)
    }
    game.platformEntries.forEach((entryValue, index) => {
      if (!isJsonObject(entryValue)) {
        throw new LibraryRestorePreviewValidationError(`游戏记录 ${gameId} 的第 ${index + 1} 个平台档案必须是对象`)
      }
      const entryId = normalizeRecordId(entryValue.id, `游戏记录 ${gameId} 的平台档案 ID`)
      const entryGameId = normalizeRecordId(entryValue.gameId, `平台档案 ${entryId} 的 gameId`)
      const identity = getPlatformIdentity(entryValue)
      if (entryGameId !== gameId) {
        throw new LibraryRestorePreviewValidationError(`平台档案 ${entryId} 不属于游戏记录 ${gameId}`)
      }
      if (!identity) {
        throw new LibraryRestorePreviewValidationError(`平台档案 ${entryId} 缺少合法平台或外部 ID`)
      }
      if (profileIds.has(entryId)) {
        throw new LibraryRestorePreviewValidationError(`快照中存在重复平台档案 ID: ${entryId}`)
      }
      if (identities.has(identity)) {
        throw new LibraryRestorePreviewValidationError(`快照中存在重复平台身份: ${identity.slice(8)}`)
      }
      profileIds.add(entryId)
      identities.add(identity)
    })
  })
}

function countPlatformProfiles(games: unknown[]) {
  return games.reduce<number>((count, game) => (
    count + (isJsonObject(game) && Array.isArray(game.platformEntries) ? game.platformEntries.length : 0)
  ), 0)
}

export function validateLibraryRestoreSnapshot(value: unknown): ValidatedLibraryExportSnapshot {
  if (!isJsonObject(value)) {
    throw new LibraryRestorePreviewValidationError('快照根节点必须是对象')
  }
  assertExactKeys(value, ['format', 'version', 'exportedAt', 'counts', 'integrity', 'records'], '快照')
  if (value.format !== LIBRARY_EXPORT_FORMAT) {
    throw new LibraryRestorePreviewValidationError('不是 PixelReel 资料库快照')
  }
  if (value.version !== LIBRARY_EXPORT_VERSION) {
    throw new LibraryRestorePreviewValidationError(`仅支持版本 ${LIBRARY_EXPORT_VERSION} 的资料库快照`)
  }
  if (typeof value.exportedAt !== 'string') {
    throw new LibraryRestorePreviewValidationError('快照导出时间无效')
  }
  const exportedAt = new Date(value.exportedAt)
  if (Number.isNaN(exportedAt.getTime()) || exportedAt.toISOString() !== value.exportedAt) {
    throw new LibraryRestorePreviewValidationError('快照导出时间必须是标准 ISO 时间')
  }

  if (!isJsonObject(value.counts)) {
    throw new LibraryRestorePreviewValidationError('快照计数清单无效')
  }
  assertExactKeys(value.counts, ['movies', 'tvShows', 'games', 'platformProfiles', 'total'], '计数清单')
  const counts: LibraryExportCounts = {
    movies: parseCount(value.counts.movies, '电影数量'),
    tvShows: parseCount(value.counts.tvShows, '剧集数量'),
    games: parseCount(value.counts.games, '游戏数量'),
    platformProfiles: parseCount(value.counts.platformProfiles, '平台档案数量'),
    total: parseCount(value.counts.total, '记录总数'),
  }

  if (!isJsonObject(value.integrity)) {
    throw new LibraryRestorePreviewValidationError('快照完整性清单无效')
  }
  assertExactKeys(value.integrity, ['algorithm', 'recordsSha256'], '完整性清单')
  if (value.integrity.algorithm !== 'sha256') {
    throw new LibraryRestorePreviewValidationError('快照完整性算法必须是 sha256')
  }
  if (typeof value.integrity.recordsSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.integrity.recordsSha256)) {
    throw new LibraryRestorePreviewValidationError('快照 SHA-256 无效')
  }

  if (!isJsonObject(value.records)) {
    throw new LibraryRestorePreviewValidationError('快照记录区无效')
  }
  assertExactKeys(value.records, ['movies', 'tvShows', 'games'], '记录区')
  if (!Array.isArray(value.records.movies) || !Array.isArray(value.records.tvShows) || !Array.isArray(value.records.games)) {
    throw new LibraryRestorePreviewValidationError('电影、剧集和游戏记录必须是数组')
  }
  const records: LibraryExportRecords = {
    movies: value.records.movies,
    tvShows: value.records.tvShows,
    games: value.records.games,
  }
  validateRecordCollection(records.movies, 'movie')
  validateRecordCollection(records.tvShows, 'tvShow')
  validateRecordCollection(records.games, 'game')
  validatePlatformProfiles(records.games)

  const actualPlatformProfiles = countPlatformProfiles(records.games)
  if (
    counts.movies !== records.movies.length
    || counts.tvShows !== records.tvShows.length
    || counts.games !== records.games.length
    || counts.platformProfiles !== actualPlatformProfiles
    || counts.total !== records.movies.length + records.tvShows.length + records.games.length
  ) {
    throw new LibraryRestorePreviewValidationError('快照计数清单与记录区不一致')
  }
  if (calculateLibraryRecordsSha256(records) !== value.integrity.recordsSha256) {
    throw new LibraryRestorePreviewValidationError('快照 SHA-256 校验失败，记录区可能已损坏')
  }

  return {
    format: LIBRARY_EXPORT_FORMAT,
    version: LIBRARY_EXPORT_VERSION,
    exportedAt: value.exportedAt,
    counts,
    integrity: {
      algorithm: 'sha256',
      recordsSha256: value.integrity.recordsSha256,
    },
    records,
  }
}

export function parseLibraryRestoreSnapshot(contents: Buffer | string) {
  let value: unknown
  try {
    value = JSON.parse(typeof contents === 'string' ? contents : contents.toString('utf8'))
  } catch {
    throw new LibraryRestorePreviewValidationError('快照不是有效的 JSON 文件')
  }
  return validateLibraryRestoreSnapshot(value)
}

function normalizeJsonValue(value: unknown): unknown {
  if (typeof value === 'bigint') return serializeBigIntForJson(value)
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(normalizeJsonValue)
  if (!value || typeof value !== 'object') return value
  const toJson = (value as { toJSON?: () => unknown }).toJSON
  if (typeof toJson === 'function') return normalizeJsonValue(toJson.call(value))
  return Object.fromEntries(
    Object.entries(value as JsonObject)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, normalizeJsonValue(item)]),
  )
}

function recordsEqual(left: unknown, right: unknown) {
  return JSON.stringify(normalizeJsonValue(left)) === JSON.stringify(normalizeJsonValue(right))
}

function getDisplayTitle(record: JsonObject, fallback: string) {
  return typeof record.title === 'string' ? record.title.slice(0, 255) : fallback
}

function compareCollection(
  category: 'movie' | 'tvShow' | 'game',
  snapshotValues: unknown[],
  currentValues: unknown[],
): CollectionComparison {
  const snapshotRecords = snapshotValues as JsonObject[]
  const currentRecords = currentValues as JsonObject[]
  const currentById = new Map<string, JsonObject>()
  const currentByIdentity = new Map<string, Set<string>>()
  currentRecords.forEach((record) => {
    const id = normalizeRecordId(record.id, `${category} 当前记录 ID`)
    currentById.set(id, record)
    getRecordIdentities(category, record).forEach((identity) => {
      const ids = currentByIdentity.get(identity) ?? new Set<string>()
      ids.add(id)
      currentByIdentity.set(identity, ids)
    })
  })

  const counts: LibraryRestoreComparisonCounts = {
    snapshotOnly: 0,
    different: 0,
    unchanged: 0,
    conflicts: 0,
    currentOnly: 0,
  }
  const conflicts: LibraryRestoreConflict[] = []
  const matches = new Map<string, string>()
  const snapshotOnlyIds = new Set<string>()
  const matchedCurrentIds = new Set<string>()

  snapshotRecords.forEach((record) => {
    const snapshotId = normalizeRecordId(record.id, `${category} 快照记录 ID`)
    const directMatch = currentById.get(snapshotId)
    if (directMatch && recordsEqual(record, directMatch)) {
      matchedCurrentIds.add(snapshotId)
      matches.set(snapshotId, snapshotId)
      counts.unchanged++
      return
    }
    const candidateIds = new Set<string>()
    if (currentById.has(snapshotId)) candidateIds.add(snapshotId)
    getRecordIdentities(category, record).forEach((identity) => {
      currentByIdentity.get(identity)?.forEach(id => candidateIds.add(id))
    })
    candidateIds.forEach(id => matchedCurrentIds.add(id))

    if (candidateIds.size === 0) {
      counts.snapshotOnly++
      snapshotOnlyIds.add(snapshotId)
      return
    }
    if (candidateIds.size > 1) {
      counts.conflicts++
      conflicts.push({
        category,
        snapshotId,
        title: getDisplayTitle(record, snapshotId),
        currentIds: [...candidateIds].sort(),
        reason: 'multipleCurrentMatches',
      })
      return
    }

    const currentId = [...candidateIds][0]
    const currentRecord = currentById.get(currentId)!
    matches.set(snapshotId, currentId)
    if (recordsEqual(record, currentRecord)) counts.unchanged++
    else counts.different++
  })
  counts.currentOnly = currentRecords.length - matchedCurrentIds.size
  return { counts, conflicts, matches, snapshotOnlyIds }
}

function comparePlatformProfiles(
  snapshotGames: unknown[],
  currentGames: unknown[],
  gameMatches: Map<string, string>,
): CollectionComparison {
  const snapshotProfiles = (snapshotGames as JsonObject[]).flatMap(game => getPlatformEntries(game))
  const currentProfiles = (currentGames as JsonObject[]).flatMap(game => getPlatformEntries(game))
  const currentById = new Map<string, JsonObject>()
  const currentByIdentity = new Map<string, Set<string>>()
  currentProfiles.forEach((profile) => {
    const id = normalizeRecordId(profile.id, '当前平台档案 ID')
    const identity = getPlatformIdentity(profile)
    currentById.set(id, profile)
    if (identity) {
      const ids = currentByIdentity.get(identity) ?? new Set<string>()
      ids.add(id)
      currentByIdentity.set(identity, ids)
    }
  })

  const counts: LibraryRestoreComparisonCounts = {
    snapshotOnly: 0,
    different: 0,
    unchanged: 0,
    conflicts: 0,
    currentOnly: 0,
  }
  const conflicts: LibraryRestoreConflict[] = []
  const matches = new Map<string, string>()
  const snapshotOnlyIds = new Set<string>()
  const matchedCurrentIds = new Set<string>()

  snapshotProfiles.forEach((profile) => {
    const snapshotId = normalizeRecordId(profile.id, '快照平台档案 ID')
    const directMatch = currentById.get(snapshotId)
    if (directMatch && recordsEqual(profile, directMatch)) {
      matchedCurrentIds.add(snapshotId)
      matches.set(snapshotId, snapshotId)
      counts.unchanged++
      return
    }
    const identity = getPlatformIdentity(profile)!
    const candidateIds = new Set<string>()
    if (currentById.has(snapshotId)) candidateIds.add(snapshotId)
    currentByIdentity.get(identity)?.forEach(id => candidateIds.add(id))
    candidateIds.forEach(id => matchedCurrentIds.add(id))

    if (candidateIds.size === 0) {
      counts.snapshotOnly++
      snapshotOnlyIds.add(snapshotId)
      return
    }
    if (candidateIds.size > 1) {
      counts.conflicts++
      conflicts.push({
        category: 'platformProfile',
        snapshotId,
        title: identity.slice(8),
        currentIds: [...candidateIds].sort(),
        reason: 'multipleCurrentMatches',
      })
      return
    }

    const currentId = [...candidateIds][0]
    const currentProfile = currentById.get(currentId)!
    const snapshotGameId = normalizeRecordId(profile.gameId, `平台档案 ${snapshotId} 的 gameId`)
    const expectedCurrentGameId = gameMatches.get(snapshotGameId)
    const currentGameId = normalizeRecordId(currentProfile.gameId, `平台档案 ${currentId} 的 gameId`)
    if (expectedCurrentGameId && expectedCurrentGameId !== currentGameId) {
      counts.conflicts++
      conflicts.push({
        category: 'platformProfile',
        snapshotId,
        title: identity.slice(8),
        currentIds: [currentId],
        reason: 'profileOwnerMismatch',
      })
      return
    }

    matches.set(snapshotId, currentId)
    if (recordsEqual(profile, currentProfile)) counts.unchanged++
    else counts.different++
  })
  counts.currentOnly = currentProfiles.length - matchedCurrentIds.size
  return { counts, conflicts, matches, snapshotOnlyIds }
}

function addComparisonCounts(values: LibraryRestoreComparisonCounts[]) {
  return values.reduce<LibraryRestoreComparisonCounts>((total, value) => ({
    snapshotOnly: total.snapshotOnly + value.snapshotOnly,
    different: total.different + value.different,
    unchanged: total.unchanged + value.unchanged,
    conflicts: total.conflicts + value.conflicts,
    currentOnly: total.currentOnly + value.currentOnly,
  }), {
    snapshotOnly: 0,
    different: 0,
    unchanged: 0,
    conflicts: 0,
    currentOnly: 0,
  })
}

function analyzeLibraryRestore(
  snapshot: ValidatedLibraryExportSnapshot,
  currentRecords: LibraryExportRecords,
) {
  const movies = compareCollection('movie', snapshot.records.movies, currentRecords.movies)
  const tvShows = compareCollection('tvShow', snapshot.records.tvShows, currentRecords.tvShows)
  const games = compareCollection('game', snapshot.records.games, currentRecords.games)
  const platformProfiles = comparePlatformProfiles(
    snapshot.records.games,
    currentRecords.games,
    games.matches,
  )
  const comparisons = {
    movies: movies.counts,
    tvShows: tvShows.counts,
    games: games.counts,
    platformProfiles: platformProfiles.counts,
  }
  const summary = addComparisonCounts(Object.values(comparisons))
  const allConflicts = [
    ...movies.conflicts,
    ...tvShows.conflicts,
    ...games.conflicts,
    ...platformProfiles.conflicts,
  ]
  const currentPlatformProfiles = countPlatformProfiles(currentRecords.games)

  const preview = {
    valid: true,
    readOnly: true,
    snapshot: {
      format: snapshot.format,
      version: snapshot.version,
      exportedAt: snapshot.exportedAt,
      counts: snapshot.counts,
      recordsSha256: snapshot.integrity.recordsSha256,
    },
    current: {
      counts: {
        movies: currentRecords.movies.length,
        tvShows: currentRecords.tvShows.length,
        games: currentRecords.games.length,
        platformProfiles: currentPlatformProfiles,
        total: currentRecords.movies.length + currentRecords.tvShows.length + currentRecords.games.length,
      },
    },
    comparison: {
      summary,
      ...comparisons,
    },
    hasConflicts: summary.conflicts > 0,
    conflicts: allConflicts.slice(0, CONFLICT_DETAIL_LIMIT),
    omittedConflictCount: Math.max(0, allConflicts.length - CONFLICT_DETAIL_LIMIT),
  }
  return { movies, tvShows, games, platformProfiles, preview }
}

export function buildLibraryRestorePreview(
  snapshot: ValidatedLibraryExportSnapshot,
  currentRecords: LibraryExportRecords,
) {
  return analyzeLibraryRestore(snapshot, currentRecords).preview
}

export function buildLibraryRestoreExecutionPlan(
  snapshot: ValidatedLibraryExportSnapshot,
  currentRecords: LibraryExportRecords,
) {
  const analysis = analyzeLibraryRestore(snapshot, currentRecords)
  const gameIdMap = new Map(analysis.games.matches)
  analysis.games.snapshotOnlyIds.forEach(id => gameIdMap.set(id, id))
  const selectSnapshotOnly = (records: unknown[], ids: Set<string>, label: string) => (
    records.filter((record) => isJsonObject(record)
      && ids.has(normalizeRecordId(record.id, `${label} ID`))) as JsonObject[]
  )

  return {
    preview: analysis.preview,
    currentFingerprint: calculateLibraryRecordsSha256(currentRecords),
    records: {
      movies: selectSnapshotOnly(snapshot.records.movies, analysis.movies.snapshotOnlyIds, '电影记录'),
      tvShows: selectSnapshotOnly(snapshot.records.tvShows, analysis.tvShows.snapshotOnlyIds, '剧集记录'),
      games: selectSnapshotOnly(snapshot.records.games, analysis.games.snapshotOnlyIds, '游戏记录'),
      platformProfiles: (snapshot.records.games as JsonObject[])
        .flatMap(game => getPlatformEntries(game))
        .filter(profile => analysis.platformProfiles.snapshotOnlyIds.has(
          normalizeRecordId(profile.id, '平台档案 ID'),
        )),
    },
    gameIdMap,
  }
}

export async function previewLibraryRestoreSnapshot(contents: Buffer | string) {
  const snapshot = parseLibraryRestoreSnapshot(contents)
  const currentRecords = await readLibraryExportRecords()
  return buildLibraryRestorePreview(snapshot, currentRecords)
}
