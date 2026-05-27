import { Router, Request, Response } from 'express';
import { getDb } from '../config/db';
import { runRadarSync, isSyncRunning, getRadarSyncStatus } from '../services/radar/radarSyncService';

const router = Router();

const VALID_CATEGORIES = ['now_playing', 'upcoming', 'trending', 'on_the_air'];
const VALID_TYPES = ['movie', 'tv'];

// GET /api/radar — list with filters
router.get('/', async (req: Request, res: Response) => {
  const category = req.query.category as string | undefined;
  const type = req.query.type as string | undefined;
  const platform = req.query.platform as string | undefined;
  const source = req.query.source as string | undefined;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 40));

  const where: any = {};
  if (category && VALID_CATEGORIES.includes(category)) where.category = category;
  if (type && VALID_TYPES.includes(type)) where.type = type;
  if (platform) where.platform = platform;
  if (source) where.source = source;

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
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/radar/status
router.get('/status', (_req: Request, res: Response) => {
  const status = getRadarSyncStatus();
  res.json({ running: isSyncRunning(), lastTask: status });
});

// POST /api/radar/sync — trigger full sync
router.post('/sync', async (_req: Request, res: Response) => {
  if (isSyncRunning()) {
    res.status(409).json({ error: '同步正在运行中' });
    return;
  }
  try {
    const { taskId } = await runRadarSync();
    res.json({ taskId, status: 'running' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/radar/sync/:source — trigger single-source sync
router.post('/sync/:source', async (req: Request, res: Response) => {
  if (isSyncRunning()) {
    res.status(409).json({ error: '同步正在运行中' });
    return;
  }
  const source = req.params.source as string;
  try {
    const { taskId } = await runRadarSync(source);
    res.json({ taskId, status: 'running' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/radar/add-to-library
router.post('/add-to-library', async (req: Request, res: Response) => {
  const { radarItemId } = req.body;
  if (!radarItemId) {
    res.status(400).json({ error: 'radarItemId required' });
    return;
  }

  try {
    const db = getDb();
    const radarItem = await db.radarItem.findUnique({ where: { id: Number(radarItemId) } });
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
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;