import { getDb } from '../config/db';
import type { Prisma } from '@prisma/client';
import { LibraryRecordResponse, LibraryRecordUpdateRequest } from '../dto/library';
import { RecordStatus, parseRecordStatus } from '../enums/RecordStatus';
import {
  buildGameStatusWhere,
  effectiveGameStatus,
  gamePlaytimeMinutes,
} from './GameStatusService';
import { normalizePlatformAchievementProgress } from './import/PlatformGameSyncService';

// Library 混合列表服务，与 Java 端 LibraryService 完全对齐

export type LibraryCategoryFilter = 'all' | 'media' | 'movie' | 'tv_show' | 'game';
export type LibrarySourceFilter =
  | 'all' | 'douban' | 'tmdb' | 'imdb' | 'trakt'
  | 'steam' | 'rawg' | 'xbox' | 'psn' | 'manual';
export type LibraryReviewFilter = 'all' | 'reviewed' | 'unreviewed';
export type LibraryImportReviewFilter = 'all' | 'pending' | 'accepted' | 'ignored';
export type LibrarySort = 'recent' | 'rating';

type LibraryRecordCategory = LibraryRecordResponse['category'];

export interface LibraryCursor {
  sort: LibrarySort;
  createdAt: Date;
  category: LibraryRecordCategory | null;
  id: number;
  rating: number | null;
}

const LIBRARY_CURSOR_PREFIX = 'lr1.';
const LIBRARY_CATEGORY_RANK: Record<LibraryRecordCategory, number> = {
  movie: 0,
  tv_show: 1,
  game: 2,
};

export interface ListRecordsOptions {
  cursor?: string;
  limit?: number;
  includeTotals?: boolean;
  category?: LibraryCategoryFilter;
  year?: number;
  status?: RecordStatus;
  query?: string;
  source?: LibrarySourceFilter;
  review?: LibraryReviewFilter;
  importReview?: LibraryImportReviewFilter;
  sort?: LibrarySort;
}

export interface RandomRecordsOptions {
  category?: Extract<LibraryCategoryFilter, 'all' | 'movie' | 'tv_show' | 'game'>;
  status?: RecordStatus;
}

export function normalizeCategory(value?: string): LibraryCategoryFilter {
  if (value === 'movie' || value === 'tv_show' || value === 'game' || value === 'media') {
    return value;
  }
  return 'all';
}

export function parseYear(value?: string): number | undefined {
  if (!value) return undefined;
  const year = Number(value);
  if (!Number.isInteger(year) || year < 1900 || year > 3000) return undefined;
  return year;
}

export function yearRange(year?: number) {
  if (!year) return undefined;
  return {
    gte: new Date(`${year}-01-01T00:00:00.000Z`),
    lt: new Date(`${year + 1}-01-01T00:00:00.000Z`),
  };
}

export function normalizeStatus(value?: string): RecordStatus | undefined {
  if (!value) return undefined;
  const parsed = parseRecordStatus(value);
  if (Object.values(RecordStatus).includes(parsed as RecordStatus)) {
    return parsed as RecordStatus;
  }
  return undefined;
}

export function parseCursor(cursor: string): { createdAt: Date; id: number } | null {
  const parts = cursor.split('__');
  if (parts.length !== 2) return null;
  const createdAt = new Date(parts[0]);
  const id = Number(parts[1]);
  if (isNaN(createdAt.getTime()) || !Number.isSafeInteger(id) || id <= 0) return null;
  return { createdAt, id };
}

