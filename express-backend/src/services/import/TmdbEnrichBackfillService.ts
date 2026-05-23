import { getDb } from '../../config/db';
import { enrichFromTmdb } from '../douban-harvester/tmdb-enrich';
import { ImportSummary } from '../../dto/import-summary';
import { createTask, updateProgress, completeTask, failTask } from '../task-manager';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 批量为已有记录补充 TMDB 信息（tmdbId、posterUrl 等）。
 * 仅处理 tmdbId 为 null 的记录，按标题搜索 TMDB。
 */
export async function enrichExistingRecords(
  limit: number = 50,
  onProgress?: (processed: number, total: number, currentTitle: string) => void,
  signal?: AbortSignal,
): Promise<ImportSummary> {
  const summary: ImportSummary = { total: 0, imported: 0, skipped: 0, errors: [] };

  // 1. 处理电影
  const movies = await getDb().movie.findMany({
    where: { tmdbId: null },
    orderBy: { id: 'asc' },
    take: limit,
  });

  summary.total += movies.length;

  for (const movie of movies) {
    if (signal?.aborted) break;
    if (onProgress) onProgress(summary.imported + summary.skipped, summary.total, movie.title);

    try {
      const enrich = await enrichFromTmdb(movie.title);
      if (enrich.tmdbId) {
        await getDb().movie.update({
          where: { id: movie.id },
          data: {
            tmdbId: enrich.tmdbId,
            posterUrl: enrich.posterUrl,
          },
        });
        summary.imported++;
      } else {
        summary.skipped++;
      }
    } catch (ex: any) {
      summary.errors.push(`电影 ${movie.title}: ${ex.message}`);
      summary.skipped++;
    }
    await delay(250);
  }

  if (summary.total >= limit) return summary;

  // 2. 处理电视剧
  const remaining = limit - summary.total;
  const shows = await getDb().tvShow.findMany({
    where: { tmdbId: null },
    orderBy: { id: 'asc' },
    take: remaining,
  });

  summary.total += shows.length;

  for (const show of shows) {
    if (signal?.aborted) break;
    if (onProgress) onProgress(summary.imported + summary.skipped, summary.total, show.title);

    try {
      const enrich = await enrichFromTmdb(show.title);
      if (enrich.tmdbId) {
        await getDb().tvShow.update({
          where: { id: show.id },
          data: {
            tmdbId: enrich.tmdbId,
            posterUrl: enrich.posterUrl,
          },
        });
        summary.imported++;
      } else {
        summary.skipped++;
      }
    } catch (ex: any) {
      summary.errors.push(`剧集 ${show.title}: ${ex.message}`);
      summary.skipped++;
    }
    await delay(250);
  }

  return summary;
}

/**
 * 启动异步批量丰富任务
 */
export function startEnrichBackfillTask(limit: number = 50) {
  const task = createTask('tmdb-enrich-backfill', 'TMDB 数据回填');

  (async () => {
    try {
      const result = await enrichExistingRecords(
        limit,
        (processed, total, currentTitle) => {
          updateProgress(task.taskId, { processed, total, currentTitle });
        },
        task.abortController.signal,
      );
      completeTask(task.taskId, result);
    } catch (ex: any) {
      failTask(task.taskId, ex.message);
    }
  })();

  return task;
}
