import { Router, Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { getDb } from '../config/db';
import { runRadarSync, isSyncRunning, getRadarSyncStatus, runNewReleaseRadarSync, isNewReleaseSyncRunning, getNewReleaseRadarSyncStatus } from '../services/radar/radarSyncService';
import {
  assertNoQueryParameters,
  parseEnumParameter,
  parsePositiveBigIntParameter,
  parsePositiveIntegerParameter,
  RequestValidationError,
} from './request-validation';

const router = Router();

const VALID_CATEGORIES = ['now_playing', 'upcoming', 'trending', 'on_the_air'] as const;
const VALID_TYPES = ['movie', 'tv'] as const;
const VALID_PLATFORMS = ['Netflix', 'Disney+', 'Apple TV+', 'Max', '优酷', '腾讯视频'] as const;
const VALID_SOURCES = ['tmdb', 'youku', 'tencent', 'douban'] as const;
const SYNC_SOURCES = ['tmdb', 'youku', 'tencent'] as const;
const VALID_SYNC_TYPES = ['new_release', 'popular'] as const;
const RADAR_LIST_PARAMETER_KEYS = new Set([
  'category', 'type', 'platform', 'source', 'syncType', 'page', 'limit',
]);

export function parseRadarListParameters(query: Record<string, unknown>) {
  const unknownKey = Object.keys(query).find(key => !RADAR_LIST_PARAMETER_KEYS.has(key));
  if (unknownKey) throw new RequestValidationError(`未知参数: ${unknownKey}`);

  return {
    category: parseEnumParameter(query.category, 'category', VALID_CATEGORIES),
    type: parseEnumParameter(query.type, 'type', VALID_TYPES),
    platform: parseEnumParameter(query.platform, 'platform', VALID_PLATFORMS),
    source: parseEnumParameter(query.source, 'source', VALID_SOURCES),
    syncType: parseEnumParameter(query.syncType, 'syncType', VALID_SYNC_TYPES),
    page: parsePositiveIntegerParameter(query.page, 'page', 1, 10000),
    limit: parsePositiveIntegerParameter(query.limit, 'limit', 40, 100),
  };
}

export function parseRadarSyncSource(value: unknown) {
  return parseEnumParameter(value, 'source', SYNC_SOURCES, true)!;
}

export function assertRadarSyncRequest(query: Record<string, unknown>, body: unknown) {
  const unknownKey = Object.keys(query)[0];
  if (unknownKey) throw new RequestValidationError(`未知参数: ${unknownKey}`);
  if (body === undefined) return;
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body as Record<string, unknown>).length > 0) {
    throw new RequestValidationError('请求体必须为空');
  }
}

export function parseRadarItemIdBody(value: unknown): bigint {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RequestValidationError('请求体必须是对象');
  }
  const body = value as Record<string, unknown>;
  const unknownKey = Object.keys(body).find(key => key !== 'radarItemId');
  if (unknownKey) throw new RequestValidationError(`未知字段: ${unknownKey}`);
  return parsePositiveBigIntParameter(body.radarItemId, 'radarItemId', true)!;
}