export function encodeLibraryCursor(
  record: Pick<LibraryRecordResponse, 'id' | 'category' | 'createdAt' | 'rating'>,
  sort: LibrarySort,
) {
  const payload = {
    sort,
    createdAt: new Date(record.createdAt).toISOString(),
    category: record.category,
    id: record.id,
    rating: sort === 'rating' ? record.rating ?? null : null,
  };
  return `${LIBRARY_CURSOR_PREFIX}${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
}

export function parseLibraryCursor(value: string, sort: LibrarySort): LibraryCursor | null {
  if (!value.startsWith(LIBRARY_CURSOR_PREFIX)) {
    if (sort !== 'recent') return null;
    const legacy = parseCursor(value);
    return legacy
      ? { sort, createdAt: legacy.createdAt, category: null, id: legacy.id, rating: null }
      : null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(value.slice(LIBRARY_CURSOR_PREFIX.length), 'base64url').toString('utf8'),
    ) as Record<string, unknown>;
    const createdAt = new Date(String(payload.createdAt ?? ''));
    const category = payload.category;
    const id = Number(payload.id);
    const rating = payload.rating == null ? null : Number(payload.rating);
    if (
      payload.sort !== sort
      || !Object.hasOwn(LIBRARY_CATEGORY_RANK, String(category))
      || Number.isNaN(createdAt.getTime())
      || !Number.isSafeInteger(id)
      || id <= 0
      || (sort === 'rating' && rating != null && (!Number.isInteger(rating) || rating < 1 || rating > 5))
    ) {
      return null;
    }
    return {
      sort,
      createdAt,
      category: category as LibraryRecordCategory,
      id,
      rating,
    };
  } catch {
    return null;
  }
}

function buildBaseWhere(options: ListRecordsOptions) {
  const createdAtRange = yearRange(options.year);
  return {
    ...(createdAtRange ? { createdAt: createdAtRange } : {}),
    ...(options.status ? { status: options.status } : {}),
    ...(options.importReview && options.importReview !== 'all'
      ? { importReviewState: options.importReview.toUpperCase() }
      : {}),
  };
}

function buildReviewWhere(review: LibraryReviewFilter = 'all') {
  if (review === 'reviewed') {
    return { AND: [{ shortReview: { not: null } }, { shortReview: { not: '' } }] };
  }
  if (review === 'unreviewed') {
    return { OR: [{ shortReview: null }, { shortReview: '' }] };
  }
  return {};
}

function buildMovieSourceWhere(source: LibrarySourceFilter = 'all') {
  switch (source) {
    case 'douban': return { doubanId: { not: null } };
    case 'tmdb': return { doubanId: null, tmdbId: { not: null } };
    case 'imdb': return { doubanId: null, tmdbId: null, imdbId: { not: null } };
    case 'trakt': return { doubanId: null, tmdbId: null, imdbId: null, traktId: { not: null } };
    case 'manual': return { doubanId: null, tmdbId: null, imdbId: null, traktId: null };
    default: return {};
  }
}

function buildGameSourceWhere(source: LibrarySourceFilter = 'all') {
  switch (source) {
    case 'psn': return {
      OR: [{ platformEntries: { some: { platform: 'PSN' } } }, { psnId: { not: null } }],
    };
    case 'xbox': return {
      OR: [{ platformEntries: { some: { platform: 'XBOX' } } }, { xboxId: { not: null } }],
    };
    case 'steam': return {
      OR: [{ platformEntries: { some: { platform: 'STEAM' } } }, { steamAppId: { not: null } }],
    };
    case 'rawg': return {
      platformEntries: { none: {} },
      psnId: null,
      xboxId: null,
      steamAppId: null,
      rawgId: { not: null },
    };
    case 'manual': return {
      platformEntries: { none: {} },
      psnId: null,
      xboxId: null,
      steamAppId: null,
      rawgId: null,
    };
    default: return {};
  }
}

function buildMediaQueryWhere(query?: string) {
  if (!query) return {};
  return {
    OR: [
      { title: { contains: query } },
      { doubanTitle: { contains: query } },
      { doubanAltTitle: { contains: query } },
      { tmdbTitle: { contains: query } },
    ],
  };
}

function buildGameQueryWhere(query?: string) {
  if (!query) return {};
  return {
    OR: [
      { title: { contains: query } },
      { platform: { contains: query } },
      { platformEntries: { some: { platform: { contains: query } } } },
    ],
  };
}

function buildEntityWhere(
  kind: 'movie',
  options: ListRecordsOptions,
  cursorWhere?: Record<string, unknown>,
): Prisma.MovieWhereInput;
function buildEntityWhere(
  kind: 'tv_show',
  options: ListRecordsOptions,
  cursorWhere?: Record<string, unknown>,
): Prisma.TvShowWhereInput;
function buildEntityWhere(
  kind: 'game',
  options: ListRecordsOptions,
  cursorWhere?: Record<string, unknown>,
): Prisma.GameWhereInput;
function buildEntityWhere(
  kind: 'movie' | 'tv_show' | 'game',
  options: ListRecordsOptions,
  cursorWhere: Record<string, unknown> = {},
): Prisma.MovieWhereInput | Prisma.TvShowWhereInput | Prisma.GameWhereInput {
  const sourceWhere = kind === 'game'
    ? buildGameSourceWhere(options.source)
    : buildMovieSourceWhere(options.source);
  const queryWhere = kind === 'game'
    ? buildGameQueryWhere(options.query)
    : buildMediaQueryWhere(options.query);
  const baseWhere = kind === 'game'
    ? buildBaseWhere({ ...options, status: undefined })
    : buildBaseWhere(options);
  return {
    AND: [
      baseWhere,
      kind === 'game' ? buildGameStatusWhere(options.status) : {},
      buildReviewWhere(options.review),
      sourceWhere,
      queryWhere,
      cursorWhere,
    ].filter(part => Object.keys(part).length > 0),
  } as Prisma.MovieWhereInput | Prisma.TvShowWhereInput | Prisma.GameWhereInput;
}

function sourceSupportsKind(source: LibrarySourceFilter = 'all', kind: 'media' | 'game') {
  if (source === 'all' || source === 'manual') return true;
  const mediaSources: LibrarySourceFilter[] = ['douban', 'tmdb', 'imdb', 'trakt'];
  return kind === 'media' ? mediaSources.includes(source) : !mediaSources.includes(source);
}

export function buildCompletedWhere(options?: ListRecordsOptions) {
  if (options?.status && options.status !== RecordStatus.DONE) return null;
  return {
    ...buildBaseWhere(options ?? {}),
    status: RecordStatus.DONE,
  };
}

function buildRankIdCursorWhere(
  kind: LibraryRecordCategory,
  cursor: LibraryCursor,
): Record<string, unknown> | null {
  const kindRank = LIBRARY_CATEGORY_RANK[kind];
  const cursorRank = cursor.category == null ? -1 : LIBRARY_CATEGORY_RANK[cursor.category];
  if (kindRank > cursorRank) return {};
  if (kindRank < cursorRank) return null;
  return { id: { lt: cursor.id } };
}

function buildLibraryCursorWhere(
  kind: LibraryRecordCategory,
  cursor: LibraryCursor | undefined,
) {
  if (!cursor) return {};
  const rankIdWhere = buildRankIdCursorWhere(kind, cursor);
  const sameDateWhere = rankIdWhere == null
    ? []
    : [{ createdAt: { equals: cursor.createdAt }, ...rankIdWhere }];

  if (cursor.sort === 'recent') {
    return {
      OR: [
        { createdAt: { lt: cursor.createdAt } },
        ...sameDateWhere,
      ],
    };
  }

  const sameRatingWhere = [
    { rating: cursor.rating, createdAt: { lt: cursor.createdAt } },
    ...sameDateWhere.map(where => ({ rating: cursor.rating, ...where })),
  ];
  if (cursor.rating == null) {
    return { OR: sameRatingWhere };
  }
  return {
    OR: [
      { rating: { lt: cursor.rating } },
      { rating: null },
      ...sameRatingWhere,
    ],
  };
}

function compareLibraryRecords(
  left: LibraryRecordResponse,
  right: LibraryRecordResponse,
  sort: LibrarySort,
) {
  if (sort === 'rating') {
    const leftRating = left.rating ?? null;
    const rightRating = right.rating ?? null;
    if (leftRating == null && rightRating != null) return 1;
    if (leftRating != null && rightRating == null) return -1;
    if (leftRating != null && rightRating != null && leftRating !== rightRating) {
      return rightRating - leftRating;
    }
  }

  const dateDifference = new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  if (dateDifference !== 0) return dateDifference;
  const categoryDifference = LIBRARY_CATEGORY_RANK[left.category] - LIBRARY_CATEGORY_RANK[right.category];
  if (categoryDifference !== 0) return categoryDifference;
  return right.id - left.id;
}

export async function listRecords(
  options?: ListRecordsOptions,
): Promise<{ records: LibraryRecordResponse[]; nextCursor: string | null; totals?: { total: number; rated: number; reviewed: number; completed: number } }> {
  const limit = Math.min(Math.max(options?.limit ?? 50, 1), 200);
  const pageTake = limit + 1;
  const sort = options?.sort ?? 'recent';
  const parsedCursor = options?.cursor ? parseLibraryCursor(options.cursor, sort) : null;
  if (options?.cursor && !parsedCursor) {
    throw Object.assign(new Error('cursor 与排序方式不匹配或格式无效'), { status: 400 });
  }
  const cursorObj = parsedCursor ?? undefined;

  const resolvedOptions = options ?? {};
  const movieWhere = buildEntityWhere(
    'movie', resolvedOptions, buildLibraryCursorWhere('movie', cursorObj),
  );
  const tvShowWhere = buildEntityWhere(
    'tv_show', resolvedOptions, buildLibraryCursorWhere('tv_show', cursorObj),
  );
  const gameWhere = buildEntityWhere(
    'game', resolvedOptions, buildLibraryCursorWhere('game', cursorObj),
  );
  const orderBy = sort === 'rating'
    ? [{ rating: 'desc' as const }, { createdAt: 'desc' as const }, { id: 'desc' as const }]
    : [{ createdAt: 'desc' as const }, { id: 'desc' as const }];

  const category = options?.category ?? 'all';
  // media is a PixelReel UI convention for movie + tv_show.
  const includeMovies = (category === 'all' || category === 'media' || category === 'movie')
    && sourceSupportsKind(options?.source, 'media');
  const includeTvShows = (category === 'all' || category === 'media' || category === 'tv_show')
    && sourceSupportsKind(options?.source, 'media');
  const includeGames = (category === 'all' || category === 'game')
    && sourceSupportsKind(options?.source, 'game');

  const [movies, games, tvShows, totals] = await Promise.all([
    includeMovies
      ? getDb().movie.findMany({ where: movieWhere, orderBy, take: pageTake })
      : Promise.resolve([]),
    includeGames
      ? getDb().game.findMany({
          where: gameWhere,
          orderBy,
          take: pageTake,
          include: { platformEntries: { orderBy: { platform: 'asc' } } },
        })
      : Promise.resolve([]),
    includeTvShows
      ? getDb().tvShow.findMany({ where: tvShowWhere, orderBy, take: pageTake })
      : Promise.resolve([]),
    options?.includeTotals === false ? Promise.resolve(undefined) : fetchTotals(options),
  ]);

  const allRecords: LibraryRecordResponse[] = [
    ...movies.map(toMovieRecord),
    ...games.map(toGameRecord),
    ...tvShows.map(toTvShowRecord),
  ];

  allRecords.sort((left, right) => compareLibraryRecords(left, right, sort));

  // 多取一条来判断是否有下一页
  const hasMore = allRecords.length > limit;
  const records = allRecords.slice(0, limit);
  const lastRecord = records[records.length - 1];
  const nextCursor = hasMore && lastRecord
    ? encodeLibraryCursor(lastRecord, sort)
    : null;

  return totals ? { records, nextCursor, totals } : { records, nextCursor };
}

async function fetchTotals(options?: ListRecordsOptions) {
  const db = getDb();
  const resolvedOptions = options ?? {};
  const movieWhere = buildEntityWhere('movie', resolvedOptions);
  const tvShowWhere = buildEntityWhere('tv_show', resolvedOptions);
  const gameWhere = buildEntityWhere('game', resolvedOptions);
  const completedWhere = buildCompletedWhere(options);
  const category = options?.category ?? 'all';
  const includeMovies = (category === 'all' || category === 'media' || category === 'movie')
    && sourceSupportsKind(options?.source, 'media');
  const includeTvShows = (category === 'all' || category === 'media' || category === 'tv_show')
    && sourceSupportsKind(options?.source, 'media');
  const includeGames = (category === 'all' || category === 'game')
    && sourceSupportsKind(options?.source, 'game');

  const [
    movieCount, tvCount, gameCount,
    movieRated, tvRated, gameRated,
    movieReviewed, tvReviewed, gameReviewed,
    movieDone, tvDone, gameDone,
  ] = await Promise.all([
    includeMovies ? db.movie.count({ where: movieWhere }) : Promise.resolve(0),
    includeTvShows ? db.tvShow.count({ where: tvShowWhere }) : Promise.resolve(0),
    includeGames ? db.game.count({ where: gameWhere }) : Promise.resolve(0),
    includeMovies ? db.movie.count({ where: { AND: [movieWhere, { rating: { not: null } }] } }) : Promise.resolve(0),
    includeTvShows ? db.tvShow.count({ where: { AND: [tvShowWhere, { rating: { not: null } }] } }) : Promise.resolve(0),
    includeGames ? db.game.count({ where: { AND: [gameWhere, { rating: { not: null } }] } }) : Promise.resolve(0),
    includeMovies ? db.movie.count({ where: { AND: [movieWhere, { shortReview: { not: null } }, { shortReview: { not: '' } }] } }) : Promise.resolve(0),
    includeTvShows ? db.tvShow.count({ where: { AND: [tvShowWhere, { shortReview: { not: null } }, { shortReview: { not: '' } }] } }) : Promise.resolve(0),
    includeGames ? db.game.count({ where: { AND: [gameWhere, { shortReview: { not: null } }, { shortReview: { not: '' } }] } }) : Promise.resolve(0),
    includeMovies && completedWhere ? db.movie.count({ where: { AND: [movieWhere, completedWhere] } }) : Promise.resolve(0),
    includeTvShows && completedWhere ? db.tvShow.count({ where: { AND: [tvShowWhere, completedWhere] } }) : Promise.resolve(0),
    includeGames && completedWhere ? db.game.count({ where: { AND: [gameWhere, completedWhere] } }) : Promise.resolve(0),
  ]);
  return {
    total: movieCount + tvCount + gameCount,
    rated: movieRated + tvRated + gameRated,
    reviewed: movieReviewed + tvReviewed + gameReviewed,
    completed: movieDone + tvDone + gameDone,
  };
}

export async function getRandomRecord(
  options?: RandomRecordsOptions,
): Promise<LibraryRecordResponse | null> {
  const results = await getRandomRecords(1, options);
  return results[0] ?? null;
}

export async function getRandomRecords(
  count: number,
  options: RandomRecordsOptions = {},
): Promise<LibraryRecordResponse[]> {
  const db = getDb();
  const category = options.category ?? 'all';
  const where = options.status ? { status: options.status } : {};
  const gameWhere = buildGameStatusWhere(options.status);
  const includeMovies = category === 'all' || category === 'movie';
  const includeGames = category === 'all' || category === 'game';
  const includeTvShows = category === 'all' || category === 'tv_show';

  const [movieCount, gameCount, tvCount] = await Promise.all([
    includeMovies ? db.movie.count({ where }) : Promise.resolve(0),
    includeGames ? db.game.count({ where: gameWhere }) : Promise.resolve(0),
    includeTvShows ? db.tvShow.count({ where }) : Promise.resolve(0),
  ]);

  const total = movieCount + gameCount + tvCount;
  if (total === 0) return [];

  const seen = new Set<string>();
  const results: LibraryRecordResponse[] = [];
  const maxAttempts = count * 5;
  let attempts = 0;

  while (results.length < count && attempts < maxAttempts) {
    attempts++;
    const offset = Math.floor(Math.random() * total);

    let record: LibraryRecordResponse | null = null;
    if (offset < movieCount) {
      const movie = (await db.movie.findMany({ where, skip: offset, take: 1 }))[0];
      record = movie ? toMovieRecord(movie) : null;
    } else if (offset < movieCount + gameCount) {
      const game = (await db.game.findMany({
        where: gameWhere,
        skip: offset - movieCount,
        take: 1,
        include: { platformEntries: { orderBy: { platform: 'asc' } } },
      }))[0];
      record = game ? toGameRecord(game) : null;
    } else {
      const show = (await db.tvShow.findMany({
        where,
        skip: offset - movieCount - gameCount,
        take: 1,
      }))[0];
      record = show ? toTvShowRecord(show) : null;
    }

    if (record) {
      const key = `${record.category}-${record.id}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push(record);
      }
    }
  }

  return results;
}

