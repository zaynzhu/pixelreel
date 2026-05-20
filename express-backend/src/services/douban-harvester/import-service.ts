import path from 'path';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/db';
import { ImportSummary } from '../../dto/import-summary';
import { RecordStatus } from '../../enums/RecordStatus';
import { config } from '../../config';
import { loadData } from './storage';
import { enrichFromTmdb } from './tmdb-enrich';
import type { CollectItem } from './types';
import {
  createTask, updateProgress, completeTask, failTask,
  type TaskMode,
} from './task-manager';

// 从豆瓣链接提取 doubanId
function extractDoubanId(link: string): string | null {
  const idx = link.indexOf('/subject/');
  if (idx < 0) return null;
  let tail = link.substring(idx + 9);
  const slash = tail.indexOf('/');
  if (slash > 0) tail = tail.substring(0, slash);
  return tail || null;
}

// 豆瓣评分 1-5 → 直接存为 1-5（五星制，不再 ×2）
function parseDoubanRating(rating: string): number | null {
  const n = parseFloat(rating);
  if (isNaN(n) || n <= 0) return null;
  return Math.min(Math.round(n), 5);
}

// 从 CollectItem 的 intro 中提取年份
function extractYear(intro: string): string | null {
  const match = intro.match(/(\d{4})/);
  return match ? match[1] : null;
}

// 从 CollectItem 的 intro 中检测是否可能是电视剧/综艺
function mightBeTvShow(item: CollectItem): boolean {
  const intro = item.intro || '';
  if (/集|季/.test(intro)) return true;
  return false;
}

/**
 * mode=json: 读现有 collect.json 导入
 */
export async function importFromJson(
  dataDir?: string,
  onProgress?: (processed: number, total: number, currentTitle: string) => void,
): Promise<ImportSummary> {
  const dir = dataDir || config.douban.dataDir;
  const collectPath = path.join(dir, 'collect.json');
  const items: CollectItem[] = loadData<CollectItem>(collectPath);

  const summary: ImportSummary = { total: 0, imported: 0, skipped: 0, errors: [] };

  if (items.length === 0) {
    summary.errors.push(`未找到数据文件: ${collectPath}`);
    return summary;
  }

  // 批量查已有记录
  const doubanIds = items
    .map(i => extractDoubanId(i.link))
    .filter((id): id is string => id !== null);

  const existingDoubanMovies = doubanIds.length > 0
    ? new Map((await prisma.movie.findMany({ where: { doubanId: { in: doubanIds } } })).map(m => [m.doubanId!, m]))
    : new Map<string, any>();
  const existingDoubanTvShows = doubanIds.length > 0
    ? new Map((await prisma.tvShow.findMany({ where: { doubanId: { in: doubanIds } } })).map(s => [s.doubanId!, s]))
    : new Map<string, any>();

  summary.total = items.length;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (onProgress) onProgress(i, items.length, item.title);

    try {
      const doubanId = extractDoubanId(item.link);

      // 按 doubanId 查重
      if (doubanId) {
        if (existingDoubanMovies.has(doubanId) || existingDoubanTvShows.has(doubanId)) {
          summary.skipped++;
          continue;
        }
      }

      // TMDB 丰富
      const enrich = await enrichFromTmdb(item.title);

      // 豆瓣评分（1-5 星，直接存）
      const doubanRating = parseDoubanRating(item.rating);
      const watchedDate = item.date ? new Date(item.date + 'T00:00:00.000Z') : undefined;

      // 豆瓣原始字段（所有 CollectItem 字段原样存入）
      const doubanFields: any = {
        doubanId,
        doubanTitle: item.title,
        doubanAltTitle: item.altTitle || null,
        doubanIntro: item.intro || null,
        doubanRating,
        doubanDate: item.date || null,
        doubanComment: item.comment || null,
        doubanLink: item.link || null,
      };

      // TMDB 原始字段
      const tmdbFields: any = {
        tmdbId: enrich.tmdbId ?? undefined,
        tmdbTitle: enrich.title,
        tmdbPosterUrl: enrich.posterUrl,
        tmdbReleaseDate: enrich.releaseDate,
        tmdbOverview: enrich.overview,
        tmdbVoteAverage: enrich.voteAverage != null ? new Prisma.Decimal(enrich.voteAverage) : null,
        tmdbPopularity: enrich.popularity,
        tmdbGenreIds: enrich.genreIds.length > 0 ? enrich.genreIds.join(',') : null,
      };

      // 显示字段（豆瓣优先、TMDB 补缺）
      const displayFields: any = {
        title: item.title,                          // 默认取豆瓣中文片名
        posterUrl: enrich.posterUrl,                 // 海报来自 TMDB
        status: RecordStatus.DONE,
        rating: doubanRating,                         // 1-5 星
        shortReview: item.comment || null,            // 默认取豆瓣短评
        createdAt: watchedDate,
      };

      // 判断类型并写入对应表
      if (enrich.type === 'tv' || (enrich.type === 'unknown' && mightBeTvShow(item))) {
        // 检查 tmdbId 去重
        if (enrich.tmdbId) {
          const existing = await prisma.tvShow.findFirst({ where: { tmdbId: enrich.tmdbId } });
          if (existing) {
            if (!existing.doubanId && doubanId) {
              await prisma.tvShow.update({ where: { id: existing.id }, data: { doubanId } });
            }
            summary.skipped++;
            continue;
          }
        }

        await prisma.tvShow.create({
          data: {
            ...displayFields,
            firstAirDate: enrich.releaseDate ?? extractYear(item.intro),
            overview: enrich.overview,
            ...doubanFields,
            ...tmdbFields,
          },
        });
      } else {
        // 默认归入 Movie 表
        if (enrich.tmdbId) {
          const existing = await prisma.movie.findFirst({ where: { tmdbId: enrich.tmdbId } });
          if (existing) {
            if (!existing.doubanId && doubanId) {
              await prisma.movie.update({ where: { id: existing.id }, data: { doubanId } });
            }
            summary.skipped++;
            continue;
          }
        }

        await prisma.movie.create({
          data: {
            ...displayFields,
            releaseDate: enrich.releaseDate ?? extractYear(item.intro),
            overview: enrich.overview,
            ...doubanFields,
            ...tmdbFields,
          },
        });
      }

      summary.imported++;
    } catch (ex: any) {
      summary.errors.push(`导入失败: ${item.title} — ${ex.message}`);
      summary.skipped++;
    }
  }

  return summary;
}

