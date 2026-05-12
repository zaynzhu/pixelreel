import axios from 'axios';
import { config } from '../../config';
import { prisma } from '../../config/db';
import { ImportSummary } from '../../dto/import-summary';
import { RecordStatus } from '../../enums/RecordStatus';

// Xbox 已玩游戏导入服务，与 Java 端 OpenXblImportService 完全对齐
export async function importXboxOwnedGames(gamertag: string, status?: string | null): Promise<ImportSummary> {
  const summary: ImportSummary = { total: 0, imported: 0, skipped: 0, errors: [] };

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
  try {
    const searchRes = await axios.get(`${config.openxbl.baseUrl}/search/${gamertag.trim()}`, {
      headers: { 'X-Authorization': config.openxbl.apiKey },
    });
    // 尝试从返回数据中提取 xuid
    xuid = extractXuid(searchRes.data);
  } catch (ex: any) {
    summary.errors.push(`Xbox 用户搜索失败: ${ex.message}`);
    return summary;
  }

  if (!xuid) {
    summary.errors.push('无法从 OpenXBL 搜索结果解析 XUID');
    return summary;
  }

  // 2. 获取游戏列表
  let titleHistory: any[] = [];
  try {
    const titleRes = await axios.get(`${config.openxbl.baseUrl}/player/titleHistory/${xuid}`, {
      headers: { 'X-Authorization': config.openxbl.apiKey },
    });
    titleHistory = parseXboxTitles(titleRes.data);
  } catch (ex: any) {
    summary.errors.push(`获取 Xbox 游戏列表失败: ${ex.message}`);
    return summary;
  }

  // 3. 获取成就统计
  let achievementStats: Map<string, { total: number | null; unlocked: number | null }> = new Map();
  try {
    const achRes = await axios.get(`${config.openxbl.baseUrl}/achievements/player/${xuid}`, {
      headers: { 'X-Authorization': config.openxbl.apiKey },
    });
    achievementStats = parseXboxAchievements(achRes.data);
  } catch {
    summary.errors.push('获取成就统计失败，已跳过成就数据');
  }

  summary.total = titleHistory.length;
  const effectiveStatus = status || RecordStatus.UNSET;
  const now = new Date();

  // 批量查已有记录
  const xboxIds = titleHistory.map((t) => t.titleId).filter(Boolean);
  const existingMap = xboxIds.length > 0
    ? new Map((await prisma.game.findMany({ where: { xboxId: { in: xboxIds } } })).map((g) => [g.xboxId!, g]))
    : new Map<any, any>();

  const toSave: any[] = [];
  for (const title of titleHistory) {
    if (!title.titleId) {
      summary.errors.push(`缺少 Xbox titleId，已跳过: ${title.name || '未知游戏'}`);
      summary.skipped++;
      continue;
    }
    if (!title.name) {
      summary.errors.push(`缺少游戏名称，已跳过: ${title.titleId}`);
      summary.skipped++;
      continue;
    }
    if (existingMap.has(title.titleId)) {
      summary.skipped++;
      continue;
    }

    const stats = achievementStats.get(title.titleId);
    toSave.push({
      xboxId: title.titleId,
      title: title.name,
      posterUrl: title.posterUrl || null,
      platform: 'XBOX',
      playtimeMinutes: title.playtimeMinutes || null,
      achievementTotal: stats?.total ?? null,
      achievementUnlocked: stats?.unlocked ?? null,
      importedAt: now,
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

function extractXuid(data: any): string | null {
  if (!data) return null;
  if (typeof data === 'object') {
    // 尝试多种结构
    if (data.xuid) return String(data.xuid);
    if (data.Xuid) return String(data.Xuid);
    if (Array.isArray(data)) {
      for (const item of data) {
        const found = extractXuid(item);
        if (found) return found;
      }
    } else {
      for (const val of Object.values(data)) {
        if (typeof val === 'object' && val !== null) {
          const found = extractXuid(val);
          if (found) return found;
        }
      }
    }
  }
  return null;
}

function parseXboxTitles(data: any): any[] {
  if (!data) return [];
  // 尝试从多种结构中提取游戏列表
  let array = data?.titles || data?.titleHistory || data?.data || data?.items;
  if (!Array.isArray(array)) {
    // 遍历对象寻找包含 titleId 的数组
    for (const val of Object.values(data || {})) {
      if (Array.isArray(val) && val.length > 0 && val[0]?.titleId) {
        array = val;
        break;
      }
    }
  }
  if (!Array.isArray(array)) return [];

  return array.map((item: any) => ({
    titleId: item.titleId || item.titleID || item.id || item.title_id || null,
    name: item.name || item.title || item.displayName || item.game || null,
    posterUrl: item.displayImage || item.displayImageUrl || item.image || item.imageUrl || item.boxArt || item.boxArtUrl || null,
    playtimeMinutes: item.playtimeMinutes || item.minutesPlayed || item.timePlayedMinutes || item.minutes || null,
  })).filter((t: any) => t.titleId || t.name);
}

function parseXboxAchievements(data: any): Map<string, { total: number | null; unlocked: number | null }> {
  const map = new Map<string, { total: number | null; unlocked: number | null }>();
  if (!data) return map;

  let array = data?.titles || data?.data || data?.items;
  if (!Array.isArray(array)) {
    for (const val of Object.values(data || {})) {
      if (Array.isArray(val) && val.length > 0 && val[0]?.titleId) {
        array = val;
        break;
      }
    }
  }
  if (!Array.isArray(array)) return map;

  for (const item of array) {
    const titleId = String(item.titleId || item.titleID || item.id || item.title_id || '');
    if (!titleId) continue;

    const stats = item.achievement || item.achievements || item.stats || item.progress;
    let total: number | null = null;
    let unlocked: number | null = null;

    if (stats && typeof stats === 'object') {
      total = stats.totalAchievements ?? stats.total ?? stats.achievementTotal ?? null;
      unlocked = stats.currentAchievements ?? stats.unlockedAchievements ?? stats.achievementUnlocked ?? stats.earned ?? null;
    }

    if (total !== null || unlocked !== null) {
      map.set(titleId, { total, unlocked });
    }
  }

  return map;
}