export async function getRecord(category: string, id: number): Promise<LibraryRecordResponse> {
  const normalized = category.trim().toLowerCase();

  if (normalized === 'movie') {
    const movie = await getDb().movie.findUnique({ where: { id } });
    if (!movie) throw Object.assign(new Error('Movie record not found'), { status: 404 });
    return toMovieRecord(movie);
  } else if (normalized === 'game') {
    const game = await getDb().game.findUnique({
      where: { id },
      include: { platformEntries: { orderBy: { platform: 'asc' } } },
    });
    if (!game) throw Object.assign(new Error('Game record not found'), { status: 404 });
    return toGameRecord(game);
  } else if (normalized === 'tv_show' || normalized === 'tvshow') {
    const show = await getDb().tvShow.findUnique({ where: { id } });
    if (!show) throw Object.assign(new Error('TV Show record not found'), { status: 404 });
    return toTvShowRecord(show);
  } else {
    throw Object.assign(new Error(`Unknown category: ${category}`), { status: 400 });
  }
}

export async function updateRecord(
  category: string,
  id: number,
  request: LibraryRecordUpdateRequest,
): Promise<LibraryRecordResponse> {
  const normalized = category.trim().toLowerCase();

  if (normalized === 'movie') {
    return updateMovie(id, request);
  } else if (normalized === 'game') {
    return updateGame(id, request);
  } else if (normalized === 'tv_show' || normalized === 'tvshow') {
    return updateTvShow(id, request);
  } else {
    throw new Error(`Unknown category: ${category}`);
  }
}

