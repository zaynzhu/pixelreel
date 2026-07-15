import { Router, Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { randomBytes } from 'node:crypto';
import { config } from '../config';
import { getDb } from '../config/db';
import { RecordStatus } from '../enums/RecordStatus';
import { fetchTmdbPosterUrl, delay } from '../services/import/TmdbCoverFillService';
import { runExclusiveImport } from '../services/import-operation-lock';
import {
  assertNoQueryParameters,
  parseBoundedStringParameter,
  parseRecordStatusParameter,
  RequestValidationError,
} from './request-validation';

const router = Router();
const MAX_TRAKT_PAGE_COUNT = 1000;
const TRAKT_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const MAX_PENDING_TRAKT_OAUTH_STATES = 20;
const TRAKT_CALLBACK_PARAMETER_KEYS = new Set(['code', 'state']);

class TraktApiResponseError extends Error {
  status = 502;
}

export class TraktOAuthStateStore {
  private readonly states = new Map<string, number>();

  create(now = Date.now()): string {
    this.pruneExpired(now);
    while (this.states.size >= MAX_PENDING_TRAKT_OAUTH_STATES) {
      const oldestState = this.states.keys().next().value;
      if (!oldestState) break;
      this.states.delete(oldestState);
    }

    const state = randomBytes(32).toString('base64url');
    this.states.set(state, now + TRAKT_OAUTH_STATE_TTL_MS);
    return state;
  }

  consume(state: string, now = Date.now()): boolean {
    this.pruneExpired(now);
    const expiresAt = this.states.get(state);
    if (expiresAt == null) return false;
    this.states.delete(state);
    return expiresAt > now;
  }

  private pruneExpired(now: number) {
    for (const [state, expiresAt] of this.states) {
      if (expiresAt <= now) this.states.delete(state);
    }
  }
}

const traktOAuthStates = new TraktOAuthStateStore();

type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

export function assertEmptyTraktImportBody(value: unknown) {
  if (value === undefined) return;
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value as Record<string, unknown>).length > 0) {
    throw new RequestValidationError('请求体必须为空');
  }
}

function withTraktImportLock(handler: AsyncRouteHandler): AsyncRouteHandler {
  return async (req, res, next) => {
    try {
      assertEmptyTraktImportBody(req.body);
      await runExclusiveImport('trakt', 'Trakt 导入', () => handler(req, res, next));
    } catch (error) {
      next(error);
    }
  };
}

export function parseTraktImportParameters(value: Record<string, unknown>) {
  const unknownKey = Object.keys(value).find(key => key !== 'status');
  if (unknownKey) throw new RequestValidationError(`未知参数: ${unknownKey}`);
  return {
    status: parseRecordStatusParameter(value.status, RecordStatus.WANT),
  };
}

export function parseTraktPageCount(value: unknown): number {
  if (value === undefined || value === null) return 1;
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new TraktApiResponseError('Trakt 返回了无效的分页信息');
  }

  const normalized = String(value).trim();
  if (!/^(0|[1-9]\d*)$/.test(normalized)) {
    throw new TraktApiResponseError('Trakt 返回了无效的分页信息');
  }

  const pageCount = Number(normalized);
  if (!Number.isSafeInteger(pageCount) || pageCount > MAX_TRAKT_PAGE_COUNT) {
    throw new TraktApiResponseError('Trakt 返回的分页数量超出安全范围');
  }
  return pageCount;
}

export function parseTraktPageData(value: unknown): any[] {
  if (!Array.isArray(value)) {
    throw new TraktApiResponseError('Trakt 返回了无效的数据格式');
  }
  return value;
}

export function parseTraktCallbackParameters(
  value: Record<string, unknown>,
  stateStore = traktOAuthStates,
) {
  const unknownKey = Object.keys(value).find(key => !TRAKT_CALLBACK_PARAMETER_KEYS.has(key));
  if (unknownKey) throw new RequestValidationError(`未知参数: ${unknownKey}`);

  const code = parseBoundedStringParameter(value.code, 'code', 1000, true)!;
  const state = parseBoundedStringParameter(value.state, 'state', 100, true)!;
  if (!stateStore.consume(state)) {
    throw new RequestValidationError('Trakt OAuth state 无效或已过期，请重新发起授权');
  }
  return { code };
}

