import axios from 'axios';
import { config } from '../../config';
import { getDb } from '../../config/db';
import { ImportSummary } from '../../dto/import-summary';
import { RecordStatus } from '../../enums/RecordStatus';
import { lookupRawgPosterUrl } from './RawgPosterLookupService';
import {
  buildPlatformGameRequestOptions,
  buildPlatformGameMetricUpdate,
  hasPlatformGameMetricUpdate,
  isPlatformGameExternalIdValid,
  isPlatformGameTitleValid,
  normalizePlatformGamePosterUrl,
  parsePlatformGameMetric,
  PLATFORM_GAME_EXTERNAL_ID_MAX_LENGTH,
  PLATFORM_GAME_TITLE_MAX_LENGTH,
} from './PlatformGameSyncService';

export interface XboxImportedTitle {
  titleId: string;
  name: string | null;
  posterUrl: string | null;
  playtimeMinutes: number | null;
  achievementTotal: number | null;
  achievementUnlocked: number | null;
}

type ImportProgress = (processed: number, total: number, currentTitle: string) => void;

// Xbox 已玩游戏导入服务，与 Java 端 OpenXblImportService 完全对齐
export async function importXboxOwnedGames(
  gamertag: string,
  status?: string | null,
  onProgress?: ImportProgress,
  signal?: AbortSignal,
): Promise<ImportSummary> {
  const summary: ImportSummary = { total: 0, imported: 0, updated: 0, skipped: 0, errors: [] };

  if (!config.openxbl.enabled) {
    summary.errors.push('OpenXBL 未启用');
    return summary;
  }
  if (!config.openxbl.apiKey) {
    summary.errors.push('缺少 OpenXBL API Key');
    return summary;
  }
  if (!gamertag) {
    summary.errors.push('缺少 Xbox Gamertag');
    return summary;
  }

  // 1. 通过 gamertag 查 XUID
  let xuid: string | null = null;
  onProgress?.(0, 0, '解析 Xbox 账号');
  try {
    const searchRes = await axios.get(buildOpenXblUrl(
      config.openxbl.baseUrl,
      `search/${encodeURIComponent(gamertag.trim())}`,
    ), {
      headers: { 'X-Authorization': config.openxbl.apiKey },
      ...buildPlatformGameRequestOptions(signal),
    });
    xuid = extractXuid(searchRes.data, gamertag.trim());
  } catch (ex: any) {
    if (signal?.aborted) return summary;
    summary.errors.push(`Xbox 用户搜索失败: ${ex.message}`);
    return summary;
  }

  if (!xuid) {
    summary.errors.push('OpenXBL 搜索结果中没有完全匹配的 Gamertag');
    return summary;
  }

  // 2. 获取游戏列表
  let titleHistory: XboxImportedTitle[] = [];
  try {
    onProgress?.(0, 0, '读取 Xbox 游戏库');
    const titleRes = await axios.get(buildOpenXblUrl(
      config.openxbl.baseUrl,
      `player/titleHistory/${encodeURIComponent(xuid)}`,
    ), {
      headers: { 'X-Authorization': config.openxbl.apiKey },
      ...buildPlatformGameRequestOptions(signal),
    });
    titleHistory = parseXboxTitles(titleRes.data);
  } catch (ex: any) {
    if (signal?.aborted) return summary;
    summary.errors.push(`获取 Xbox 游戏列表失败: ${ex.message}`);
    return summary;
  }

  summary.total = titleHistory.length;
  const effectiveStatus = status || RecordStatus.UNSET;
  const now = new Date();

  // 批量查已有记录
  const xboxIds = titleHistory.map((t) => t.titleId).filter(Boolean);
  const existingMap = xboxIds.length > 0
    ? new Map((await getDb().game.findMany({ where: { xboxId: { in: xboxIds } } })).map((g) => [g.xboxId!, g]))
    : new Map<any, any>();

  const toSave: any[] = [];
  for (const [index, title] of titleHistory.entries()) {
    if (signal?.aborted) return summary;
    onProgress?.(index + 1, summary.total, title.name || title.titleId);
    if (!title.titleId) {
      summary.errors.push(`缺少 Xbox titleId，已跳过: ${title.name || '未知游戏'}`);
      summary.skipped++;
      continue;
    }
    if (!isPlatformGameExternalIdValid(title.titleId)) {
      summary.errors.push(`Xbox titleId 超过 ${PLATFORM_GAME_EXTERNAL_ID_MAX_LENGTH} 个字符，已跳过: ${title.name || '未知游戏'}`);
      summary.skipped++;
      continue;
    }
    if (!title.name) {
      summary.errors.push(`缺少游戏名称，已跳过: ${title.titleId}`);
      summary.skipped++;
      continue;
    }
    if (!isPlatformGameTitleValid(title.name)) {
      summary.errors.push(`Xbox 游戏标题超过 ${PLATFORM_GAME_TITLE_MAX_LENGTH} 个字符，已跳过: ${title.titleId}`);
      summary.skipped++;
      continue;
    }
    const sourcePosterUrl = normalizePlatformGamePosterUrl(title.posterUrl);
    if (title.posterUrl && !sourcePosterUrl) {
      summary.errors.push(`Xbox 封面 URL 超过字段长度，已改用回退封面: ${title.name}`);
    }
    const existing = existingMap.get(title.titleId);
    if (existing) {
      const posterUrl = existing.posterUrl
        ? null
        : sourcePosterUrl ?? await lookupRawgPosterUrl(title.name, signal);
      if (signal?.aborted) return summary;
      const update = buildPlatformGameMetricUpdate(existing, {
        platform: 'XBOX',
        posterUrl,
        playtimeMinutes: title.playtimeMinutes,
        achievementTotal: title.achievementTotal,
        achievementUnlocked: title.achievementUnlocked,
      });
      if (!hasPlatformGameMetricUpdate(update)) {
        summary.skipped++;
        continue;
      }
      await getDb().game.update({ where: { id: existing.id }, data: update });
      summary.updated = (summary.updated ?? 0) + 1;
      continue;
    }

    const posterUrl = sourcePosterUrl
      ?? await lookupRawgPosterUrl(title.name, signal);
    if (signal?.aborted) return summary;

    toSave.push({
      xboxId: title.titleId,
      title: title.name,
      posterUrl,
      platform: 'XBOX',
      playtimeMinutes: title.playtimeMinutes,
      achievementTotal: title.achievementTotal,
      achievementUnlocked: title.achievementUnlocked,
      importedAt: now,
      importReviewState: 'PENDING',
      status: effectiveStatus,
      rating: null,
      shortReview: '',
    });
  }

  if (signal?.aborted) return summary;
  if (toSave.length > 0) {
    await getDb().game.createMany({ data: toSave });
    summary.imported = toSave.length;
  }
  onProgress?.(summary.total, summary.total, '');

  return summary;
}