async function updateMovie(id: number, request: LibraryRecordUpdateRequest): Promise<LibraryRecordResponse> {
  const movie = await getDb().movie.findUnique({ where: { id } });
  if (!movie) throw Object.assign(new Error('Movie record not found'), { status: 404 });

  await getDb().movie.update({
    where: { id },
    data: {
      status: request.status,
      rating: request.rating ?? null,
      shortReview: request.shortReview?.trim() || null,
    },
  });

  const updated = await getDb().movie.findUnique({ where: { id } });
  return toMovieRecord(updated!);
}

async function updateGame(id: number, request: LibraryRecordUpdateRequest): Promise<LibraryRecordResponse> {
  const game = await getDb().game.findUnique({ where: { id } });
  if (!game) throw Object.assign(new Error('Game record not found'), { status: 404 });

  await getDb().game.update({
    where: { id },
    data: {
      status: request.status,
      rating: request.rating ?? null,
      shortReview: request.shortReview?.trim() || null,
    },
  });

  const updated = await getDb().game.findUnique({
    where: { id },
    include: { platformEntries: { orderBy: { platform: 'asc' } } },
  });
  return toGameRecord(updated!);
}

async function updateTvShow(id: number, request: LibraryRecordUpdateRequest): Promise<LibraryRecordResponse> {
  const show = await getDb().tvShow.findUnique({ where: { id } });
  if (!show) throw Object.assign(new Error('TV Show record not found'), { status: 404 });

  await getDb().tvShow.update({
    where: { id },
    data: {
      status: request.status,
      rating: request.rating ?? null,
      shortReview: request.shortReview?.trim() || null,
    },
  });

  const updated = await getDb().tvShow.findUnique({ where: { id } });
  return toTvShowRecord(updated!);
}

