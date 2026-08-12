import { randomBytes } from 'crypto'
import { promises as fs } from 'fs'
import path from 'path'
import { Prisma } from '@prisma/client'
import { getDb } from '../config/db'
import {
  buildLibraryExportSnapshot,
  calculateLibraryRecordsSha256,
  LibraryExportRecords,
  readLibraryExportRecords,
  readLibraryExportRecordsFromClient,
  serializeLibraryExportSnapshot,
} from './LibraryExportService'
import {
  buildLibraryRestoreExecutionPlan,
  LibraryRestorePreviewValidationError,
  parseLibraryRestoreSnapshot,
  ValidatedLibraryExportSnapshot,
} from './LibraryRestorePreviewService'

type JsonObject = Record<string, unknown>

interface ConfirmationEntry {
  snapshotHash: string
  currentFingerprint: string
  expiresAt: number
}

const CONFIRMATION_TTL_MS = 10 * 60 * 1000
const MAX_CONFIRMATIONS = 100
const RESTORE_BACKUP_DIRECTORY = path.resolve(__dirname, '../../data/restore-backups')
const RECORD_STATUS_VALUES = new Set(['UNSET', 'WANT', 'IN_PROGRESS', 'DONE', 'DROPPED'])
const REVIEW_STATE_VALUES = new Set(['PENDING', 'ACCEPTED', 'IGNORED'])
const MAX_PRISMA_INT = 2_147_483_647

const MOVIE_FIELDS = [
  'id', 'title', 'posterUrl', 'releaseDate', 'overview', 'status', 'rating', 'shortReview',
  'createdAt', 'updatedAt', 'importReviewState', 'doubanId', 'doubanTitle', 'doubanAltTitle',
  'doubanIntro', 'doubanRating', 'doubanDate', 'doubanComment', 'doubanLink',
  'doubanAvgRating', 'tmdbId', 'tmdbTitle', 'tmdbPosterUrl', 'tmdbReleaseDate',
  'tmdbOverview', 'tmdbVoteAverage', 'tmdbPopularity', 'tmdbGenreIds', 'imdbId',
  'imdbRating', 'traktId',
] as const
const TV_SHOW_FIELDS = [
  'id', 'title', 'posterUrl', 'firstAirDate', 'overview', 'status', 'rating', 'shortReview',
  'createdAt', 'updatedAt', 'importReviewState', 'doubanId', 'doubanTitle', 'doubanAltTitle',
  'doubanIntro', 'doubanRating', 'doubanDate', 'doubanComment', 'doubanLink',
  'doubanAvgRating', 'tmdbId', 'tmdbTitle', 'tmdbPosterUrl', 'tmdbReleaseDate',
  'tmdbOverview', 'tmdbVoteAverage', 'tmdbPopularity', 'tmdbGenreIds', 'imdbId',
  'imdbRating', 'traktId',
] as const
const GAME_FIELDS = [
  'id', 'title', 'posterUrl', 'platform', 'playtimeMinutes', 'achievementTotal',
  'achievementUnlocked', 'importedAt', 'importReviewState', 'status', 'rating', 'shortReview',
  'createdAt', 'updatedAt', 'rawgId', 'steamAppId', 'xboxId', 'psnId',
] as const
const PLATFORM_PROFILE_FIELDS = [
  'id', 'gameId', 'platform', 'externalId', 'playtimeMinutes', 'achievementTotal',
  'achievementUnlocked', 'importedAt', 'lastSyncedAt', 'createdAt', 'updatedAt',
] as const

