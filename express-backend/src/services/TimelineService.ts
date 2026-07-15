import { getDb } from '../config/db';
import { normalizeCategory, LibraryCategoryFilter, parseCursor, yearRange } from './LibraryService';
import {
  detectMovieSource, detectGameSource, detectTvShowSource,
  movieSourceLabel, gameSourceLabel, tvShowSourceLabel,
} from './LibraryService';
import { normalizeStatus } from './LibraryService';
import { TimelineRecordResponse, TimelinePageResponse } from '../dto/timeline';
import { buildGameStatusWhere, effectiveGameStatus } from './GameStatusService';

export interface ListTimelineOptions {
  cursor?: string;
  limit?: number;
  includeTotals?: boolean;
  category?: LibraryCategoryFilter;
  year?: number;
  status?: string;
}

function buildBaseWhere(options: ListTimelineOptions) {
  const createdAtRange = yearRange(options.year);
  const normalizedStatus = options.status
    ? normalizeStatus(options.status)
    : undefined;
  return {
    ...(createdAtRange ? { createdAt: createdAtRange } : {}),
    ...(normalizedStatus ? { status: normalizedStatus } : {}),
  };
}

function buildGameBaseWhere(options: ListTimelineOptions) {
  const createdAtRange = yearRange(options.year);
  const normalizedStatus = options.status
    ? normalizeStatus(options.status)
    : undefined;
  return {
    AND: [
      createdAtRange ? { createdAt: createdAtRange } : {},
      buildGameStatusWhere(normalizedStatus),
    ].filter(part => Object.keys(part).length > 0),
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
    status: effectiveGameStatus(g),
    rating: g.rating,
    playtimeMinutes: g.playtimeMinutes,
    sourceLabel: gameSourceLabel(sourceKey),
    platformLabel: g.platform
      ? (g.platform.trim().toUpperCase() === 'PSN' ? 'PSN'
        : g.platform.trim().toUpperCase() === 'XBOX' ? 'Xbox'
        : g.platform.trim().toUpperCase() === 'STEAM' ? 'Steam'
        : g.platform.trim() || gameSourceLabel(sourceKey))
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

  const mediaWhere = {
    AND: [baseWhere, cursorWhere].filter((part) => Object.keys(part).length > 0),
  };
  const gameWhere = {
    AND: [buildGameBaseWhere(options ?? {}), cursorWhere]
      .filter(part => Object.keys(part).length > 0),
  };

  const includeMovies = category === 'all' || category === 'media' || category === 'movie';
  const includeTvShows = category === 'all' || category === 'media' || category === 'tv_show';
  const includeGames = category === 'all' || category === 'game';

  const [movies, games, tvShows, totalResult] = await Promise.all([
    includeMovies
      ? getDb().movie.findMany({ where: mediaWhere, select: MOVIE_SELECT, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: pageTake })
      : Promise.resolve([]),
    includeGames
      ? getDb().game.findMany({ where: gameWhere, select: GAME_SELECT, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: pageTake })
      : Promise.resolve([]),
    includeTvShows
      ? getDb().tvShow.findMany({ where: mediaWhere, select: TV_SHOW_SELECT, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: pageTake })
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

  // Use raw SQL for efficient distinct year extraction (avoids loading all rows)
  const queries: Promise<{ year: number }[]>[] = [];
  if (includeMovies) queries.push(db.$queryRaw`SELECT DISTINCT YEAR(created_at) AS year FROM movie ORDER BY year DESC`);
  if (includeTvShows) queries.push(db.$queryRaw`SELECT DISTINCT YEAR(created_at) AS year FROM tv_show ORDER BY year DESC`);
  if (includeGames) queries.push(db.$queryRaw`SELECT DISTINCT YEAR(created_at) AS year FROM game ORDER BY year DESC`);

  const results = await Promise.all(queries);
  const years = new Set<number>();
  for (const rows of results) {
    for (const row of rows) {
      if (row.year != null) years.add(Number(row.year));
    }
  }
  return [...years].sort((a, b) => b - a);
}

async function fetchTotal(options?: ListTimelineOptions) {
  const db = getDb();
  const baseWhere = buildBaseWhere(options ?? {});
  const gameBaseWhere = buildGameBaseWhere(options ?? {});
  const category = options?.category ?? 'all';
  const includeMovies = category === 'all' || category === 'media' || category === 'movie';
  const includeTvShows = category === 'all' || category === 'media' || category === 'tv_show';
  const includeGames = category === 'all' || category === 'game';

  const [movieCount, tvCount, gameCount] = await Promise.all([
    includeMovies ? db.movie.count({ where: baseWhere }) : Promise.resolve(0),
    includeTvShows ? db.tvShow.count({ where: baseWhere }) : Promise.resolve(0),
    includeGames ? db.game.count({ where: gameBaseWhere }) : Promise.resolve(0),
  ]);

  return { total: movieCount + tvCount + gameCount };
}