export function toMovieRecord(movie: any): LibraryRecordResponse {
  const sourceKey = detectMovieSource(movie);
  return {
    id: Number(movie.id),
    category: 'movie',
    title: movie.title,
    posterUrl: movie.posterUrl,
    sourceKey,
    sourceLabel: movieSourceLabel(sourceKey),
    platformLabel: null,
    status: movie.status || RecordStatus.UNSET,
    rating: movie.rating,
    shortReview: movie.shortReview,
    playtimeMinutes: null,
    achievementTotal: null,
    achievementUnlocked: null,
    createdAt: movie.createdAt,
    updatedAt: movie.updatedAt,
    importedAt: null,
    importReviewState: movie.importReviewState ?? 'ACCEPTED',
    overview: movie.overview ?? null,
    releaseDate: movie.releaseDate ?? null,
    firstAirDate: null,
    platform: null,
    platformEntries: [],
    doubanId: movie.doubanId ?? null,
    tmdbId: movie.tmdbId?.toString() ?? null,
    imdbId: movie.imdbId ?? null,
    traktId: movie.traktId ?? null,
    rawgId: null,
    steamAppId: null,
    xboxId: null,
    psnId: null,
    doubanTitle: movie.doubanTitle ?? null,
    doubanAltTitle: movie.doubanAltTitle ?? null,
    doubanIntro: movie.doubanIntro ?? null,
    doubanRating: movie.doubanRating ?? null,
    doubanDate: movie.doubanDate ?? null,
    doubanComment: movie.doubanComment ?? null,
    doubanLink: movie.doubanLink ?? null,
    doubanAvgRating: movie.doubanAvgRating != null ? Number(movie.doubanAvgRating) : null,
    tmdbTitle: movie.tmdbTitle ?? null,
    tmdbPosterUrl: movie.tmdbPosterUrl ?? null,
    tmdbReleaseDate: movie.tmdbReleaseDate ?? null,
    tmdbOverview: movie.tmdbOverview ?? null,
    tmdbVoteAverage: movie.tmdbVoteAverage != null ? Number(movie.tmdbVoteAverage) : null,
    tmdbPopularity: movie.tmdbPopularity != null ? Number(movie.tmdbPopularity) : null,
    tmdbGenreIds: movie.tmdbGenreIds ?? null,
    imdbRating: movie.imdbRating != null ? Number(movie.imdbRating) : null,
  };
}

