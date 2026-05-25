import { getDb } from '../config/db';
import { normalizeCategory, LibraryCategoryFilter } from './LibraryService';
import {
  detectMovieSource, detectGameSource, detectTvShowSource,
  movieSourceLabel, gameSourceLabel, tvShowSourceLabel,
} from './LibraryService';
import { parseRecordStatus } from '../enums/RecordStatus';
import { TimelineRecordResponse, TimelinePageResponse } from '../dto/timeline';

export interface ListTimelineOptions {
  cursor?: string;
  limit?: number;
  includeTotals?: boolean;
  category?: LibraryCategoryFilter;
  year?: number;
  status?: string;
}

// ── Private helpers (same logic as LibraryService) ──

function parseCursor(cursor: string): { createdAt: Date; id: number } | null {
  const parts = cursor.split('__');
  if (parts.length !== 2) return null;
  const createdAt = new Date(parts[0]);
  const id = Number(parts[1]);
  if (isNaN(createdAt.getTime()) || isNaN(id)) return null;
  return { createdAt, id };
}

function yearRange(year?: number) {
  if (!year) return undefined;
  return {
    gte: new Date(`${year}-01-01T00:00:00.000Z`),
    lt: new Date(`${year + 1}-01-01T00:00:00.000Z`),
  };
}

function buildBaseWhere(options: ListTimelineOptions) {
  const createdAtRange = yearRange(options.year);
  const normalizedStatus = options.status
    ? parseRecordStatus(options.status)
    : undefined;
  return {
    ...(createdAtRange ? { createdAt: createdAtRange } : {}),
    ...(normalizedStatus ? { status: normalizedStatus } : {}),
  };
}

// ── Field selects (lightweight — only what timeline needs) ──

const MOVIE_SELECT = {
  id: true, title: true, posterUrl: true, status: true, rating: true, createdAt: true,
  doubanId: true, tmdbId: true, imdbId: true, traktId: true,
};

const TV_SHOW_SELECT = {
  id: true, title: true, posterUrl: true, status: true, rating: true, createdAt: true,
  doubanId: true, tmdbId: true, imdbId: true, traktId: true,
};

const GAME_SELECT = {
  id: true, title: true, posterUrl: true, status: true, rating: true, playtimeMinutes: true,
  platform: true, createdAt: true,
  psnId: true, xboxId: true, steamAppId: true, rawgId: true,
};

// ── Mappers ──

function toTimelineMovie(m: any): TimelineRecordResponse {
  const sourceKey = detectMovieSource(m);
  return {
    id: Number(m.id),
    category: 'movie',
    title: m.title,
    posterUrl: m.posterUrl,
    status: m.status || 'UNSET',
    rating: m.rating,
    playtimeMinutes: null,
    sourceLabel: movieSourceLabel(sourceKey),
    platformLabel: null,
    createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : String(m.createdAt),
  };
}

function toTimelineGame(g: any): TimelineRecordResponse {
  const sourceKey = detectGameSource(g);
  return {
    id: Number(g.id),
    category: 'game',
    title: g.title,
    posterUrl: g.posterUrl,
    status: g.status || 'UNSET',
    rating: g.rating,
    playtimeMinutes: g.playtimeMinutes,
    sourceLabel: gameSourceLabel(sourceKey),
    platformLabel: g.platform
      ? (g.platform.trim().toUpperCase() === 'PSN' ? 'PSN'
        : g.platform.trim().toUpperCase() === 'XBOX' ? 'Xbox'
        : g.platform.trim().toUpperCase() === 'STEAM' ? 'Steam'
        : g.platform)
      : gameSourceLabel(sourceKey),
    createdAt: g.createdAt instanceof Date ? g.createdAt.toISOString() : String(g.createdAt),
  };
}

function toTimelineTvShow(s: any): TimelineRecordResponse {
  const sourceKey = detectTvShowSource(s);
  return {
    id: Number(s.id),
    category: 'tv_show',
    title: s.title,
    posterUrl: s.posterUrl,
    status: s.status || 'UNSET',
    rating: s.rating,
    playtimeMinutes: null,
    sourceLabel: tvShowSourceLabel(sourceKey),
    platformLabel: null,
    createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : String(s.createdAt),
  };
}

// ── Main query ──

