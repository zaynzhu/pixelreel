import { getDb } from '../../config/db';
import { config } from '../../config';
import { createTask, completeTask, failTask, updateProgress, listTasks } from '../task-manager';
import { RadarItemInput, RadarSource, RadarSourceResult, CRITICAL_SOURCES, OPTIONAL_SOURCES } from './types';
import { fetchTmdbRadar, fetchTmdbPlatformItems, fetchTmdbNewReleases, fetchTmdbPlatformNewReleases } from './tmdbRadarService';
import { fetchYoukuRadar, fetchYoukuNewReleases } from './youkuRadarService';
import { fetchTencentRadar } from './tencentRadarService';

let syncLock = false;

async function fetchSourceItems(source: RadarSource): Promise<RadarItemInput[]> {
  switch (source) {
    case 'tmdb': return fetchTmdbRadar();
    case 'youku': return fetchYoukuRadar();
    case 'tencent': return fetchTencentRadar();
    default: return [];
  }
}

async function syncSource(source: RadarSource): Promise<RadarSourceResult> {
  const result: RadarSourceResult = { source, ok: true, count: 0 };
  try {
    const items = await fetchSourceItems(source);
    const db = getDb();
    for (const item of items) {
      await db.radarItem.upsert({
        where: { sourceKey: item.sourceKey },
        update: {
          title: item.title,
          titleZh: item.titleZh ?? null,
          overview: item.overview ?? null,
          posterPath: item.posterPath ?? null,
          releaseDate: item.releaseDate ?? null,
          category: item.category,
          voteAverage: item.voteAverage ?? null,
          platform: item.platform ?? null,
          lastSyncedAt: new Date(),
        },
        create: {
          sourceKey: item.sourceKey,
          source: item.source,
          sourceId: item.sourceId ?? null,
          sourceUrl: item.sourceUrl ?? null,
          tmdbId: item.tmdbId ?? null,
          doubanId: item.doubanId ?? null,
          type: item.type,
          title: item.title,
          titleZh: item.titleZh ?? null,
          overview: item.overview ?? null,
          posterPath: item.posterPath ?? null,
          releaseDate: item.releaseDate ?? null,
          platform: item.platform ?? null,
          category: item.category,
          voteAverage: item.voteAverage ?? null,
          lastSyncedAt: new Date(),
        },
      });
    }
    result.count = items.length;
  } catch (err: any) {
    result.ok = false;
    result.warning = err.message;
    console.error(`[Radar] ${source} sync failed:`, err.message);
  }
  return result;
}

async function syncPlatformItems(): Promise<RadarSourceResult> {
  const result: RadarSourceResult = { source: 'tmdb' as RadarSource, ok: true, count: 0, warning: undefined };
  try {
    const items = await fetchTmdbPlatformItems(config.radar.watchRegion);
    const db = getDb();
    for (const item of items) {
      await db.radarItem.upsert({
        where: { sourceKey: item.sourceKey },
        update: {
          title: item.title,
          titleZh: item.titleZh ?? null,
          overview: item.overview ?? null,
          posterPath: item.posterPath ?? null,
          releaseDate: item.releaseDate ?? null,
          category: item.category,
          voteAverage: item.voteAverage ?? null,
          platform: item.platform ?? null,
          lastSyncedAt: new Date(),
        },
        create: {
          sourceKey: item.sourceKey,
          source: item.source,
          sourceId: item.sourceId ?? null,
          sourceUrl: item.sourceUrl ?? null,
          tmdbId: item.tmdbId ?? null,
          doubanId: item.doubanId ?? null,
          type: item.type,
          title: item.title,
          titleZh: item.titleZh ?? null,
          overview: item.overview ?? null,
          posterPath: item.posterPath ?? null,
          releaseDate: item.releaseDate ?? null,
          platform: item.platform ?? null,
          category: item.category,
          voteAverage: item.voteAverage ?? null,
          lastSyncedAt: new Date(),
        },
      });
    }
    result.count = items.length;
  } catch (err: any) {
    result.ok = false;
    result.warning = err.message;
    console.error('[Radar] Platform items sync failed:', err.message);
  }
  return result;
}