export function toGameRecord(game: any): LibraryRecordResponse {
  const sourceKey = detectGameSource(game);
  const platformEntries = (game.platformEntries ?? []).map((entry: any) => {
    const achievementProgress = normalizePlatformAchievementProgress(
      entry.achievementTotal,
      entry.achievementUnlocked,
    );
    return {
      platform: entry.platform,
      externalId: entry.externalId,
      playtimeMinutes: entry.playtimeMinutes,
      ...achievementProgress,
      importedAt: entry.importedAt,
      lastSyncedAt: entry.lastSyncedAt,
    };
  });
  const achievementProgress = normalizePlatformAchievementProgress(
    game.achievementTotal,
    game.achievementUnlocked,
  );
  const platformLabels = platformEntries.map((entry: any) => gameSourceLabel(
    entry.platform.toLowerCase(),
  ));
  return {
    id: Number(game.id),
    category: 'game',
    title: game.title,
    posterUrl: game.posterUrl,
    sourceKey,
    sourceLabel: gameSourceLabel(sourceKey),
    platformLabel: platformLabels.length > 0
      ? platformLabels.join(' / ')
      : game.platform
      ? (game.platform.trim().toUpperCase() === 'PSN' ? 'PSN'
        : game.platform.trim().toUpperCase() === 'XBOX' ? 'Xbox'
        : game.platform.trim().toUpperCase() === 'STEAM' ? 'Steam'
        : game.platform)
      : gameSourceLabel(sourceKey),
    status: effectiveGameStatus(game),
    rating: game.rating,
    shortReview: game.shortReview,
    playtimeMinutes: gamePlaytimeMinutes(game),
    achievementTotal: achievementProgress.achievementTotal,
    achievementUnlocked: achievementProgress.achievementUnlocked,
    createdAt: game.createdAt,
    updatedAt: game.updatedAt,
    importedAt: game.importedAt,
    importReviewState: game.importReviewState ?? 'ACCEPTED',
    overview: null,
    releaseDate: null,
    firstAirDate: null,
    platform: game.platform ?? null,
    platformEntries,
    doubanId: null,
    tmdbId: null,
    imdbId: null,
    traktId: null,
    rawgId: game.rawgId?.toString() ?? null,
    steamAppId: game.steamAppId?.toString() ?? null,
    xboxId: game.xboxId ?? null,
    psnId: game.psnId ?? null,
    doubanTitle: null, doubanAltTitle: null, doubanIntro: null,
    doubanRating: null, doubanDate: null, doubanComment: null,
    doubanLink: null, doubanAvgRating: null,
    tmdbTitle: null, tmdbPosterUrl: null, tmdbReleaseDate: null,
    tmdbOverview: null, tmdbVoteAverage: null, tmdbPopularity: null,
    tmdbGenreIds: null,
    imdbRating: null,
  };
}

