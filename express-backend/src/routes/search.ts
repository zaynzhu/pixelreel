import { Router, Request, Response, NextFunction } from 'express';
import axios from 'axios';
import { config } from '../config';
import { searchMovies, searchGames } from '../services/ExternalSearchService';
import {
  parseBoundedStringParameter,
  parseEnumParameter,
  parseExternalSearchParameters,
  parsePatternParameter,
  parsePositiveBigIntParameter,
  RequestValidationError,
} from './request-validation';

// 代理配置
const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || '';
const { HttpsProxyAgent } = require('https-proxy-agent');
const axiosProxyOpts: any = proxyUrl
  ? { proxy: false, httpsAgent: new HttpsProxyAgent(proxyUrl) }
  : {};

const router = Router();
const MOVIE_SEARCH_PROVIDERS = ['tmdb', 'omdb', 'trakt', 'douban', 'imdb'] as const;
export const GAME_SEARCH_PROVIDERS = ['rawg', 'steam'] as const;
const EMPTY_SEARCH_QUERY_PARAMETER_KEYS = new Set<string>();
const IMAGE_PROXY_PARAMETER_KEYS = new Set(['url']);
const TMDB_DETAIL_PARAMETER_KEYS = new Set(['mediaType']);

export function assertKnownSearchQueryParameters(
  value: Record<string, unknown>,
  allowedKeys: ReadonlySet<string> = EMPTY_SEARCH_QUERY_PARAMETER_KEYS,
) {
  const unknownKey = Object.keys(value).find(key => !allowedKeys.has(key));
  if (unknownKey) throw new RequestValidationError(`未知参数: ${unknownKey}`);
}

export function parseImageProxyParameters(value: Record<string, unknown>) {
  assertKnownSearchQueryParameters(value, IMAGE_PROXY_PARAMETER_KEYS);
  return parseBoundedStringParameter(value.url, 'url', 2000, true)!;
}

export function parseTmdbDetailParameters(value: Record<string, unknown>) {
  assertKnownSearchQueryParameters(value, TMDB_DETAIL_PARAMETER_KEYS);
  return parseEnumParameter(value.mediaType, 'mediaType', ['movie', 'tv_show'] as const);
}

export function mapTmdbIdentityMetadata(detail: any, isTv: boolean) {
  return {
    imdbId: isTv ? detail.external_ids?.imdb_id ?? null : detail.imdb_id ?? null,
    tmdbPopularity: detail.popularity ?? null,
    tmdbGenreIds: (detail.genres ?? []).map((genre: any) => genre.id).join(','),
  };
}

// GET /api/search/movies?query=xxx&page=1&providers=tmdb,omdb
router.get('/movies', async (req: Request, res: Response) => {
  const { query, page, providers } = parseExternalSearchParameters(
    req.query as Record<string, unknown>,
    MOVIE_SEARCH_PROVIDERS,
  );
  const result = await searchMovies(query, page, providers);
  res.json(result);
});

// GET /api/search/games?query=xxx&page=1&providers=rawg,steam
router.get('/games', async (req: Request, res: Response) => {
  const { query, page, providers } = parseExternalSearchParameters(
    req.query as Record<string, unknown>,
    GAME_SEARCH_PROVIDERS,
  );
  const result = await searchGames(query, page, providers);
  res.json(result);
});

