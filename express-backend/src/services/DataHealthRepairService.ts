import { config } from '../config';
import { getDb } from '../config/db';
import { ImportSummary } from '../dto/import-summary';
import { enrichFromTmdb, TmdbEnrichResult } from './douban-harvester/tmdb-enrich';
import {
  DataHealthCategory,
  DataHealthIssue,
  buildDataHealthWhere,
} from './DataHealthService';
import { assertTaskActive } from './import/ImportSummaryTaskService';
import { fetchTmdbPosterUrl } from './import/TmdbCoverFillService';
import { toSafeTmdbId } from './import/TmdbId';
import {
  fetchMovieDetail,
  fetchTvDetail,
  TmdbDetail,
} from './import/TmdbDetailBackfillService';
import { lookupRawgPosterUrl } from './import/RawgPosterLookupService';
import { completeTask, createTask, failTask, updateProgress } from './task-manager';

type RepairProgress = (processed: number, total: number, currentTitle: string) => void;

interface MediaRepairRecord {
  id: bigint;
  title: string;
  tmdbId: bigint | null;
  tmdbPosterUrl: string | null;
  tmdbOverview: string | null;
  tmdbReleaseDate: string | null;
}

interface ResolvedTmdbRecord {
  tmdbId: number;
  enrich: TmdbEnrichResult | null;
}

export function isDataHealthRepairSupported(
  category: DataHealthCategory,
  issue: DataHealthIssue,
): boolean {
  return category !== 'game' || issue === 'missing_poster';
}

export function getDataHealthRepairUnavailableReason(
  category: DataHealthCategory,
  issue: DataHealthIssue,
): string | null {
  if (!isDataHealthRepairSupported(category, issue)) return '该问题需要人工核对，暂不支持自动修复';
  if (category === 'game') return config.rawg.apiKey ? null : '缺少 RAWG API Key';
  return config.tmdb.apiKey ? null : '缺少 TMDB API Key';
}

async function resolveTmdbRecord(
  category: 'movie' | 'tv_show',
  record: MediaRepairRecord,
): Promise<ResolvedTmdbRecord | null> {
  if (record.tmdbId != null) {
    const tmdbId = toSafeTmdbId(record.tmdbId);
    if (tmdbId == null) throw new Error('TMDB ID 超出安全整数范围');
    return { tmdbId, enrich: null };
  }

  const enrich = await enrichFromTmdb(record.title);
  const expectedType = category === 'movie' ? 'movie' : 'tv';
  if (!enrich.tmdbId || enrich.type !== expectedType) return null;
  return { tmdbId: enrich.tmdbId, enrich };
}

async function getRepairValue(
  category: 'movie' | 'tv_show',
  issue: DataHealthIssue,
  resolved: ResolvedTmdbRecord,
): Promise<string | number | null> {
  if (issue === 'missing_external_id') return resolved.tmdbId;
  if (issue === 'missing_poster') {
    if (resolved.enrich?.posterUrl) return resolved.enrich.posterUrl;
    return fetchTmdbPosterUrl(category === 'movie' ? 'movie' : 'tv', resolved.tmdbId);
  }

  const detail: TmdbDetail | null = category === 'movie'
    ? await fetchMovieDetail(resolved.tmdbId)
    : await fetchTvDetail(resolved.tmdbId);
  if (!detail) return null;
  return issue === 'missing_overview' ? detail.overview : detail.releaseDate;
}

async function repairMediaRecord(
  category: 'movie' | 'tv_show',
  issue: DataHealthIssue,
  record: MediaRepairRecord,
  signal?: AbortSignal,
): Promise<boolean> {
  const resolved = await resolveTmdbRecord(category, record);
  assertTaskActive(signal);
  if (!resolved) return false;
  const value = await getRepairValue(category, issue, resolved);
  assertTaskActive(signal);
  if (value == null || value === '') return false;
  const data = buildMediaRepairUpdate(category, issue, record, resolved.tmdbId, value);

  if (category === 'movie') {
    await getDb().movie.update({ where: { id: record.id }, data });
  } else {
    await getDb().tvShow.update({ where: { id: record.id }, data });
  }
  return true;
}

