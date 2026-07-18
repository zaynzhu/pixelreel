import axios from 'axios';
import * as cheerio from 'cheerio';
import { config } from '../../config';
import { getDb } from '../../config/db';
import { ImportSummary } from '../../dto/import-summary';
import { RecordStatus } from '../../enums/RecordStatus';
import { lookupRawgPosterUrl } from './RawgPosterLookupService';
import {
  buildPlatformGameMetricUpdate,
  hasPlatformGameMetricUpdate,
  isPlatformGameExternalIdValid,
  isPlatformGameTitleValid,
  normalizePlatformGamePosterUrl,
  PLATFORM_GAME_EXTERNAL_ID_MAX_LENGTH,
  PLATFORM_GAME_TITLE_MAX_LENGTH,
} from './PlatformGameSyncService';

type ImportProgress = (processed: number, total: number, currentTitle: string) => void;
const MAX_PROFILE_PAGES = 100;

export interface PsnProfilePage {
  html: string;
  hasNext: boolean;
}

// PSNProfile 爬取导入服务，与 Java 端 PsnProfilesImportService 完全对齐
export async function importPsnOwnedGames(
  psnId: string,
  status?: string | null,
  onProgress?: ImportProgress,
  signal?: AbortSignal,
): Promise<ImportSummary> {
  const summary: ImportSummary = { total: 0, imported: 0, updated: 0, skipped: 0, errors: [] };

  if (!config.psnProfiles.enabled) {
    summary.errors.push('PSNProfiles 未启用');
    return summary;
  }
  if (!psnId) {
    summary.errors.push('缺少 PSN ID');
    return summary;
  }

  let html: string;
  try {
    html = await fetchPsnProfileHtml(psnId.trim(), onProgress, signal);
  } catch (ex: any) {
    if (signal?.aborted) return summary;
    summary.errors.push(`无法获取 PSNProfiles 页面: ${ex.message}`);
    return summary;
  }

  const games = parsePsnGames(html);
  summary.total = games.length;

  const psnIds = games.map((g) => g.psnId).filter(Boolean) as string[];
  const existingMap = psnIds.length > 0
    ? new Map((await getDb().game.findMany({ where: { psnId: { in: psnIds } } })).map((g) => [g.psnId!, g]))
    : new Map<string, any>();

  const effectiveStatus = status || RecordStatus.UNSET;
  const now = new Date();
  const toSave: any[] = [];

  for (const [index, game] of games.entries()) {
    if (signal?.aborted) return summary;
    onProgress?.(index + 1, summary.total, game.title || game.psnId || '未知游戏');
    if (!game.psnId) {
      summary.errors.push(`缺少 PSN 游戏 ID，已跳过: ${game.title || '未知游戏'}`);
      summary.skipped++;
      continue;
    }
    if (!isPlatformGameExternalIdValid(game.psnId)) {
      summary.errors.push(`PSN 游戏 ID 超过 ${PLATFORM_GAME_EXTERNAL_ID_MAX_LENGTH} 个字符，已跳过: ${game.title || '未知游戏'}`);
      summary.skipped++;
      continue;
    }
    if (!game.title) {
      summary.errors.push(`缺少游戏名称，已跳过: ${game.psnId}`);
      summary.skipped++;
      continue;
    }
    if (!isPlatformGameTitleValid(game.title)) {
      summary.errors.push(`PSN 游戏标题超过 ${PLATFORM_GAME_TITLE_MAX_LENGTH} 个字符，已跳过: ${game.psnId}`);
      summary.skipped++;
      continue;
    }
    const sourcePosterUrl = normalizePlatformGamePosterUrl(game.posterUrl);
    if (game.posterUrl && !sourcePosterUrl) {
      summary.errors.push(`PSN 封面 URL 超过字段长度，已改用回退封面: ${game.title}`);
    }
    const existing = existingMap.get(game.psnId);
    if (existing) {
      const posterUrl = existing.posterUrl
        ? null
        : sourcePosterUrl ?? await lookupRawgPosterUrl(game.title, signal);
      if (signal?.aborted) return summary;
      const update = buildPlatformGameMetricUpdate(existing, {
        platform: 'PSN',
        posterUrl,
        playtimeMinutes: null,
        achievementTotal: game.achievementTotal,
        achievementUnlocked: game.achievementUnlocked,
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
      ?? await lookupRawgPosterUrl(game.title, signal);
    if (signal?.aborted) return summary;

    toSave.push({
      psnId: game.psnId,
      title: game.title,
      posterUrl,
      platform: 'PSN',
      achievementTotal: game.achievementTotal,
      achievementUnlocked: game.achievementUnlocked,
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

export interface PsnGame {
  psnId: string | null;
  title: string | null;
  posterUrl: string | null;
  achievementTotal: number | null;
  achievementUnlocked: number | null;
}

async function fetchPsnProfileHtml(
  psnId: string,
  onProgress?: ImportProgress,
  signal?: AbortSignal,
): Promise<string> {
  const baseUrl = config.psnProfiles.baseUrl.replace(/\/+$/, '');
  return collectPsnProfilePages(async (page) => {
    try {
      const response = await axios.get(`${baseUrl}/${encodeURIComponent(psnId)}`, {
        params: { ajax: 1, page },
        headers: {
          'User-Agent': config.psnProfiles.userAgent,
          ...(config.psnProfiles.cookie ? { Cookie: config.psnProfiles.cookie } : {}),
        },
        signal,
      });
      return response.data;
    } catch (error) {
      const response = axios.isAxiosError(error) ? error.response : undefined;
      if (isPsnProfilesChallengeResponse(response?.status, response?.data)) {
        throw new Error('PSNProfiles 访问被验证页面拦截，请更新 Cookie');
      }
      throw error;
    }
  }, MAX_PROFILE_PAGES, (page) => {
    onProgress?.(0, 0, `读取 PSNProfiles 第 ${page} 页`);
  });
}

export async function collectPsnProfilePages(
  fetchPage: (page: number) => Promise<unknown>,
  maxPages: number,
  onPage?: (page: number) => void,
): Promise<string> {
  const chunks: string[] = [];
  for (let page = 1; page <= maxPages; page++) {
    onPage?.(page);
    const parsed = parsePsnProfilePage(await fetchPage(page));
    if (!parsed.html.trim()) throw new Error('PSNProfiles 返回空页面');
    if (isPsnProfilesChallengePage(parsed.html)) {
      throw new Error('PSNProfiles 访问被验证页面拦截，请更新 Cookie');
    }
    chunks.push(parsed.html);
    if (!parsed.hasNext) return chunks.join('\n');
  }

  throw new Error(`PSNProfiles 分页超过 ${maxPages} 页，已停止导入`);
}

export function parsePsnProfilePage(data: unknown): PsnProfilePage {
  const record = data && typeof data === 'object'
    ? data as Record<string, unknown>
    : null;
  const html = typeof data === 'string'
    ? data
    : typeof record?.html === 'string' ? record.html : '';
  const explicitNextPage = Number(record?.nextPage);
  if (Number.isSafeInteger(explicitNextPage) && explicitNextPage >= 0) {
    return { html, hasNext: explicitNextPage > 0 };
  }
  const marker = html.match(/\bnextPage\s*=\s*(\d+)/);
  return {
    html,
    hasNext: marker ? Number(marker[1]) > 0 : record != null,
  };
}

export function isPsnProfilesChallengePage(html: string): boolean {
  return /<title>\s*(just a moment|attention required)/i.test(html)
    || /\bcf-chl-/i.test(html);
}

export function isPsnProfilesChallengeResponse(status: unknown, data: unknown): boolean {
  return status === 403
    && typeof data === 'string'
    && isPsnProfilesChallengePage(data);
}

export function parsePsnGames(html: string): PsnGame[] {
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

export function extractPsnGameId(href: string): string | null {
  if (!href) return null;
  const idx = href.indexOf('/trophies/');
  if (idx < 0) return null;
  let tail = href.substring(idx + 10);
  if (tail.startsWith('/')) tail = tail.substring(1);
  const slash = tail.indexOf('/');
  const segment = slash > 0 ? tail.substring(0, slash) : tail;
  return segment.match(/^(\d+)(?:-|$)/)?.[1] ?? null;
}

function extractTitle($: any, link: any, row: any): string | null {
  const titleLink = row.find('a.title').first();
  let title = titleLink.length ? titleLink.text().trim() || null : null;
  if (!title) title = link.text().trim() || null;
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
  const gameImage = row.find('picture.game img').first();
  const img = gameImage.length ? gameImage : row.find('img').first();
  if (!img.length) return null;
  const url = img.attr('data-src') || img.attr('data-lazy-src') || img.attr('src');
  if (!url) return null;
  if (url.startsWith('//')) return 'https:' + url;
  return url;
}

function extractTrophyProgress($: any, row: any): { total: number | null; unlocked: number | null } {
  if (!row.length) return { total: null, unlocked: null };

  const trophyInfo = row.find('div.small-info').first();
  if (trophyInfo.length) {
    const values = trophyInfo.find('b').toArray()
      .map((element: any) => parseInt($(element).text().trim(), 10))
      .filter((value: number) => !Number.isNaN(value));
    if (values.length >= 2) return { unlocked: values[0], total: values[1] };
    if (values.length === 1) return { unlocked: values[0], total: values[0] };
  }

  // 尝试 data-earned/data-total 属性
  const dataNode = row.is('[data-earned][data-total]')
    ? row
    : row.find('[data-earned][data-total]').first();
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