export async function listTimelineRecords(
  options?: ListTimelineOptions,
): Promise<TimelinePageResponse> {
  const limit = Math.min(Math.max(options?.limit ?? 96, 1), 200);
  const pageTake = limit + 1;
  const cursorObj = options?.cursor ? parseCursor(options.cursor) : undefined;
  const category = options?.category ?? 'all';

  const baseWhere = buildBaseWhere(options ?? {});
  const cursorWhere = cursorObj
    ? {
        OR: [
          { createdAt: { lt: cursorObj.createdAt } },
          { createdAt: { equals: cursorObj.createdAt }, id: { lt: cursorObj.id } },
        ],
      }
    : {};

  const where = {
    AND: [baseWhere, cursorWhere].filter((part) => Object.keys(part).length > 0),
  };

  const includeMovies = category === 'all' || category === 'media' || category === 'movie';
  const includeTvShows = category === 'all' || category === 'media' || category === 'tv_show';
  const includeGames = category === 'all' || category === 'game';

  const [movies, games, tvShows, totalResult] = await Promise.all([
    includeMovies
      ? getDb().movie.findMany({ where, select: MOVIE_SELECT, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: pageTake })
      : Promise.resolve([]),
    includeGames
      ? getDb().game.findMany({ where, select: GAME_SELECT, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: pageTake })
      : Promise.resolve([]),
    includeTvShows
      ? getDb().tvShow.findMany({ where, select: TV_SHOW_SELECT, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: pageTake })
      : Promise.resolve([]),
    options?.includeTotals === false
      ? Promise.resolve(undefined)
      : fetchTotal(options),
  ]);

  const allRecords: TimelineRecordResponse[] = [
    ...movies.map(toTimelineMovie),
    ...games.map(toTimelineGame),
    ...tvShows.map(toTimelineTvShow),
  ];

  allRecords.sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    if (tb !== ta) return tb - ta;
    return b.id - a.id;
  });

  const hasMore = allRecords.length > limit;
  const records = allRecords.slice(0, limit);
  const lastRecord = records[records.length - 1];
  const nextCursor = hasMore && lastRecord
    ? `${new Date(lastRecord.createdAt).toISOString()}__${lastRecord.id}`
    : null;

  return totalResult !== undefined
    ? { records, nextCursor, totals: totalResult }
    : { records, nextCursor };
}

// ── Years endpoint ──

export async function listTimelineYears(category: ListTimelineOptions['category'] = 'all'): Promise<number[]> {
  const db = getDb();
  const includeMovies = category === 'all' || category === 'media' || category === 'movie';
  const includeTvShows = category === 'all' || category === 'media' || category === 'tv_show';
  const includeGames = category === 'all' || category === 'game';

  const [movieDates, tvShowDates, gameDates] = await Promise.all([
    includeMovies ? db.movie.findMany({ select: { createdAt: true } }) : Promise.resolve([]),
    includeTvShows ? db.tvShow.findMany({ select: { createdAt: true } }) : Promise.resolve([]),
    includeGames ? db.game.findMany({ select: { createdAt: true } }) : Promise.resolve([]),
  ]);

  const allDates: Date[] = [
    ...movieDates.map((m: any) => m.createdAt),
    ...tvShowDates.map((t: any) => t.createdAt),
    ...gameDates.map((g: any) => g.createdAt),
  ];

  const years = [...new Set(allDates.map((d: Date) => d.getFullYear()))].sort((a, b) => b - a);
  return years;
}

async function fetchTotal(options?: ListTimelineOptions) {
  const db = getDb();
  const baseWhere = buildBaseWhere(options ?? {});
  const category = options?.category ?? 'all';
  const includeMovies = category === 'all' || category === 'media' || category === 'movie';
  const includeTvShows = category === 'all' || category === 'media' || category === 'tv_show';
  const includeGames = category === 'all' || category === 'game';

  const [movieCount, tvCount, gameCount] = await Promise.all([
    includeMovies ? db.movie.count({ where: baseWhere }) : Promise.resolve(0),
    includeTvShows ? db.tvShow.count({ where: baseWhere }) : Promise.resolve(0),
    includeGames ? db.game.count({ where: baseWhere }) : Promise.resolve(0),
  ]);

  return { total: movieCount + tvCount + gameCount };
}