const COMMON_REQUIRED_FIELDS = new Set([
  'id', 'title', 'status', 'importReviewState', 'createdAt', 'updatedAt',
])
const PLATFORM_PROFILE_REQUIRED_FIELDS = new Set([
  'id', 'gameId', 'platform', 'externalId', 'lastSyncedAt', 'createdAt', 'updatedAt',
])
const BIGINT_FIELDS = new Set(['id', 'gameId', 'tmdbId', 'rawgId', 'steamAppId'])
const DATE_FIELDS = new Set(['createdAt', 'updatedAt', 'importedAt', 'lastSyncedAt'])
const NON_NEGATIVE_INT_FIELDS = new Set([
  'playtimeMinutes', 'achievementTotal', 'achievementUnlocked',
])
const RATING_FIELDS = new Set(['rating', 'doubanRating'])
const DECIMAL_RATING_FIELDS = new Set(['doubanAvgRating', 'tmdbVoteAverage', 'imdbRating'])
const TEXT_FIELDS = new Set(['overview', 'doubanIntro', 'tmdbOverview'])
const STRING_LIMITS: Record<string, number> = {
  title: 255,
  posterUrl: 500,
  releaseDate: 20,
  firstAirDate: 20,
  status: 20,
  shortReview: 1000,
  importReviewState: 20,
  doubanId: 20,
  doubanTitle: 255,
  doubanAltTitle: 255,
  doubanDate: 20,
  doubanComment: 1000,
  doubanLink: 500,
  tmdbTitle: 255,
  tmdbPosterUrl: 500,
  tmdbReleaseDate: 20,
  tmdbGenreIds: 200,
  imdbId: 20,
  traktId: 20,
  platform: 20,
  xboxId: 50,
  psnId: 50,
  externalId: 50,
}

export class LibraryRestoreConflictError extends Error {
  readonly status = 409

  constructor(message: string) {
    super(message)
    this.name = 'LibraryRestoreConflictError'
  }
}

export class LibraryRestoreConfirmationStore {
  private readonly entries = new Map<string, ConfirmationEntry>()

  create(snapshotHash: string, currentFingerprint: string, now = Date.now()) {
    this.prune(now)
    while (this.entries.size >= MAX_CONFIRMATIONS) {
      const oldest = this.entries.keys().next().value
      if (!oldest) break
      this.entries.delete(oldest)
    }
    const token = randomBytes(24).toString('hex')
    const expiresAt = now + CONFIRMATION_TTL_MS
    this.entries.set(token, { snapshotHash, currentFingerprint, expiresAt })
    return { token, expiresAt: new Date(expiresAt).toISOString() }
  }

  consume(token: string, snapshotHash: string, currentFingerprint: string, now = Date.now()) {
    if (!/^[a-f0-9]{48}$/.test(token)) {
      throw new LibraryRestorePreviewValidationError('恢复确认令牌格式无效')
    }
    const entry = this.entries.get(token)
    this.entries.delete(token)
    if (!entry || entry.expiresAt <= now) {
      throw new LibraryRestoreConflictError('恢复预览已过期，请重新生成')
    }
    if (entry.snapshotHash !== snapshotHash || entry.currentFingerprint !== currentFingerprint) {
      throw new LibraryRestoreConflictError('快照或当前资料库已变化，请重新生成恢复预览')
    }
  }

  private prune(now: number) {
    this.entries.forEach((entry, token) => {
      if (entry.expiresAt <= now) this.entries.delete(token)
    })
  }
}

const confirmationStore = new LibraryRestoreConfirmationStore()
let restoreInProgress = false

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parseBigIntValue(value: unknown, field: string) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return BigInt(value)
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) return BigInt(value)
  throw new LibraryRestorePreviewValidationError(`${field} 必须是正整数`)
}

function parseDateValue(value: unknown, field: string) {
  if (typeof value !== 'string') {
    throw new LibraryRestorePreviewValidationError(`${field} 必须是 ISO 时间`)
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new LibraryRestorePreviewValidationError(`${field} 必须是标准 ISO 时间`)
  }
  return parsed
}