// GET /api/radar — list with filters
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  const { category, type, platform, source, syncType, page, limit } = parseRadarListParameters(
    req.query as Record<string, unknown>,
  );

  const where: any = {};
  if (category) where.category = category;
  if (type) where.type = type;
  if (platform) where.platform = platform;
  if (source) where.source = source;
  if (syncType) where.syncType = syncType;

  try {
    const db = getDb();
    const [items, total] = await Promise.all([
      db.radarItem.findMany({
        where,
        orderBy: { lastSyncedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.radarItem.count({ where }),
    ]);

    // Batch check inLibrary: collect tmdbIds, query Movie/TvShow once
    const tmdbIds = items
      .filter(i => i.tmdbId !== null)
      .map(i => Number(i.tmdbId));
    const inLibraryMovieIds = new Set<number>();
    const inLibraryTvIds = new Set<number>();
    if (tmdbIds.length > 0) {
      const [movies, tvShows] = await Promise.all([
        db.movie.findMany({ where: { tmdbId: { in: tmdbIds } }, select: { tmdbId: true } }),
        db.tvShow.findMany({ where: { tmdbId: { in: tmdbIds } }, select: { tmdbId: true } }),
      ]);
      movies.forEach(m => m.tmdbId && inLibraryMovieIds.add(Number(m.tmdbId)));
      tvShows.forEach(t => t.tmdbId && inLibraryTvIds.add(Number(t.tmdbId)));
    }

    const itemsWithInLibrary = items.map(item => ({
      ...item,
      inLibrary: item.tmdbId
        ? (item.type === 'movie' ? inLibraryMovieIds : inLibraryTvIds).has(Number(item.tmdbId))
        : false,
    }));

    const latestSync = await db.radarItem.findFirst({
      where: {},
      orderBy: { lastSyncedAt: 'desc' },
      select: { lastSyncedAt: true },
    });

    res.json({
      items: itemsWithInLibrary,
      page,
      limit,
      total,
      lastSyncedAt: latestSync?.lastSyncedAt ?? null,
      warnings: [],
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/radar/status
router.get('/status', (_req: Request, res: Response) => {
  const status = getRadarSyncStatus();
  res.json({ running: isSyncRunning(), lastTask: status });
});

// POST /api/radar/sync — trigger full sync
router.post('/sync', async (req: Request, res: Response, next: NextFunction) => {
  assertRadarSyncRequest(req.query, req.body);
  if (!config.radar.enabled) {
    res.status(403).json({ error: '雷达模块未启用' });
    return;
  }
  if (isSyncRunning()) {
    res.status(409).json({ error: '同步正在运行中' });
    return;
  }
  try {
    const { taskId } = await runRadarSync();
    res.json({ taskId, status: 'running' });
  } catch (err) {
    next(err);
  }
});

// POST /api/radar/sync/:source — trigger single-source sync
router.post('/sync/:source', async (req: Request, res: Response, next: NextFunction) => {
  assertRadarSyncRequest(req.query, req.body);
  const source = parseRadarSyncSource(req.params.source);
  if (!config.radar.enabled) {
    res.status(403).json({ error: '雷达模块未启用' });
    return;
  }
  if (isSyncRunning()) {
    res.status(409).json({ error: '同步正在运行中' });
    return;
  }
  try {
    const { taskId } = await runRadarSync(source);
    res.json({ taskId, status: 'running' });
  } catch (err) {
    next(err);
  }
});

// GET /api/radar/new-releases/status
router.get('/new-releases/status', (_req: Request, res: Response) => {
  const status = getNewReleaseRadarSyncStatus();
  res.json({ running: isNewReleaseSyncRunning(), lastTask: status });
});

// POST /api/radar/sync-new-releases — trigger new release sync
router.post('/sync-new-releases', async (req: Request, res: Response, next: NextFunction) => {
  assertRadarSyncRequest(req.query, req.body);
  if (!config.radar.enabled) {
    res.status(403).json({ error: '雷达模块未启用' });
    return;
  }
  if (isNewReleaseSyncRunning()) {
    res.status(409).json({ error: '新片同步正在运行中' });
    return;
  }
  try {
    const { taskId } = await runNewReleaseRadarSync();
    res.json({ taskId, status: 'running' });
  } catch (err) {
    next(err);
  }
});

// POST /api/radar/sync-new-releases/:source — trigger single-source new release sync
router.post('/sync-new-releases/:source', async (req: Request, res: Response, next: NextFunction) => {
  assertRadarSyncRequest(req.query, req.body);
  const source = parseRadarSyncSource(req.params.source);
  if (!config.radar.enabled) {
    res.status(403).json({ error: '雷达模块未启用' });
    return;
  }
  if (isNewReleaseSyncRunning()) {
    res.status(409).json({ error: '新片同步正在运行中' });
    return;
  }
  try {
    const { taskId } = await runNewReleaseRadarSync(source);
    res.json({ taskId, status: 'running' });
  } catch (err) {
    next(err);
  }
});

// POST /api/radar/add-to-library
router.post('/add-to-library', async (req: Request, res: Response, next: NextFunction) => {
  assertNoQueryParameters(req.query);
  const radarItemId = parseRadarItemIdBody(req.body);

  try {
    const db = getDb();
    const radarItem = await db.radarItem.findUnique({ where: { id: radarItemId } });
    if (!radarItem) {
      res.status(404).json({ error: 'RadarItem not found' });
      return;
    }

    const category = radarItem.type === 'tv' ? 'tv_show' : 'movie';

    // Dedup by tmdbId
    if (radarItem.tmdbId) {
      const existing = radarItem.type === 'tv'
        ? await db.tvShow.findFirst({ where: { tmdbId: Number(radarItem.tmdbId) } })
        : await db.movie.findFirst({ where: { tmdbId: Number(radarItem.tmdbId) } });
      if (existing) {
        res.json({ exists: true, recordId: existing.id, category });
        return;
      }
    }

    // Dedup by title for items without tmdbId
    if (!radarItem.tmdbId) {
      const title = radarItem.titleZh || radarItem.title;
      const existing = radarItem.type === 'tv'
        ? await db.tvShow.findFirst({ where: { title } })
        : await db.movie.findFirst({ where: { title } });
      if (existing) {
        res.json({ exists: true, recordId: existing.id, category });
        return;
      }
    }

    // Create new record with status=WANT
    if (radarItem.type === 'tv') {
      const show = await db.tvShow.create({
        data: {
          title: radarItem.titleZh || radarItem.title,
          posterUrl: radarItem.posterPath,
          firstAirDate: radarItem.releaseDate,
          overview: radarItem.overview,
          status: 'WANT',
          tmdbId: radarItem.tmdbId ? Number(radarItem.tmdbId) : null,
          tmdbTitle: radarItem.title,
          tmdbPosterUrl: radarItem.posterPath,
          tmdbReleaseDate: radarItem.releaseDate,
          tmdbOverview: radarItem.overview,
          tmdbVoteAverage: radarItem.voteAverage,
        },
      });
      res.json({ exists: false, recordId: show.id, category });
    } else {
      const movie = await db.movie.create({
        data: {
          title: radarItem.titleZh || radarItem.title,
          posterUrl: radarItem.posterPath,
          releaseDate: radarItem.releaseDate,
          overview: radarItem.overview,
          status: 'WANT',
          tmdbId: radarItem.tmdbId ? Number(radarItem.tmdbId) : null,
          tmdbTitle: radarItem.title,
          tmdbPosterUrl: radarItem.posterPath,
          tmdbReleaseDate: radarItem.releaseDate,
          tmdbOverview: radarItem.overview,
          tmdbVoteAverage: radarItem.voteAverage,
        },
      });
      res.json({ exists: false, recordId: movie.id, category });
    }
  } catch (err) {
    next(err);
  }
});

export default router;
