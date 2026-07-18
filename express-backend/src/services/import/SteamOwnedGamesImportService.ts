import axios from 'axios';
import { config } from '../../config';
import { getDb } from '../../config/db';
import { ImportSummary } from '../../dto/import-summary';
import { RecordStatus } from '../../enums/RecordStatus';
import { assertTaskActive } from './ImportSummaryTaskService';
import {
  buildPlatformGameMetricUpdate,
  hasPlatformGameMetricUpdate,
} from './PlatformGameSyncService';

interface SteamOwnedGame {
  appId: number;
  title: string;
  playtimeMinutes: number | null;
}

interface ParsedSteamOwnedGames {
  total: number;
  games: SteamOwnedGame[];
  skipped: number;
  errors: string[];
}

function parsePositiveSafeInteger(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function parsePlaytimeMinutes(value: unknown): number | null | undefined {
  if (value == null) return null;
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > 2_147_483_647) return undefined;
  return parsed;
}

export function parseSteamOwnedGamesResponse(data: unknown): ParsedSteamOwnedGames {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Steam API 返回的 response 不是对象');
  }
  const response = (data as { response?: unknown }).response;
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    throw new Error('Steam API 返回的 response 不是对象');
  }
  const rawGames = (response as { games?: unknown }).games;
  if (rawGames == null) return { total: 0, games: [], skipped: 0, errors: [] };
  if (!Array.isArray(rawGames)) throw new Error('Steam API 返回的 games 不是数组');

  const games: SteamOwnedGame[] = [];
  const errors: string[] = [];
  const seenAppIds = new Set<number>();
  let skipped = 0;

  for (const rawGame of rawGames) {
    const item = rawGame && typeof rawGame === 'object'
      ? rawGame as Record<string, unknown>
      : {};
    const appId = parsePositiveSafeInteger(item.appid);
    if (!appId) {
      skipped++;
      errors.push('Steam 响应包含无效 appid，已跳过');
      continue;
    }
    if (seenAppIds.has(appId)) {
      skipped++;
      errors.push(`Steam 响应包含重复 appid: ${appId}`);
      continue;
    }

    const title = typeof item.name === 'string' ? item.name.trim() : '';
    if (!title || title.length > 255) {
      skipped++;
      errors.push(`Steam appid ${appId} 缺少有效标题，已跳过`);
      continue;
    }

    seenAppIds.add(appId);
    const parsedPlaytime = parsePlaytimeMinutes(item.playtime_forever);
    if (parsedPlaytime === undefined) {
      errors.push(`Steam appid ${appId} 的游玩时长无效，已忽略`);
    }
    games.push({
      appId,
      title,
      playtimeMinutes: parsedPlaytime ?? null,
    });
  }

  return { total: rawGames.length, games, skipped, errors };
}

export function resolveSteamImportStatus(status: string | null | undefined, playtimeMinutes: number): string {
  return status || (playtimeMinutes > 0 ? RecordStatus.IN_PROGRESS : RecordStatus.WANT);
}