function parseRecordField(
  field: string,
  value: unknown,
  label: string,
  requiredFields: Set<string>,
) {
  if (value == null) {
    if (requiredFields.has(field)) {
      throw new LibraryRestorePreviewValidationError(`${label}.${field} 不能为空`)
    }
    return null
  }
  if (BIGINT_FIELDS.has(field)) return parseBigIntValue(value, `${label}.${field}`)
  if (DATE_FIELDS.has(field)) return parseDateValue(value, `${label}.${field}`)
  if (NON_NEGATIVE_INT_FIELDS.has(field)) {
    if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > MAX_PRISMA_INT) {
      throw new LibraryRestorePreviewValidationError(`${label}.${field} 必须是有效非负整数`)
    }
    return Number(value)
  }
  if (RATING_FIELDS.has(field)) {
    if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 5) {
      throw new LibraryRestorePreviewValidationError(`${label}.${field} 必须是 1–5 的整数`)
    }
    return Number(value)
  }
  if (DECIMAL_RATING_FIELDS.has(field)) {
    if ((typeof value !== 'string' && typeof value !== 'number')
      || !/^\d{1,2}(?:\.\d)?$/.test(String(value))
      || Number(value) < 0
      || Number(value) > 10) {
      throw new LibraryRestorePreviewValidationError(`${label}.${field} 必须是 0–10 的一位小数`)
    }
    return value
  }
  if (field === 'tmdbPopularity') {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new LibraryRestorePreviewValidationError(`${label}.${field} 必须是有效非负数`)
    }
    return value
  }
  if (TEXT_FIELDS.has(field)) {
    if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > 65_535) {
      throw new LibraryRestorePreviewValidationError(`${label}.${field} 超出文本字段限制`)
    }
    return value
  }
  if (field === 'status') {
    if (typeof value !== 'string' || !RECORD_STATUS_VALUES.has(value)) {
      throw new LibraryRestorePreviewValidationError(`${label}.status 无效`)
    }
    return value
  }
  if (field === 'importReviewState') {
    if (typeof value !== 'string' || !REVIEW_STATE_VALUES.has(value)) {
      throw new LibraryRestorePreviewValidationError(`${label}.importReviewState 无效`)
    }
    return value
  }
  const maxLength = STRING_LIMITS[field]
  if (maxLength != null) {
    if (typeof value !== 'string' || value.length > maxLength) {
      throw new LibraryRestorePreviewValidationError(`${label}.${field} 超出 ${maxLength} 字符限制`)
    }
    if (['title', 'platform', 'externalId'].includes(field) && !value.trim()) {
      throw new LibraryRestorePreviewValidationError(`${label}.${field} 不能为空`)
    }
    return field === 'externalId' ? value.trim() : value
  }
  throw new LibraryRestorePreviewValidationError(`${label} 包含未知字段 ${field}`)
}

function prepareRecord(
  value: JsonObject,
  fields: readonly string[],
  label: string,
  overrides: Record<string, unknown> = {},
) {
  const requiredFields = fields === PLATFORM_PROFILE_FIELDS
    ? PLATFORM_PROFILE_REQUIRED_FIELDS
    : COMMON_REQUIRED_FIELDS
  const actualKeys = Object.keys(value).filter(key => key !== 'platformEntries').sort()
  const expectedKeys = [...fields].sort()
  if (actualKeys.length !== expectedKeys.length
    || actualKeys.some((key, index) => key !== expectedKeys[index])) {
    throw new LibraryRestorePreviewValidationError(`${label}字段不完整或包含未知字段`)
  }
  return Object.fromEntries(fields.map(field => [
    field,
    Object.prototype.hasOwnProperty.call(overrides, field)
      ? overrides[field]
      : parseRecordField(field, value[field], label, requiredFields),
  ]))
}

