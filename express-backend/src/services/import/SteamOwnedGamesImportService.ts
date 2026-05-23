import axios from 'axios';
import { config } from '../../config';
import { getDb } from '../../config/db';
import { ImportSummary } from '../../dto/import-summary';
import { RecordStatus } from '../../enums/RecordStatus';

// Steam 已购游戏导入服务，与 Java 端 SteamOwnedGamesImportService 完全对齐
export async function importSteamOwnedGames(steamId?: string | null, status?: string | null): Promise<ImportSummary> {
  const summary: ImportSummary = { total: 0, imported: 0, skipped: 0, errors: [] };

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
    response = await axios.get(`${config.steam.baseUrl}/IPlayerService/GetOwnedGames/v0001/`, {
      params: {
        key: config.steam.apiKey,
        steamid: effectiveSteamId,
        include_appinfo: 1,
      },
    });
  } catch (ex: any) {
    summary.errors.push(`Steam API 调用失败: ${ex.message}`);
    return summary;
  }

  const games = response?.data?.response?.games ?? [];
  summary.total = games.length;

  // 批量查已有记录
  const steamAppIds = games.map((g: any) => g.appid).filter(Boolean);
  const existingMap = steamAppIds.length > 0
    ? new Map((await getDb().game.findMany({ where: { steamAppId: { in: steamAppIds } } })).map((g) => [Number(g.steamAppId!), g]))
    : new Map<any, any>();

  const effectiveStatus = status || RecordStatus.WANT;

  const toSave: any[] = [];
  for (const owned of games) {
    if (!owned.appid || existingMap.has(owned.appid)) {
      summary.skipped++;
      continue;
    }

    toSave.push({
      steamAppId: owned.appid,
      title: owned.name || '',
      posterUrl: `https://cdn.akamai.steamstatic.com/steam/apps/${owned.appid}/library_600x900.jpg`,
      playtimeMinutes: owned.playtime_forever ?? null,
      status: effectiveStatus,
      rating: null,
      shortReview: '',
    });
  }

  if (toSave.length > 0) {
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

  const games: any[] = response?.data?.response?.games ?? [];
  const apiMap = new Map(games.map((g) => [g.appid, g]));

  const existing = await getDb().game.findMany({ where: { steamAppId: { not: null } } });
  let updated = 0;

  for (const record of existing) {
    const apiData = apiMap.get(Number(record.steamAppId!));
    if (!apiData) continue;

    const posterUrl = `https://cdn.akamai.steamstatic.com/steam/apps/${record.steamAppId}/library_600x900.jpg`;
    const playtime = apiData.playtime_forever ?? null;

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