import { Router, Request, Response } from 'express';
import axios from 'axios';
import { config } from '../config';
import { prisma } from '../config/db';
import { RecordStatus } from '../enums/RecordStatus';

const router = Router();

// GET /api/trakt/auth — 重定向到 Trakt 授权页
router.get('/auth', (_req: Request, res: Response) => {
  if (!config.trakt.clientId) {
    res.status(400).json({ error: '未配置 TRAKT_CLIENT_ID' });
    return;
  }
  const authUrl = `${config.trakt.baseUrl}/oauth/authorize?response_type=code&client_id=${config.trakt.clientId}&redirect_uri=${encodeURIComponent(config.trakt.redirectUri)}`;
  res.redirect(authUrl);
});

// GET /api/trakt/callback — Trakt OAuth 回调
router.get('/callback', async (req: Request, res: Response) => {
  const code = req.query.code as string;
  if (!code) {
    res.status(400).json({ error: '缺少授权码' });
    return;
  }

  try {
    const tokenRes = await axios.post(`${config.trakt.baseUrl}/oauth/token`, {
      code,
      client_id: config.trakt.clientId,
      client_secret: config.trakt.clientSecret,
      redirect_uri: config.trakt.redirectUri,
      grant_type: 'authorization_code',
    });

    const accessToken = tokenRes.data.access_token;
    res.json({
      message: 'Trakt 授权成功！请将以下 access_token 配置到 .env 的 TRAKT_ACCESS_TOKEN',
      access_token: accessToken,
    });
  } catch (ex: any) {
    res.status(500).json({ error: `Trakt 授权失败: ${ex.message}` });
  }
});

// 分页辅助函数，自动处理 Trakt 的分页拉取
async function fetchAllTraktPages(endpoint: string, accessToken: string) {
  const headers = {
    'trakt-api-key': config.trakt.clientId,
    'trakt-api-version': '2',
    Authorization: `Bearer ${accessToken}`,
  };
  
  let page = 1;
  const limit = 250; // 根据 Trakt 最新 API 规范，单页最稳妥上限为 250
  let allData: any[] = [];
  
  while (true) {
    const res = await axios.get(`${config.trakt.baseUrl}${endpoint}?page=${page}&limit=${limit}`, { headers });
    const data = res.data || [];
    allData = allData.concat(data);
    
    // 解析 Trakt 返回的分页 Headers
    const pageCount = parseInt(res.headers['x-pagination-page-count'] || '1', 10);
    if (page >= pageCount) {
      break;
    }
    page++;
  }
  
  return allData;
}

// POST /api/trakt/import/movies?accessToken=xxx&status=DONE
router.post('/import/movies', async (req: Request, res: Response) => {
  const accessToken = (req.query.accessToken as string) || config.trakt.accessToken;
  if (!accessToken) {
    res.status(400).json({ error: '需要 Trakt access_token，请先完成 OAuth 授权' });
    return;
  }

  const status = (req.query.status as string) || RecordStatus.WANT;

  try {
    // 使用自动分页并发拉取所有页面的数据
    const [watched, watchlist] = await Promise.all([
      fetchAllTraktPages('/sync/history/movies', accessToken),
      fetchAllTraktPages('/sync/watchlist/movies', accessToken)
    ]);

    // 用 traktId 去重合并
    const seen = new Set<number>();
    const allMovies: any[] = [];

    for (const item of watched) {
      const traktId = item.movie?.ids?.trakt;
      if (traktId && !seen.has(traktId)) {
        seen.add(traktId);
        allMovies.push({ ...item, _source: 'watched' });
      }
    }
    for (const item of watchlist) {
      const traktId = item.movie?.ids?.trakt;
      if (traktId && !seen.has(traktId)) {
        seen.add(traktId);
        allMovies.push({ ...item, _source: 'watchlist' });
      }
    }

    // 批量查已有记录
    const traktIds = allMovies.map((m: any) => m.movie?.ids?.trakt).filter(Boolean).map(String);
    const tmdbIds = allMovies.map((m: any) => m.movie?.ids?.tmdb).filter(Boolean);
    const imdbIds = allMovies.map((m: any) => m.movie?.ids?.imdb).filter(Boolean);

    const existingTrakt = traktIds.length > 0
      ? new Map((await prisma.movie.findMany({ where: { traktId: { in: traktIds } } })).map((m) => [m.traktId!, m]))
      : new Map<string, any>();
    const existingTmdb = tmdbIds.length > 0
      ? new Map((await prisma.movie.findMany({ where: { tmdbId: { in: tmdbIds } } })).map((m) => [m.tmdbId!, m]))
      : new Map<any, any>();
    const existingImdb = imdbIds.length > 0
      ? new Map((await prisma.movie.findMany({ where: { imdbId: { in: imdbIds } } })).map((m) => [m.imdbId!, m]))
      : new Map<string, any>();

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const item of allMovies) {
      if (!item.movie) { skipped++; continue; }
      const ids = item.movie.ids || {};
      const title = item.movie.title;
      if (!title) { skipped++; continue; }

      // 检查是否已存在
      let existing: any = null;
      if (ids.trakt) existing = existingTrakt.get(String(ids.trakt));
      if (!existing && ids.tmdb) existing = existingTmdb.get(ids.tmdb);
      if (!existing && ids.imdb) existing = existingImdb.get(ids.imdb);
      if (existing) { skipped++; continue; }

      // 已看完的用 DONE，想看的用传入的 status
      const movieStatus = item._source === 'watched' ? RecordStatus.DONE : status;
      // Trakt 评分 1-10，直接用
      const rating = item.movie.rating ? Math.round(item.movie.rating * 2) : null;

      try {
        await prisma.movie.create({
          data: {
            title,
            traktId: ids.trakt ? String(ids.trakt) : null,
            tmdbId: ids.tmdb || null,
            imdbId: ids.imdb || null,
            posterUrl: null,
            status: movieStatus,
            rating,
            shortReview: '',
          },
        });
        imported++;
      } catch (ex: any) {
        errors.push(`导入失败: ${title}，原因: ${ex.message}`);
        skipped++;
      }
    }

    res.json({ total: allMovies.length, imported, skipped, errors });
  } catch (ex: any) {
    res.status(500).json({ error: `Trakt 导入失败: ${ex.message}` });
  }
});