/**
 * 启动异步 JSON 导入任务
 */
export function startJsonImportTask(dataDir?: string) {
  const task = createTask('json');

  (async () => {
    try {
      const result = await importFromJson(dataDir, (processed, total, currentTitle) => {
        updateProgress(task.taskId, { processed, total, currentTitle });
      });
      completeTask(task.taskId, result);
    } catch (ex: any) {
      failTask(task.taskId, ex.message);
    }
  })();

  return task;
}

/**
 * mode=full: 全量爬取 + 写库
 */
export function startFullHarvestTask(maxPages?: number) {
  const task = createTask('full');

  (async () => {
    try {
      const { makeBrowser } = await import('./scraper');
      const { scrapeCollect } = await import('./scraper');
      const { loadProgress, saveProgress, saveSyncState, todayStr, loadData, dedupByLink } = await import('./storage');
      const progress = loadProgress();

      updateProgress(task.taskId, { processed: 0, total: 0, currentTitle: '正在启动浏览器...' });

      const { browser, context } = await makeBrowser();
      try {
        updateProgress(task.taskId, { processed: 0, total: 0, currentTitle: '正在爬取评分数据...' });
        const collectResult = await scrapeCollect(context, progress, undefined, maxPages);
        if (!collectResult.ok) {
          failTask(task.taskId, '爬取被风控中止');
          return;
        }

        // 保存爬取数据
        const existing = loadData<CollectItem>('collect.json');
        const all = [...existing, ...collectResult.newItems];
        const deduped = dedupByLink(all);
        const fs = await import('fs');
        const dir = config.douban.dataDir;
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'collect.json'), JSON.stringify(deduped, null, 2), 'utf-8');

        // 导入到数据库
        updateProgress(task.taskId, { processed: 0, total: deduped.length, currentTitle: '正在导入数据...' });
        const result = await importFromJson(undefined, (processed, total, currentTitle) => {
          updateProgress(task.taskId, { processed, total, currentTitle });
        });
        completeTask(task.taskId, result);

        saveProgress(progress);
        if (progress.collectDone) {
          saveSyncState(todayStr());
        }
      } finally {
        await context.close();
        await browser.close();
      }
    } catch (ex: any) {
      failTask(task.taskId, ex.message);
    }
  })();

  return task;
}

/**
 * mode=incremental: 增量爬取 + 写库
 */
export function startIncrementalHarvestTask() {
  const task = createTask('incremental');

  (async () => {
    try {
      const { makeBrowser } = await import('./scraper');
      const { scrapeCollect } = await import('./scraper');
      const { loadProgress, saveProgress, saveSyncState, todayStr, loadData, dedupByLink } = await import('./storage');

      const stateData: any = loadData<any>('sync_state.json');
      const lastSync: string | null = Array.isArray(stateData) ? stateData[0]?.lastSyncDate : stateData?.lastSyncDate;
      if (!lastSync) {
        failTask(task.taskId, '从未同步过，请先使用全量模式');
        return;
      }

      const progress = loadProgress();

      updateProgress(task.taskId, { processed: 0, total: 0, currentTitle: '正在启动浏览器...' });

      const { browser, context } = await makeBrowser();
      try {
        updateProgress(task.taskId, { processed: 0, total: 0, currentTitle: '正在增量爬取...' });
        const collectResult = await scrapeCollect(context, progress, lastSync);
        if (!collectResult.ok) {
          failTask(task.taskId, '爬取被风控中止');
          return;
        }

        // 合并增量数据
        const existing = loadData<CollectItem>('collect.json');
        const all = [...existing, ...collectResult.newItems];
        const deduped = dedupByLink(all);
        const fs = await import('fs');
        const dir = config.douban.dataDir;
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'collect.json'), JSON.stringify(deduped, null, 2), 'utf-8');

        // 导入到数据库
        updateProgress(task.taskId, { processed: 0, total: collectResult.newItems.length, currentTitle: '正在导入增量数据...' });
        const result = await importFromJson(undefined, (processed, total, currentTitle) => {
          updateProgress(task.taskId, { processed, total, currentTitle });
        });
        completeTask(task.taskId, result);
        saveSyncState(todayStr());
      } finally {
        await context.close();
        await browser.close();
      }
    } catch (ex: any) {
      failTask(task.taskId, ex.message);
    }
  })();

  return task;
}

// 重新导出任务查询
export { getTask, type HarvestTask } from './task-manager';