export function buildMediaRepairUpdate(
  category: 'movie' | 'tv_show',
  issue: DataHealthIssue,
  record: Pick<MediaRepairRecord, 'tmdbId' | 'tmdbPosterUrl' | 'tmdbOverview' | 'tmdbReleaseDate'>,
  tmdbId: number,
  value: string | number,
): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (record.tmdbId == null) data.tmdbId = tmdbId;
  if (issue === 'missing_poster') {
    data.posterUrl = value;
    if (!record.tmdbPosterUrl) data.tmdbPosterUrl = value;
  } else if (issue === 'missing_overview') {
    data.overview = value;
    if (!record.tmdbOverview) data.tmdbOverview = value;
  } else if (issue === 'missing_date') {
    data[category === 'movie' ? 'releaseDate' : 'firstAirDate'] = value;
    if (!record.tmdbReleaseDate) data.tmdbReleaseDate = value;
  }
  return data;
}

async function repairMediaIssues(
  category: 'movie' | 'tv_show',
  issue: DataHealthIssue,
  limit: number,
  onProgress?: RepairProgress,
  signal?: AbortSignal,
): Promise<ImportSummary> {
  const records = category === 'movie'
    ? await getDb().movie.findMany({
      where: buildDataHealthWhere('movie', issue)!,
      orderBy: { id: 'asc' },
      take: limit,
      select: {
        id: true,
        title: true,
        tmdbId: true,
        tmdbPosterUrl: true,
        tmdbOverview: true,
        tmdbReleaseDate: true,
      },
    })
    : await getDb().tvShow.findMany({
      where: buildDataHealthWhere('tv_show', issue)!,
      orderBy: { id: 'asc' },
      take: limit,
      select: {
        id: true,
        title: true,
        tmdbId: true,
        tmdbPosterUrl: true,
        tmdbOverview: true,
        tmdbReleaseDate: true,
      },
    });
  const summary: ImportSummary = { total: records.length, imported: 0, skipped: 0, errors: [] };

  for (let index = 0; index < records.length; index++) {
    if (signal?.aborted) break;
    const record = records[index];
    onProgress?.(index, records.length, record.title);
    try {
      if (await repairMediaRecord(category, issue, record, signal)) summary.imported++;
      else summary.skipped++;
    } catch (error: any) {
      if (signal?.aborted) break;
      summary.errors.push(`${record.title}: ${error.message}`);
      summary.skipped++;
    }
  }
  onProgress?.(summary.imported + summary.skipped, records.length, '');
  return summary;
}

async function repairGamePosters(
  limit: number,
  onProgress?: RepairProgress,
  signal?: AbortSignal,
): Promise<ImportSummary> {
  const records = await getDb().game.findMany({
    where: buildDataHealthWhere('game', 'missing_poster')!,
    orderBy: { id: 'asc' },
    take: limit,
    select: { id: true, title: true },
  });
  const summary: ImportSummary = { total: records.length, imported: 0, skipped: 0, errors: [] };

  for (let index = 0; index < records.length; index++) {
    if (signal?.aborted) break;
    const record = records[index];
    onProgress?.(index, records.length, record.title);
    try {
      const posterUrl = await lookupRawgPosterUrl(record.title, signal);
      if (!posterUrl || signal?.aborted) {
        summary.skipped++;
        continue;
      }
      await getDb().game.update({ where: { id: record.id }, data: { posterUrl } });
      summary.imported++;
    } catch (error: any) {
      if (signal?.aborted) break;
      summary.errors.push(`${record.title}: ${error.message}`);
      summary.skipped++;
    }
  }
  onProgress?.(summary.imported + summary.skipped, records.length, '');
  return summary;
}

export async function repairDataHealthIssues(
  category: DataHealthCategory,
  issue: DataHealthIssue,
  limit: number,
  onProgress?: RepairProgress,
  signal?: AbortSignal,
): Promise<ImportSummary> {
  const unavailableReason = getDataHealthRepairUnavailableReason(category, issue);
  if (unavailableReason) throw new Error(unavailableReason);
  return category === 'game'
    ? repairGamePosters(limit, onProgress, signal)
    : repairMediaIssues(category, issue, limit, onProgress, signal);
}

export function startDataHealthRepairTask(
  category: DataHealthCategory,
  issue: DataHealthIssue,
  limit: number,
) {
  const task = createTask('data-health-repair', '数据健康修复');
  void repairDataHealthIssues(
    category,
    issue,
    limit,
    (processed, total, currentTitle) => {
      updateProgress(task.taskId, { processed, total, currentTitle });
    },
    task.abortController.signal,
  ).then(result => {
    completeTask(task.taskId, result);
  }).catch((error: any) => {
    failTask(task.taskId, error.message);
  });
  return task;
}