// POST /api/trakt/import/shows?accessToken=xxx&status=DONE
router.post('/import/shows', async (req: Request, res: Response) => {
  const accessToken = (req.query.accessToken as string) || config.trakt.accessToken;
  if (!accessToken) {
    res.status(400).json({ error: '需要 Trakt access_token，请先完成 OAuth 授权' });
    return;
  }

  const status = (req.query.status as string) || RecordStatus.WANT;

  try {
    // 使用自动分页并发拉取所有页面的数据
    const [watched, watchlist] = await Promise.all([
      fetchAllTraktPages('/sync/history/shows', accessToken),
      fetchAllTraktPages('/sync/watchlist/shows', accessToken)
    ]);

    // 用 traktId 去重合并
    const seen = new Set<number>();
    const allShows: any[] = [];

    for (const item of watched) {
      const traktId = item.show?.ids?.trakt;
      if (traktId && !seen.has(traktId)) {
        seen.add(traktId);
        allShows.push({ ...item, _source: 'watched' });
      }
    }
    for (const item of watchlist) {
      const traktId = item.show?.ids?.trakt;
      if (traktId && !seen.has(traktId)) {
        seen.add(traktId);
        allShows.push({ ...item, _source: 'watchlist' });
      }
    }

    // 批量查已有记录
    const traktIds = allShows.map((s: any) => s.show?.ids?.trakt).filter(Boolean).map(String);
    const tmdbIds = allShows.map((s: any) => s.show?.ids?.tmdb).filter(Boolean);
    const imdbIds = allShows.map((s: any) => s.show?.ids?.imdb).filter(Boolean);

    const existingTrakt = traktIds.length > 0
      ? new Map((await prisma.tvShow.findMany({ where: { traktId: { in: traktIds } } })).map((s) => [s.traktId!, s]))
      : new Map<string, any>();
    const existingTmdb = tmdbIds.length > 0
      ? new Map((await prisma.tvShow.findMany({ where: { tmdbId: { in: tmdbIds } } })).map((s) => [s.tmdbId!, s]))
      : new Map<any, any>();
    const existingImdb = imdbIds.length > 0
      ? new Map((await prisma.tvShow.findMany({ where: { imdbId: { in: imdbIds } } })).map((s) => [s.imdbId!, s]))
      : new Map<string, any>();

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const item of allShows) {
      if (!item.show) { skipped++; continue; }
      const ids = item.show.ids || {};
      const title = item.show.title;
      if (!title) { skipped++; continue; }

      // 检查是否已存在
      let existing: any = null;
      if (ids.trakt) existing = existingTrakt.get(String(ids.trakt));
      if (!existing && ids.tmdb) existing = existingTmdb.get(ids.tmdb);
      if (!existing && ids.imdb) existing = existingImdb.get(ids.imdb);
      if (existing) { skipped++; continue; }

      // 已看完的用 DONE，想看的用传入的 status
      const showStatus = item._source === 'watched' ? RecordStatus.DONE : status;
      const rating = item.show.rating ? Math.round(item.show.rating * 2) : null;

      try {
        await prisma.tvShow.create({
          data: {
            title,
            traktId: ids.trakt ? String(ids.trakt) : null,
            tmdbId: ids.tmdb || null,
            imdbId: ids.imdb || null,
            posterUrl: null,
            firstAirDate: item.show.year ? String(item.show.year) : null,
            overview: null,
            status: showStatus,
            rating,
            shortReview: '',
          },
        });
        imported++;
      } catch (ex: any) {
        errors.push(`导入失败: ${title}，原因: ${ex.message}`);
        skipped++;
      }
    }

    res.json({ total: allShows.length, imported, skipped, errors });
  } catch (ex: any) {
    res.status(500).json({ error: `Trakt 导入失败: ${ex.message}` });
  }
});

export default router;