export function prepareAdditiveRestoreData(
  snapshot: ValidatedLibraryExportSnapshot,
  currentRecords: LibraryExportRecords,
) {
  const plan = buildLibraryRestoreExecutionPlan(snapshot, currentRecords)
  const movies = plan.records.movies.map((record, index) => (
    prepareRecord(record, MOVIE_FIELDS, `电影 ${index + 1}`) as unknown as Prisma.MovieCreateManyInput
  ))
  const tvShows = plan.records.tvShows.map((record, index) => (
    prepareRecord(record, TV_SHOW_FIELDS, `剧集 ${index + 1}`) as unknown as Prisma.TvShowCreateManyInput
  ))
  const games = plan.records.games.map((record, index) => (
    prepareRecord(record, GAME_FIELDS, `游戏 ${index + 1}`) as unknown as Prisma.GameCreateManyInput
  ))
  const platformProfiles = plan.records.platformProfiles.map((record, index) => {
    const snapshotGameId = parseBigIntValue(record.gameId, `平台档案 ${index + 1}.gameId`).toString()
    const targetGameId = plan.gameIdMap.get(snapshotGameId)
    if (!targetGameId) {
      throw new LibraryRestoreConflictError(`平台档案 ${record.id} 的游戏记录存在冲突`)
    }
    return prepareRecord(
      record,
      PLATFORM_PROFILE_FIELDS,
      `平台档案 ${index + 1}`,
      { gameId: BigInt(targetGameId) },
    ) as unknown as Prisma.GamePlatformEntryCreateManyInput
  })
  const protectedDoubanCreates = [
    ...plan.records.movies,
    ...plan.records.tvShows,
  ].filter(record => typeof record.doubanId === 'string' && record.doubanId.trim()).length

  return {
    plan,
    data: { movies, tvShows, games, platformProfiles },
    counts: {
      movies: movies.length,
      tvShows: tvShows.length,
      games: games.length,
      platformProfiles: platformProfiles.length,
      total: movies.length + tvShows.length + games.length + platformProfiles.length,
      protectedDoubanCreates,
    },
  }
}

function restorePlanResponse(prepared: ReturnType<typeof prepareAdditiveRestoreData>) {
  return {
    mode: 'additive' as const,
    canApply: !prepared.plan.preview.hasConflicts && prepared.counts.total > 0,
    willCreate: prepared.counts,
    willNotOverwrite: prepared.plan.preview.comparison.summary.different,
    willPreserveCurrentOnly: prepared.plan.preview.comparison.summary.currentOnly,
  }
}

export async function previewAdditiveLibraryRestoreSnapshot(contents: Buffer | string) {
  const snapshot = parseLibraryRestoreSnapshot(contents)
  const currentRecords = await readLibraryExportRecords()
  const prepared = prepareAdditiveRestoreData(snapshot, currentRecords)
  const restorePlan = restorePlanResponse(prepared)
  const confirmation = restorePlan.canApply
    ? confirmationStore.create(snapshot.integrity.recordsSha256, prepared.plan.currentFingerprint)
    : null
  return {
    ...prepared.plan.preview,
    restorePlan,
    confirmation,
  }
}

export async function writeRestoreSafetyBackup(
  records: LibraryExportRecords,
  createdAt = new Date(),
  directory = RESTORE_BACKUP_DIRECTORY,
) {
  const timestamp = createdAt.toISOString().replace(/[:.]/g, '-')
  const filename = `pixelreel-pre-restore-${timestamp}-${randomBytes(4).toString('hex')}.json`
  const destination = path.join(directory, filename)
  const temporary = `${destination}.${randomBytes(4).toString('hex')}.tmp`
  const snapshot = buildLibraryExportSnapshot(records, createdAt)
  await fs.mkdir(directory, { recursive: true, mode: 0o700 })
  await fs.chmod(directory, 0o700)
  try {
    await fs.writeFile(temporary, serializeLibraryExportSnapshot(snapshot), {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600,
    })
    await fs.rename(temporary, destination)
    await fs.chmod(destination, 0o600)
  } catch (error) {
    await fs.unlink(temporary).catch(() => undefined)
    throw error
  }
  return directory === RESTORE_BACKUP_DIRECTORY
    ? path.posix.join('data/restore-backups', filename)
    : destination
}

async function createManyIfNeeded(
  createMany: (args: { data: any[] }) => Promise<unknown>,
  data: any[],
) {
  if (data.length > 0) await createMany({ data })
}