export function toTvShowRecord(show: any): LibraryRecordResponse {
  const sourceKey = detectTvShowSource(show);
  return {
    id: Number(show.id),
    category: 'tv_show',
    title: show.title,
    posterUrl: show.posterUrl,
    sourceKey,
    sourceLabel: tvShowSourceLabel(sourceKey),
    platformLabel: null,
    status: show.status || RecordStatus.UNSET,
    rating: show.rating,
    shortReview: show.shortReview,
    playtimeMinutes: null,
    achievementTotal: null,
    achievementUnlocked: null,
    createdAt: show.createdAt,
    updatedAt: show.updatedAt,
    importedAt: null,
    importReviewState: show.importReviewState ?? 'ACCEPTED',
    overview: show.overview ?? null,
    releaseDate: null,
    firstAirDate: show.firstAirDate ?? null,
    platform: null,
    platformEntries: [],
    doubanId: show.doubanId ?? null,
    tmdbId: show.tmdbId?.toString() ?? null,
    imdbId: show.imdbId ?? null,
    traktId: show.traktId ?? null,
    rawgId: null,
    steamAppId: null,
    xboxId: null,
    psnId: null,
    doubanTitle: show.doubanTitle ?? null,
    doubanAltTitle: show.doubanAltTitle ?? null,
    doubanIntro: show.doubanIntro ?? null,
    doubanRating: show.doubanRating ?? null,
    doubanDate: show.doubanDate ?? null,
    doubanComment: show.doubanComment ?? null,
    doubanLink: show.doubanLink ?? null,
    doubanAvgRating: show.doubanAvgRating != null ? Number(show.doubanAvgRating) : null,
    tmdbTitle: show.tmdbTitle ?? null,
    tmdbPosterUrl: show.tmdbPosterUrl ?? null,
    tmdbReleaseDate: show.tmdbReleaseDate ?? null,
    tmdbOverview: show.tmdbOverview ?? null,
    tmdbVoteAverage: show.tmdbVoteAverage != null ? Number(show.tmdbVoteAverage) : null,
    tmdbPopularity: show.tmdbPopularity != null ? Number(show.tmdbPopularity) : null,
    tmdbGenreIds: show.tmdbGenreIds ?? null,
    imdbRating: show.imdbRating != null ? Number(show.imdbRating) : null,
  };
}