export function extractXuid(data: unknown, expectedGamertag?: string): string | null {
  const normalizedExpected = expectedGamertag
    ? normalizeXboxGamertag(expectedGamertag)
    : null;
  return findXboxXuid(data, normalizedExpected);
}

function findXboxXuid(data: unknown, normalizedExpected: string | null): string | null {
  if (!data || typeof data !== 'object') return null;
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findXboxXuid(item, normalizedExpected);
      if (found) return found;
    }
    return null;
  }

  const record = data as Record<string, unknown>;
  const modernGamertag = readString(record.modernGamertag ?? record.ModernGamertag);
  const modernGamertagSuffix = readString(
    record.modernGamertagSuffix ?? record.ModernGamertagSuffix,
  );
  const returnedGamertags = [
    readString(record.gamertag ?? record.Gamertag),
    readString(record.uniqueModernGamertag ?? record.UniqueModernGamertag),
    modernGamertag,
    modernGamertag && modernGamertagSuffix
      ? `${modernGamertag}#${modernGamertagSuffix}`
      : null,
  ].filter((value): value is string => value != null);
  if (normalizedExpected == null
    || returnedGamertags.some(gamertag => normalizeXboxGamertag(gamertag) === normalizedExpected)) {
    const xuid = parseXboxXuid(record.xuid) ?? parseXboxXuid(record.Xuid);
    if (xuid) return xuid;
  }
  for (const value of Object.values(record)) {
    const found = findXboxXuid(value, normalizedExpected);
    if (found) return found;
  }
  return null;
}

function normalizeXboxGamertag(value: string): string {
  return value.trim().normalize('NFKC').toLocaleLowerCase('en-US');
}

export function buildOpenXblUrl(baseUrl: string, resourcePath: string): string {
  return `${baseUrl.replace(/\/+$/, '')}/${resourcePath.replace(/^\/+/, '')}`;
}

function parseXboxXuid(value: unknown): string | null {
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value <= 0)) return null;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const normalized = String(value).trim();
  return /^[1-9]\d{0,19}$/.test(normalized) ? normalized : null;
}

export function parseXboxTitles(data: unknown): XboxImportedTitle[] {
  const array = findXboxTitleArray(data);
  if (!array) throw new Error('OpenXBL 返回的游戏列表格式无效');
  const seenTitleIds = new Set<string>();
  return array.flatMap((value) => {
    if (!value || typeof value !== 'object') return [];
    const item = value as Record<string, unknown>;
    const type = readString(item.type);
    if (type && type.toLowerCase() !== 'game') return [];

    const titleId = readString(item.titleId ?? item.titleID ?? item.id ?? item.title_id);
    if (!titleId || seenTitleIds.has(titleId)) return [];
    seenTitleIds.add(titleId);
    const statsValue = item.achievement ?? item.achievements ?? item.stats ?? item.progress;
    const stats = statsValue && typeof statsValue === 'object'
      ? statsValue as Record<string, unknown>
      : {};
    return [{
      titleId,
      name: readString(item.name ?? item.title ?? item.displayName ?? item.game),
      posterUrl: readString(
        item.displayImage ?? item.displayImageUrl ?? item.image
        ?? item.imageUrl ?? item.boxArt ?? item.boxArtUrl,
      ),
      playtimeMinutes: parsePlatformGameMetric(
        item.playtimeMinutes ?? item.minutesPlayed ?? item.timePlayedMinutes ?? item.minutes,
      ),
      achievementTotal: parsePlatformGameMetric(
        stats.totalAchievements ?? stats.total ?? stats.achievementTotal,
      ),
      achievementUnlocked: parsePlatformGameMetric(
        stats.currentAchievements ?? stats.unlockedAchievements
        ?? stats.achievementUnlocked ?? stats.earned,
      ),
    }];
  });
}

function findXboxTitleArray(data: unknown): unknown[] | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  const content = record.content && typeof record.content === 'object'
    ? record.content as Record<string, unknown>
    : record;
  const direct = content.titles ?? content.titleHistory ?? content.data ?? content.items;
  if (Array.isArray(direct)) return direct;
  for (const value of Object.values(content)) {
    if (Array.isArray(value) && value.some(item => (
      item && typeof item === 'object'
      && ('titleId' in item || 'titleID' in item)
    ))) return value;
  }
  return null;
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const normalized = String(value).trim();
  return normalized || null;
}