export async function runRadarSync(sourceFilter?: string): Promise<{ taskId: string }> {
  if (syncLock) {
    throw new Error('同步正在运行中');
  }

  syncLock = true;
  const task = createTask('radar-sync', '雷达数据同步');

  (async () => {
    try {
      const sources: RadarSource[] = sourceFilter
        ? [sourceFilter as RadarSource]
        : [...CRITICAL_SOURCES, ...(config.radar.scrapersEnabled ? OPTIONAL_SOURCES : [])];

      const results: RadarSourceResult[] = [];
      let totalProcessed = 0;

      for (const source of sources) {
        if (task.abortController.signal.aborted) break;
        updateProgress(task.taskId, {
          processed: totalProcessed,
          total: sources.length,
          currentTitle: `Syncing ${source}...`,
        });
        const result = await syncSource(source);
        results.push(result);
        totalProcessed += result.count;
      }

      // Sync watch provider items from TMDB discover API
      if (!sourceFilter || sourceFilter === 'tmdb') {
        if (!task.abortController.signal.aborted) {
          updateProgress(task.taskId, {
            processed: totalProcessed,
            total: sources.length + 1,
            currentTitle: 'Syncing watch providers...',
          });
          const platformResult = await syncPlatformItems();
          results.push(platformResult);
          totalProcessed += platformResult.count;
        }
      }

      completeTask(task.taskId, { total: totalProcessed, imported: totalProcessed, skipped: 0, errors: results.filter(r => !r.ok).map(r => r.warning || 'unknown') });
    } catch (err: any) {
      failTask(task.taskId, err.message);
    } finally {
      syncLock = false;
    }
  })();

  return { taskId: task.taskId };
}

export function isSyncRunning(): boolean {
  return syncLock;
}

export function getRadarSyncStatus() {
  const radarTasks = listTasks().filter(t => t.type === 'radar-sync');
  return radarTasks.length > 0 ? radarTasks[0] : null;
}

// ══════════════════════════════════════════════════════════════
// New Release Radar — 纯新片探索
// ══════════════════════════════════════════════════════════════

let newReleaseSyncLock = false;

async function syncNewReleaseSource(source: RadarSource): Promise<RadarSourceResult> {
  const result: RadarSourceResult = { source, ok: true, count: 0 };
  try {
    let items: RadarItemInput[];
    switch (source) {
      case 'tmdb': items = await fetchTmdbNewReleases(); break;
      case 'youku': items = await fetchYoukuNewReleases(); break;
      case 'tencent': items = await fetchTencentRadar(); break;
      default: items = []; break;
    }
    const db = getDb();
    for (const item of items) {
      await db.radarItem.upsert({
        where: { sourceKey: item.sourceKey },
        update: {
          title: item.title,
          titleZh: item.titleZh ?? null,
          overview: item.overview ?? null,
          posterPath: item.posterPath ?? null,
          releaseDate: item.releaseDate ?? null,
          category: item.category,
          voteAverage: item.voteAverage ?? null,
          platform: item.platform ?? null,
          lastSyncedAt: new Date(),
        },
        create: {
          sourceKey: item.sourceKey,
          source: item.source,
          sourceId: item.sourceId ?? null,
          sourceUrl: item.sourceUrl ?? null,
          tmdbId: item.tmdbId ?? null,
          doubanId: item.doubanId ?? null,
          type: item.type,
          title: item.title,
          titleZh: item.titleZh ?? null,
          overview: item.overview ?? null,
          posterPath: item.posterPath ?? null,
          releaseDate: item.releaseDate ?? null,
          platform: item.platform ?? null,
          category: item.category,
          voteAverage: item.voteAverage ?? null,
          lastSyncedAt: new Date(),
        },
      });
    }
    result.count = items.length;
  } catch (err: any) {
    result.ok = false;
    result.warning = err.message;
    console.error(`[Radar] New release ${source} sync failed:`, err.message);
  }
  return result;
}