export function detectMovieSource(movie: any): string {
  if (movie.doubanId) return 'douban';
  if (movie.tmdbId) return 'tmdb';
  if (movie.imdbId) return 'imdb';
  if (movie.traktId) return 'trakt';
  return 'manual';
}

export function detectGameSource(game: any): string {
  const platforms = new Set(
    (game.platformEntries ?? []).map((entry: any) => entry.platform?.toUpperCase()),
  );
  if (platforms.has('PSN')) return 'psn';
  if (platforms.has('XBOX')) return 'xbox';
  if (platforms.has('STEAM')) return 'steam';
  if (game.psnId) return 'psn';
  if (game.xboxId) return 'xbox';
  if (game.steamAppId) return 'steam';
  if (game.rawgId) return 'rawg';
  return 'manual';
}

export function detectTvShowSource(show: any): string {
  if (show.doubanId) return 'douban';
  if (show.tmdbId) return 'tmdb';
  if (show.imdbId) return 'imdb';
  if (show.traktId) return 'trakt';
  return 'manual';
}

export function movieSourceLabel(sourceKey: string): string {
  const map: Record<string, string> = { douban: '豆瓣', tmdb: 'TMDB', imdb: 'IMDb', trakt: 'Trakt' };
  return map[sourceKey] || 'Manual';
}

export function gameSourceLabel(sourceKey: string): string {
  const map: Record<string, string> = { psn: 'PSN', xbox: 'Xbox', steam: 'Steam', rawg: 'RAWG' };
  return map[sourceKey] || 'Manual';
}

export function tvShowSourceLabel(sourceKey: string): string {
  const map: Record<string, string> = { douban: '豆瓣', tmdb: 'TMDB', imdb: 'IMDb', trakt: 'Trakt' };
  return map[sourceKey] || 'Manual';
}