async function applyAdditiveRestore(
  snapshot: ValidatedLibraryExportSnapshot,
  expectedFingerprint: string,
  backupPath: string,
  restoredAt: Date,
) {
  return getDb().$transaction(async transaction => {
    const currentRecords = await readLibraryExportRecordsFromClient(transaction)
    const currentFingerprint = calculateLibraryRecordsSha256(currentRecords)
    if (currentFingerprint !== expectedFingerprint) {
      throw new LibraryRestoreConflictError('当前资料库在确认后发生变化，请重新生成恢复预览')
    }
    const prepared = prepareAdditiveRestoreData(snapshot, currentRecords)
    if (prepared.plan.preview.hasConflicts) {
      throw new LibraryRestoreConflictError('恢复预览存在身份冲突，不能执行增量恢复')
    }
    if (prepared.counts.total === 0) {
      throw new LibraryRestoreConflictError('没有可补回的快照独有记录')
    }

    await createManyIfNeeded(args => transaction.movie.createMany(args), prepared.data.movies)
    await createManyIfNeeded(args => transaction.tvShow.createMany(args), prepared.data.tvShows)
    await createManyIfNeeded(args => transaction.game.createMany(args), prepared.data.games)
    await createManyIfNeeded(
      args => transaction.gamePlatformEntry.createMany(args),
      prepared.data.platformProfiles,
    )
    const afterRecords = await readLibraryExportRecordsFromClient(transaction)
    const afterFingerprint = calculateLibraryRecordsSha256(afterRecords)
    await transaction.activityLog.create({
      data: {
        action: 'RESTORE',
        entityType: 'LIBRARY',
        entityId: null,
        entityTitle: '资料库增量恢复',
        metadata: {
          mode: 'additive',
          backupPath,
          snapshotHash: snapshot.integrity.recordsSha256,
          beforeFingerprint: expectedFingerprint,
          afterFingerprint,
          completedAt: restoredAt.toISOString(),
          restored: prepared.counts,
          skippedDifferent: prepared.plan.preview.comparison.summary.different,
          preservedCurrentOnly: prepared.plan.preview.comparison.summary.currentOnly,
        } as unknown as Prisma.InputJsonValue,
      },
    })
    return { prepared, afterFingerprint }
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 10_000,
    timeout: 120_000,
  })
}

export async function restoreAdditiveLibrarySnapshot(contents: Buffer | string, confirmationToken: string) {
  if (restoreInProgress) {
    throw new LibraryRestoreConflictError('已有资料库恢复正在执行')
  }
  restoreInProgress = true
  try {
    const snapshot = parseLibraryRestoreSnapshot(contents)
    const currentRecords = await readLibraryExportRecords()
    const prepared = prepareAdditiveRestoreData(snapshot, currentRecords)
    if (prepared.plan.preview.hasConflicts) {
      throw new LibraryRestoreConflictError('恢复预览存在身份冲突，请先处理冲突')
    }
    if (prepared.counts.total === 0) {
      throw new LibraryRestoreConflictError('没有可补回的快照独有记录')
    }
    confirmationStore.consume(
      confirmationToken,
      snapshot.integrity.recordsSha256,
      prepared.plan.currentFingerprint,
    )
    const restoredAt = new Date()
    const backupPath = await writeRestoreSafetyBackup(currentRecords, restoredAt)
    const result = await applyAdditiveRestore(
      snapshot,
      prepared.plan.currentFingerprint,
      backupPath,
      restoredAt,
    )
    return {
      success: true,
      mode: 'additive' as const,
      restored: result.prepared.counts,
      skippedDifferent: result.prepared.plan.preview.comparison.summary.different,
      preservedCurrentOnly: result.prepared.plan.preview.comparison.summary.currentOnly,
      backupPath,
      afterFingerprint: result.afterFingerprint,
      completedAt: restoredAt.toISOString(),
    }
  } finally {
    restoreInProgress = false
  }
}
