import axios from 'axios';
import * as cheerio from 'cheerio';
import { config } from '../../config';
import { prisma } from '../../config/db';
import { ImportSummary } from '../../dto/import-summary';
import { RecordStatus } from '../../enums/RecordStatus';

// PSNProfile 爬取导入服务，与 Java 端 PsnProfilesImportService 完全对齐
export async function importPsnOwnedGames(psnId: string, status?: string | null): Promise<ImportSummary> {
  const summary: ImportSummary = { total: 0, imported: 0, skipped: 0, errors: [] };

  if (!config.psnProfiles.enabled) {
    summary.errors.push('PSNProfiles 未启用');
    return summary;
  }
  if (!psnId) {
    summary.errors.push('缺少 PSN ID');
    return summary;
  }

  let html: string | null = null;
  try {
    const response = await axios.get(`${config.psnProfiles.baseUrl}/${psnId.trim()}`, {
      headers: {
        'User-Agent': config.psnProfiles.userAgent,
        ...(config.psnProfiles.cookie ? { Cookie: config.psnProfiles.cookie } : {}),
      },
    });
    html = response.data;
  } catch (ex: any) {
    summary.errors.push(`无法获取 PSNProfiles 页面: ${ex.message}`);
    return summary;
  }

  if (!html) {
    summary.errors.push('无法获取 PSNProfiles 页面内容');
    return summary;
  }

  const games = parsePsnGames(html);
  summary.total = games.length;

  const psnIds = games.map((g) => g.psnId).filter(Boolean) as string[];
  const existingMap = psnIds.length > 0
    ? new Map((await prisma.game.findMany({ where: { psnId: { in: psnIds } } })).map((g) => [g.psnId!, g]))
    : new Map<string, any>();

  const effectiveStatus = status || RecordStatus.UNSET;
  const now = new Date();
  const toSave: any[] = [];

  for (const game of games) {
    if (!game.psnId) {
      summary.errors.push(`缺少 PSN 游戏 ID，已跳过: ${game.title || '未知游戏'}`);
      summary.skipped++;
      continue;
    }
    if (!game.title) {
      summary.errors.push(`缺少游戏名称，已跳过: ${game.psnId}`);
      summary.skipped++;
      continue;
    }
    if (existingMap.has(game.psnId)) {
      summary.skipped++;
      continue;
    }

    toSave.push({
      psnId: game.psnId,
      title: game.title,
      posterUrl: game.posterUrl || null,
      platform: 'PSN',
      achievementTotal: game.achievementTotal || null,
      achievementUnlocked: game.achievementUnlocked || null,
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

interface PsnGame {
  psnId: string | null;
  title: string | null;
  posterUrl: string | null;
  achievementTotal: number | null;
  achievementUnlocked: number | null;
}

function parsePsnGames(html: string): PsnGame[] {
  const $ = cheerio.load(html);
  const results: PsnGame[] = [];
  const seenIds = new Set<string>();

  $('a[href*="/trophies/"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const psnId = extractPsnGameId(href);
    if (!psnId || seenIds.has(psnId)) return;
    seenIds.add(psnId);

    const row = $(el).closest('tr').length ? $(el).closest('tr') : ($(el).closest('li').length ? $(el).closest('li') : $(el).parent());
    const title = extractTitle($, $(el), row);
    const posterUrl = extractPosterUrl($, row);
    const progress = extractTrophyProgress($, row);

    results.push({
      psnId,
      title,
      posterUrl,
      achievementTotal: progress.total,
      achievementUnlocked: progress.unlocked,
    });
  });

  return results;
}

function extractPsnGameId(href: string): string | null {
  if (!href) return null;
  const idx = href.indexOf('/trophies/');
  if (idx < 0) return null;
  let tail = href.substring(idx + 10);
  if (tail.startsWith('/')) tail = tail.substring(1);
  const slash = tail.indexOf('/');
  const id = slash > 0 ? tail.substring(0, slash) : tail;
  return id || null;
}

function extractTitle($: any, link: any, row: any): string | null {
  let title = link.text().trim() || null;
  if (!title) title = link.attr('title') || null;
  if (!title && row.length) {
    const titleEl = row.find('.title, .game-title, .title a, .title span').first();
    if (titleEl.length) title = titleEl.text().trim() || null;
  }
  if (!title && row.length) {
    const img = row.find('img[alt]').first();
    if (img.length) title = img.attr('alt')?.trim() || null;
  }
  return title;
}

function extractPosterUrl($: any, row: any): string | null {
  if (!row.length) return null;
  const img = row.find('img').first();
  if (!img.length) return null;
  const url = img.attr('data-src') || img.attr('data-lazy-src') || img.attr('src');
  if (!url) return null;
  if (url.startsWith('//')) return 'https:' + url;
  return url;
}

function extractTrophyProgress($: any, row: any): { total: number | null; unlocked: number | null } {
  if (!row.length) return { total: null, unlocked: null };

  // 尝试 data-earned/data-total 属性
  const dataNode = row.find('[data-earned][data-total]').first();
  if (dataNode.length) {
    const earned = parseInt(dataNode.attr('data-earned') || '');
    const total = parseInt(dataNode.attr('data-total') || '');
    if (!isNaN(earned) || !isNaN(total)) {
      return { total: isNaN(total) ? null : total, unlocked: isNaN(earned) ? null : earned };
    }
  }

  // 尝试文本中的 X/Y 格式
  const text = row.text();
  const match = text.match(/(\d+)\s*\/\s*(\d+)/);
  if (match) {
    return { total: parseInt(match[2]), unlocked: parseInt(match[1]) };
  }

  return { total: null, unlocked: null };
}