// GET /api/trakt/auth — 重定向到 Trakt 授权页
router.get('/auth', (req: Request, res: Response) => {
  assertNoQueryParameters(req.query);
  if (!config.trakt.clientId) {
    res.status(400).json({ error: '未配置 TRAKT_CLIENT_ID' });
    return;
  }
  const parameters = new URLSearchParams({
    response_type: 'code',
    client_id: config.trakt.clientId,
    redirect_uri: config.trakt.redirectUri,
    state: traktOAuthStates.create(),
  });
  const authUrl = `${config.trakt.baseUrl}/oauth/authorize?${parameters}`;
  res.redirect(authUrl);
});

// GET /api/trakt/callback — Trakt OAuth 回调
router.get('/callback', async (req: Request, res: Response, next: NextFunction) => {
  if (!config.trakt.clientId || !config.trakt.clientSecret) {
    res.status(400).json({ error: '未完整配置 Trakt OAuth 凭据' });
    return;
  }
  const { code } = parseTraktCallbackParameters(req.query);

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
  } catch (err) {
    next(err);
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
    const data = parseTraktPageData(res.data);
    allData = allData.concat(data);
    
    // 解析 Trakt 返回的分页 Headers
    const pageCount = parseTraktPageCount(res.headers['x-pagination-page-count']);
    if (page >= pageCount) {
      break;
    }
    page++;
  }
  
  return allData;
}

// POST /api/trakt/import/movies?status=DONE
router.post('/import/movies', withTraktImportLock(async (req, res, next) => {
  const { status } = parseTraktImportParameters(req.query);
  const accessToken = config.trakt.accessToken;
  if (!accessToken) {
    res.status(400).json({ error: '需要 Trakt access_token，请先在设置中完成配置' });
    return;
  }

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
      ? new Map((await getDb().movie.findMany({ where: { traktId: { in: traktIds } } })).map((m) => [m.traktId!, m]))
      : new Map<string, any>();
    const existingTmdb = tmdbIds.length > 0
      ? new Map((await getDb().movie.findMany({ where: { tmdbId: { in: tmdbIds } } })).map((m) => [m.tmdbId!, m]))
      : new Map<any, any>();
    const existingImdb = imdbIds.length > 0
      ? new Map((await getDb().movie.findMany({ where: { imdbId: { in: imdbIds } } })).map((m) => [m.imdbId!, m]))
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
      try {
        let posterUrl: string | null = null;
        if (ids.tmdb) {
          posterUrl = await fetchTmdbPosterUrl('movie', ids.tmdb);
          await delay(250);
        }

        await getDb().movie.create({
          data: {
            title,
            traktId: ids.trakt ? String(ids.trakt) : null,
            tmdbId: ids.tmdb || null,
            imdbId: ids.imdb || null,
            posterUrl,
            status: movieStatus,
            // history/watchlist 不包含用户的个人评分，不将平台分写入个人评分
            rating: null,
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
  } catch (err) {
    next(err);
  }
}));

// POST /api/trakt/import/shows?status=DONE
router.post('/import/shows', withTraktImportLock(async (req, res, next) => {
  const { status } = parseTraktImportParameters(req.query);
  const accessToken = config.trakt.accessToken;
  if (!accessToken) {
    res.status(400).json({ error: '需要 Trakt access_token，请先在设置中完成配置' });
    return;
  }

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
      ? new Map((await getDb().tvShow.findMany({ where: { traktId: { in: traktIds } } })).map((s) => [s.traktId!, s]))
      : new Map<string, any>();
    const existingTmdb = tmdbIds.length > 0
      ? new Map((await getDb().tvShow.findMany({ where: { tmdbId: { in: tmdbIds } } })).map((s) => [s.tmdbId!, s]))
      : new Map<any, any>();
    const existingImdb = imdbIds.length > 0
      ? new Map((await getDb().tvShow.findMany({ where: { imdbId: { in: imdbIds } } })).map((s) => [s.imdbId!, s]))
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
      try {
        let posterUrl: string | null = null;
        if (ids.tmdb) {
          posterUrl = await fetchTmdbPosterUrl('tv', ids.tmdb);
          await delay(250);
        }

        await getDb().tvShow.create({
          data: {
            title,
            traktId: ids.trakt ? String(ids.trakt) : null,
            tmdbId: ids.tmdb || null,
            imdbId: ids.imdb || null,
            posterUrl,
            firstAirDate: item.show.year ? String(item.show.year) : null,
            overview: null,
            status: showStatus,
            // history/watchlist 不包含用户的个人评分，不将平台分写入个人评分
            rating: null,
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
  } catch (err) {
    next(err);
  }
}));

export default router;