// Steam 已购游戏导入服务，与 Java 端 SteamOwnedGamesImportService 完全对齐
export async function importSteamOwnedGames(
  steamId?: string | null,
  status?: string | null,
  onProgress?: (processed: number, total: number, currentTitle: string) => void,
  signal?: AbortSignal,
): Promise<ImportSummary> {
  assertTaskActive(signal);
  const summary: ImportSummary = { total: 0, imported: 0, updated: 0, skipped: 0, errors: [] };

  if (!config.steam.apiKey) {
    summary.errors.push('缺少 Steam Web API Key');
    return summary;
  }

  const effectiveSteamId = steamId || config.steam.defaultSteamId;
  if (!effectiveSteamId) {
    summary.errors.push('缺少 Steam ID');
    return summary;
  }

  let response: any;
  try {
    assertTaskActive(signal);
    response = await axios.get(`${config.steam.baseUrl}/IPlayerService/GetOwnedGames/v0001/`, {
      params: {
        key: config.steam.apiKey,
        steamid: effectiveSteamId,
        include_appinfo: 1,
      },
      signal,
    });
  } catch (ex: any) {
    if (signal?.aborted) throw new Error('任务已取消');
    summary.errors.push(`Steam API 调用失败: ${ex.message}`);
    return summary;
  }

  let parsedResponse: ParsedSteamOwnedGames;
  try {
    parsedResponse = parseSteamOwnedGamesResponse(response?.data);
  } catch (error) {
    summary.errors.push(error instanceof Error ? error.message : 'Steam API 响应格式无效');
    return summary;
  }
  const games = parsedResponse.games;
  summary.total = parsedResponse.total;
  summary.skipped = parsedResponse.skipped;
  summary.errors.push(...parsedResponse.errors);

  // 批量查已有记录
  const steamAppIds = games.map(game => BigInt(game.appId));
  const existingMap = steamAppIds.length > 0
    ? new Map((await getDb().game.findMany({ where: { steamAppId: { in: steamAppIds } } })).map((g) => [Number(g.steamAppId!), g]))
    : new Map<any, any>();

  const toSave: any[] = [];
  for (const [index, owned] of games.entries()) {
    assertTaskActive(signal);
    onProgress?.(index + 1, games.length, owned.title);
    const existing = existingMap.get(owned.appId);
    if (existing) {
      const update = buildPlatformGameMetricUpdate(existing, {
        platform: 'STEAM',
        posterUrl: `https://cdn.akamai.steamstatic.com/steam/apps/${owned.appId}/header.jpg`,
        playtimeMinutes: owned.playtimeMinutes,
        achievementTotal: null,
        achievementUnlocked: null,
      });
      if (!hasPlatformGameMetricUpdate(update)) {
        summary.skipped++;
        continue;
      }
      await getDb().game.update({ where: { id: existing.id }, data: update });
      summary.updated = (summary.updated ?? 0) + 1;
      continue;
    }

    toSave.push({
      steamAppId: BigInt(owned.appId),
      title: owned.title,
      posterUrl: `https://cdn.akamai.steamstatic.com/steam/apps/${owned.appId}/header.jpg`,
      platform: 'STEAM',
      playtimeMinutes: owned.playtimeMinutes,
      importedAt: new Date(),
      importReviewState: 'PENDING',
      status: resolveSteamImportStatus(status, owned.playtimeMinutes ?? 0),
      rating: null,
      shortReview: null,
    });
  }

  if (toSave.length > 0) {
    assertTaskActive(signal);
    await getDb().game.createMany({ data: toSave });
    summary.imported = toSave.length;
  }

  return summary;
}

/**
 * 回填已有 Steam 游戏的海报和游玩时间。
 */
export async function backfillSteamData(): Promise<{ updated: number; errors: string[] }> {
  const errors: string[] = [];

  if (!config.steam.apiKey) {
    return { updated: 0, errors: ['缺少 Steam Web API Key'] };
  }
  if (!config.steam.defaultSteamId) {
    return { updated: 0, errors: ['缺少 Steam ID'] };
  }

  let response: any;
  try {
    response = await axios.get(`${config.steam.baseUrl}/IPlayerService/GetOwnedGames/v0001/`, {
      params: { key: config.steam.apiKey, steamid: config.steam.defaultSteamId, include_appinfo: 1 },
    });
  } catch (ex: any) {
    return { updated: 0, errors: [`Steam API 调用失败: ${ex.message}`] };
  }

  let parsedResponse: ParsedSteamOwnedGames;
  try {
    parsedResponse = parseSteamOwnedGamesResponse(response?.data);
  } catch (error) {
    return { updated: 0, errors: [error instanceof Error ? error.message : 'Steam API 响应格式无效'] };
  }
  errors.push(...parsedResponse.errors);
  const apiMap = new Map(parsedResponse.games.map(game => [game.appId, game]));

  const existing = await getDb().game.findMany({ where: { steamAppId: { not: null } } });
  let updated = 0;

  for (const record of existing) {
    const apiData = apiMap.get(Number(record.steamAppId!));
    if (!apiData) continue;

    const posterUrl = `https://cdn.akamai.steamstatic.com/steam/apps/${record.steamAppId}/header.jpg`;
    const playtime = apiData.playtimeMinutes;

    await getDb().game.update({
      where: { id: record.id },
      data: {
        posterUrl: record.posterUrl || posterUrl,
        playtimeMinutes: record.playtimeMinutes ?? playtime,
      },
    });
    updated++;
  }

  return { updated, errors };
}