async function syncNewReleasePlatformItems(): Promise<RadarSourceResult> {
  const result: RadarSourceResult = { source: 'tmdb' as RadarSource, ok: true, count: 0 };
  try {
    const items = await fetchTmdbPlatformNewReleases(config.radar.watchRegion);
    const db = getDb();
    for (const item of items) {
      await db.radarItem.upsert({
        where: { sourceKey: item.sourceKey },
        update: {
          title: item.title,
          titleZh: item.titleZh ?? null,
          overview: item.overview ?? null,
          posterPath: item.posterPath ?? null,
          releaseDate: item.releaseDate ?? null,
          category: item.category,
          voteAverage: item.voteAverage ?? null,
          platform: item.platform ?? null,
          lastSyncedAt: new Date(),
        },
        create: {
          sourceKey: item.sourceKey,
          source: item.source,
          sourceId: item.sourceId ?? null,
          sourceUrl: item.sourceUrl ?? null,
          tmdbId: item.tmdbId ?? null,
          doubanId: item.doubanId ?? null,
          type: item.type,
          title: item.title,
          titleZh: item.titleZh ?? null,
          overview: item.overview ?? null,
          posterPath: item.posterPath ?? null,
          releaseDate: item.releaseDate ?? null,
          platform: item.platform ?? null,
          category: item.category,
          voteAverage: item.voteAverage ?? null,
          lastSyncedAt: new Date(),
        },
      });
    }
    result.count = items.length;
  } catch (err: any) {
    result.ok = false;
    result.warning = err.message;
    console.error('[Radar] New release platform sync failed:', err.message);
  }
  return result;
}

export async function runNewReleaseRadarSync(sourceFilter?: string): Promise<{ taskId: string }> {
  if (newReleaseSyncLock) {
    throw new Error('新片同步正在运行中');
  }

  newReleaseSyncLock = true;
  const task = createTask('new-release-radar-sync', '新片雷达同步');

  (async () => {
    try {
      const sources: RadarSource[] = sourceFilter
        ? [sourceFilter as RadarSource]
        : ['tmdb' as RadarSource, ...(config.radar.scrapersEnabled ? (['youku', 'tencent'] as RadarSource[]) : [])];

      const results: RadarSourceResult[] = [];
      let totalProcessed = 0;

      for (const source of sources) {
        if (task.abortController.signal.aborted) break;
        updateProgress(task.taskId, {
          processed: totalProcessed,
          total: sources.length,
          currentTitle: `新片同步 ${source}...`,
        });
        const result = await syncNewReleaseSource(source);
        results.push(result);
        totalProcessed += result.count;
      }

      // Sync platform new releases
      if (!sourceFilter || sourceFilter === 'tmdb') {
        if (!task.abortController.signal.aborted) {
          updateProgress(task.taskId, {
            processed: totalProcessed,
            total: sources.length + 1,
            currentTitle: '新片同步流媒体平台...',
          });
          const platformResult = await syncNewReleasePlatformItems();
          results.push(platformResult);
          totalProcessed += platformResult.count;
        }
      }

      completeTask(task.taskId, { total: totalProcessed, imported: totalProcessed, skipped: 0, errors: results.filter(r => !r.ok).map(r => r.warning || 'unknown') });
    } catch (err: any) {
      failTask(task.taskId, err.message);
    } finally {
      newReleaseSyncLock = false;
    }
  })();

  return { taskId: task.taskId };
}

export function isNewReleaseSyncRunning(): boolean {
  return newReleaseSyncLock;
}

export function getNewReleaseRadarSyncStatus() {
  const tasks = listTasks().filter(t => t.type === 'new-release-radar-sync');
  return tasks.length > 0 ? tasks[0] : null;
}