// GET /api/search/douban/:doubanId — 通过豆瓣 ID 获取详情
router.get('/douban/:doubanId', async (req: Request, res: Response, next: NextFunction) => {
  assertKnownSearchQueryParameters(req.query);
  const doubanId = parsePatternParameter(req.params.doubanId, 'doubanId', /^\d{1,20}$/, 20);

  try {
    const response = await axios.get(`${config.douban.baseUrl}/j/subject_abstract`, {
      params: { subject_id: doubanId },
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
    });
    const s = response.data?.subject;
    if (!s) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json({
      doubanId: s.id,
      title: s.title ?? '',
      year: s.release_year ?? '',
      rated: '',
      runtime: s.duration ?? '',
      genre: (s.types ?? []).join(', '),
      director: (s.directors ?? []).join(', '),
      actors: (s.actors ?? []).join(', '),
      plot: s.short_comment?.content ?? '',
      language: '',
      country: s.region ?? '',
      awards: '',
      posterUrl: null,
      imdbRating: s.rate ?? '',
      imdbVotes: '',
      boxOffice: '',
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/search/imdb/:imdbId — 通过 IMDb ID 获取详情（OMDb）
router.get('/imdb/:imdbId', async (req: Request, res: Response, next: NextFunction) => {
  assertKnownSearchQueryParameters(req.query);
  const imdbId = parsePatternParameter(req.params.imdbId, 'imdbId', /^tt\d{7,10}$/, 12);
  if (!config.omdb.apiKey) {
    res.status(400).json({ error: 'OMDb not configured' });
    return;
  }

  try {
    const response = await axios.get(config.omdb.baseUrl, {
      params: { apikey: config.omdb.apiKey, i: imdbId },
    });
    if (response.data?.Response === 'False') {
      res.status(404).json({ error: response.data.Error ?? 'Not found' });
      return;
    }
    const d = response.data;
    res.json({
      imdbId: d.imdbID,
      title: d.Title,
      year: d.Year,
      rated: d.Rated,
      runtime: d.Runtime,
      genre: d.Genre,
      director: d.Director,
      actors: d.Actors,
      plot: d.Plot,
      language: d.Language,
      country: d.Country,
      awards: d.Awards,
      posterUrl: d.Poster === 'N/A' ? null : d.Poster,
      imdbRating: d.imdbRating,
      imdbVotes: d.imdbVotes,
      boxOffice: d.BoxOffice,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/search/tmdb/:tmdbId — 通过 TMDB ID 获取详情
router.get('/tmdb/:tmdbId', async (req: Request, res: Response, next: NextFunction) => {
  const mediaType = parseTmdbDetailParameters(req.query as Record<string, unknown>);
  const tmdbId = parsePositiveBigIntParameter(req.params.tmdbId, 'tmdbId', true)!.toString();
  if (!config.tmdb.apiKey) {
    res.status(400).json({ error: 'TMDB not configured' });
    return;
  }

  try {
    let isTv = mediaType === 'tv_show';
    let detailRes: any;
    let creditsRes: any;

    if (mediaType) {
      const endpoint = isTv ? 'tv' : 'movie';
      detailRes = await axios.get(`${config.tmdb.baseUrl}/${endpoint}/${tmdbId}`, {
        params: { language: 'zh-CN', append_to_response: 'external_ids' },
        headers: { Authorization: `Bearer ${config.tmdb.apiKey}` },
        ...axiosProxyOpts,
      });
    } else {
      // 兼容旧调用；未指定类别时才探测两个端点
      const loadDetail = (endpoint: 'movie' | 'tv') => axios.get(
        `${config.tmdb.baseUrl}/${endpoint}/${tmdbId}`,
        {
          params: { language: 'zh-CN', append_to_response: 'external_ids' },
          headers: { Authorization: `Bearer ${config.tmdb.apiKey}` },
          ...axiosProxyOpts,
        },
      ).then(response => ({ endpoint, response })).catch(error => ({ endpoint, error }));
      const [movieResult, tvResult] = await Promise.all([loadDetail('movie'), loadDetail('tv')]);
      if ('response' in tvResult) {
        isTv = true;
        detailRes = tvResult.response;
      } else if ('response' in movieResult) {
        isTv = false;
        detailRes = movieResult.response;
      } else {
        throw movieResult.error || tvResult.error;
      }
    }

    const endpoint = isTv ? 'tv' : 'movie';
    creditsRes = await axios.get(`${config.tmdb.baseUrl}/${endpoint}/${tmdbId}/credits`, {
      headers: { Authorization: `Bearer ${config.tmdb.apiKey}` },
      ...axiosProxyOpts,
    });

    const d = detailRes.data;
    const credits = creditsRes.data;

    const director = (credits?.crew ?? [])
      .filter((c: any) => c.job === 'Director' || (isTv && c.job === 'Executive Producer'))
      .map((c: any) => c.name)
      .join(', ');
    const actors = (credits?.cast ?? [])
      .slice(0, 5)
      .map((c: any) => c.name)
      .join(', ');

    res.json({
      tmdbId: d.id,
      ...mapTmdbIdentityMetadata(d, isTv),
      title: isTv ? d.name : d.title,
      year: (isTv ? d.first_air_date : d.release_date)?.slice(0, 4) ?? '',
      rated: '',
      runtime: d.runtime ? `${d.runtime} min` : (d.episode_run_time?.[0] ? `${d.episode_run_time[0]} min` : ''),
      genre: (d.genres ?? []).map((g: any) => g.name).join(', '),
      director,
      actors,
      plot: d.overview ?? '',
      language: d.original_language ?? '',
      country: (isTv ? d.origin_countries : d.production_countries?.map((c: any) => c.name))?.join(', ') ?? '',
      awards: '',
      posterUrl: d.poster_path ? config.tmdb.imageBaseUrl + d.poster_path : null,
      imdbRating: d.vote_average ? String(d.vote_average) : '',
      imdbVotes: d.vote_count ? String(d.vote_count) : '',
      boxOffice: d.revenue ? `$${d.revenue.toLocaleString()}` : '',
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/search/rawg/:rawgId — 通过 RAWG ID 获取游戏详情
router.get('/rawg/:rawgId', async (req: Request, res: Response, next: NextFunction) => {
  assertKnownSearchQueryParameters(req.query);
  const rawgId = parsePositiveBigIntParameter(req.params.rawgId, 'rawgId', true)!.toString();
  if (!config.rawg.apiKey) {
    res.status(400).json({ error: 'RAWG not configured' });
    return;
  }

  try {
    const [detailRes, screenshotsRes] = await Promise.all([
      axios.get(`${config.rawg.baseUrl}/games/${rawgId}`, {
        params: { key: config.rawg.apiKey },
      }),
      axios.get(`${config.rawg.baseUrl}/games/${rawgId}/screenshots`, {
        params: { key: config.rawg.apiKey },
      }).catch(() => null),
    ]);
    const d = detailRes.data;
    const screenshots = (screenshotsRes?.data?.results ?? []).map((s: any) => s.image).slice(0, 6);
    res.json({
      rawgId: d.id,
      title: d.name ?? '',
      year: d.released?.slice(0, 4) ?? '',
      rating: d.rating ? `${d.rating} / 5` : '',
      metacritic: d.metacritic ? String(d.metacritic) : '',
      genre: (d.genres ?? []).map((g: any) => g.name).join(', '),
      platform: (d.platforms ?? []).map((p: any) => p.platform?.name).filter(Boolean).join(', '),
      developer: (d.developers ?? []).map((d: any) => d.name).join(', '),
      publisher: (d.publishers ?? []).map((p: any) => p.name).join(', '),
      playtime: d.playtime ? `${d.playtime}h` : '',
      esrbRating: d.esrb_rating?.name ?? '',
      released: d.released ?? '',
      posterUrl: d.background_image ?? null,
      description: d.description_raw ?? '',
      screenshots,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/search/steam/:steamAppId — 通过 Steam App ID 获取游戏详情
router.get('/steam/:steamAppId', async (req: Request, res: Response, next: NextFunction) => {
  assertKnownSearchQueryParameters(req.query);
  const steamAppId = parsePositiveBigIntParameter(req.params.steamAppId, 'steamAppId', true)!.toString();

  try {
    const response = await axios.get('https://store.steampowered.com/api/appdetails', {
      params: { appids: steamAppId },
      timeout: 10000,
    });
    const appData = response.data?.[steamAppId];
    if (!appData?.success) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }
    const d = appData.data;
    const developers = (d.developers ?? []).join(', ');
    const publishers = (d.publishers ?? []).join(', ');
    const genres = (d.genres ?? []).map((g: any) => g.description).join(', ');
    const platforms: string[] = [];
    if (d.platforms?.windows) platforms.push('Windows');
    if (d.platforms?.mac) platforms.push('macOS');
    if (d.platforms?.linux) platforms.push('Linux');

    const screenshots = (d.screenshots ?? []).map((s: any) => s.path_full).slice(0, 6);

    res.json({
      steamAppId: d.steam_appid,
      title: d.name ?? '',
      year: d.release_date?.date?.match(/\d{4}/)?.[0] ?? '',
      rating: d.metacritic?.score ? `${d.metacritic.score} / 100` : '',
      metacritic: d.metacritic?.score ? String(d.metacritic.score) : '',
      genre: genres,
      platform: platforms.join(', '),
      developer: developers,
      publisher: publishers,
      releaseDate: d.release_date?.date ?? '',
      posterUrl: d.header_image ?? null,
      description: d.short_description ?? '',
      website: d.website ?? '',
      steamUrl: d.steam_appid ? `https://store.steampowered.com/app/${d.steam_appid}` : '',
      screenshots,
    });
  } catch (err) {
    next(err);
  }
});

// Image proxy allowlist — only known poster hosts are proxied
const ALLOWED_HOSTS = new Set([
  'image.tmdb.org',
  'media.themoviedb.org',
  'steamcdn-a.akamaihd.net',
  'cdn.cloudflare.steamstatic.com',
  'cdn.akamai.steamstatic.com',
  'shared.akamai.steamstatic.com',
  'media.rawg.io',
  'img1.doubanio.com',
  'img2.doubanio.com',
  'img3.doubanio.com',
  'r1.ykimg.com',
  'tv.puui.qpic.cn',
]);

export function assertAllowedImageProxyUrl(value: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Invalid URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http/https URLs allowed');
  }
  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    throw new Error('Host not allowed');
  }
  return parsed;
}

export function validateImageProxyRedirect(
  _options: Record<string, unknown>,
  responseDetails: { headers: Record<string, string> },
  requestDetails: { url: string },
) {
  const location = responseDetails.headers.location;
  if (!location) throw new Error('Redirect location missing');
  assertAllowedImageProxyUrl(new URL(location, requestDetails.url).toString());
}

// GET /api/proxy/image?url=xxx — 图片代理（解决豆瓣防盗链 + 缓存控制）
router.get('/proxy/image', async (req: Request, res: Response) => {
  let url = parseImageProxyParameters(req.query);

  try {
    assertAllowedImageProxyUrl(url);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid URL' });
    return;
  }

  // 将豆瓣图片域名统一替换为 img1（反爬较松）
  url = url.replace(/img\d+\.doubanio\.com/, 'img1.doubanio.com');

  try {
    // HEAD request to check content-type before downloading the body
    const headRes = await axios.head(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': 'https://movie.douban.com/',
      },
      timeout: 5000,
      beforeRedirect: validateImageProxyRedirect,
    }).catch(() => null);

    if (headRes) {
      const headContentType = String(headRes.headers['content-type'] ?? '');
      if (headContentType && !headContentType.startsWith('image/')) {
        res.status(400).json({ error: 'Response is not an image' });
        return;
      }
    }

    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': 'https://movie.douban.com/',
      },
      timeout: 10000,
      maxContentLength: config.imageProxy.maxBytes,
      beforeRedirect: validateImageProxyRedirect,
    });

    const contentType = String(response.headers['content-type'] ?? 'image/jpeg');
    if (!contentType.startsWith('image/')) {
      res.status(400).json({ error: 'Response is not an image' });
      return;
    }

    res.set('Content-Type', contentType);
    res.set('Cache-Control', `public, max-age=${config.imageProxy.cacheSeconds}, immutable`);
    res.send(response.data);
  } catch {
    res.status(502).json({ error: 'Image proxy failed' });
  }
});

export default router;
