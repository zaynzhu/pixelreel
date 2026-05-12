import axios from 'axios';
import { config } from '../../config';
import { prisma } from '../../config/db';
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
    ? new Map((await prisma.game.findMany({ where: { steamAppId: { in: steamAppIds } } })).map((g) => [g.steamAppId!, g]))
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
      posterUrl: owned.img_logo_url
        ? `https://media.steampowered.com/steamcommunity/public/images/apps/${owned.appid}/${owned.img_logo_url}.jpg`
        : null,
      status: effectiveStatus,
      rating: null,
      shortReview: '',
    });
  }

  if (toSave.length > 0) {
    await prisma.game.createMany({ data: toSave });
    summary.imported = toSave.length;
  }

  return summary;
}