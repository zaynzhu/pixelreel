import { Router, Request, Response } from 'express';
import axios from 'axios';
import { config } from '../config';
import { searchMovies, searchGames } from '../services/ExternalSearchService';

const router = Router();

// GET /api/search/movies?query=xxx&page=1&providers=tmdb,omdb
router.get('/movies', async (req: Request, res: Response) => {
  const query = req.query.query as string;
  const page = parseInt(req.query.page as string) || 1;
  const providers = req.query.providers as string | string[] | undefined;

  let providerList: string[] | undefined;
  if (providers) {
    providerList = Array.isArray(providers) ? providers : [providers];
  }

  const result = await searchMovies(query ?? '', page, providerList);
  res.json(result);
});

// GET /api/search/games?query=xxx&page=1&providers=rawg,steam
router.get('/games', async (req: Request, res: Response) => {
  const query = req.query.query as string;
  const page = parseInt(req.query.page as string) || 1;
  const providers = req.query.providers as string | string[] | undefined;

  let providerList: string[] | undefined;
  if (providers) {
    providerList = Array.isArray(providers) ? providers : [providers];
  }

  const result = await searchGames(query ?? '', page, providerList);
  res.json(result);
});

// GET /api/search/douban/:doubanId — 通过豆瓣 ID 获取详情
router.get('/douban/:doubanId', async (req: Request, res: Response) => {
  const doubanId = req.params.doubanId;
  if (!doubanId) {
    res.status(400).json({ error: 'doubanId required' });
    return;
  }

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
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Douban request failed' });
  }
});

// GET /api/search/imdb/:imdbId — 通过 IMDb ID 获取详情（OMDb）
router.get('/imdb/:imdbId', async (req: Request, res: Response) => {
  const imdbId = req.params.imdbId;
  if (!imdbId || !config.omdb.apiKey) {
    res.status(400).json({ error: 'imdbId required or OMDb not configured' });
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
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'OMDb request failed' });
  }
});

// GET /api/search/tmdb/:tmdbId — 通过 TMDB ID 获取详情
router.get('/tmdb/:tmdbId', async (req: Request, res: Response) => {
  const tmdbId = req.params.tmdbId;
  if (!tmdbId || !config.tmdb.apiKey) {
    res.status(400).json({ error: 'tmdbId required or TMDB not configured' });
    return;
  }

  try {
    const [movieRes, creditsRes] = await Promise.all([
      axios.get(`${config.tmdb.baseUrl}/movie/${tmdbId}`, {
        params: { language: 'zh-CN' },
        headers: { Authorization: `Bearer ${config.tmdb.apiKey}` },
      }),
      axios.get(`${config.tmdb.baseUrl}/movie/${tmdbId}/credits`, {
        headers: { Authorization: `Bearer ${config.tmdb.apiKey}` },
      }),
    ]);

    const d = movieRes.data;
    const credits = creditsRes.data;
    const director = (credits?.crew ?? [])
      .filter((c: any) => c.job === 'Director')
      .map((c: any) => c.name)
      .join(', ');
    const actors = (credits?.cast ?? [])
      .slice(0, 5)
      .map((c: any) => c.name)
      .join(', ');

    res.json({
      tmdbId: d.id,
      title: d.title,
      year: d.release_date?.slice(0, 4) ?? '',
      rated: '',
      runtime: d.runtime ? `${d.runtime} min` : '',
      genre: (d.genres ?? []).map((g: any) => g.name).join(', '),
      director,
      actors,
      plot: d.overview ?? '',
      language: d.original_language ?? '',
      country: (d.production_countries ?? []).map((c: any) => c.name).join(', '),
      awards: '',
      posterUrl: d.poster_path ? config.tmdb.imageBaseUrl + d.poster_path : null,
      imdbRating: d.vote_average ? String(d.vote_average) : '',
      imdbVotes: d.vote_count ? String(d.vote_count) : '',
      boxOffice: d.revenue ? `$${d.revenue.toLocaleString()}` : '',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'TMDB request failed' });
  }
});

// GET /api/search/rawg/:rawgId — 通过 RAWG ID 获取游戏详情
router.get('/rawg/:rawgId', async (req: Request, res: Response) => {
  const rawgId = req.params.rawgId;
  if (!rawgId || !config.rawg.apiKey) {
    res.status(400).json({ error: 'rawgId required or RAWG not configured' });
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
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'RAWG request failed' });
  }
});

// GET /api/search/steam/:steamAppId — 通过 Steam App ID 获取游戏详情
router.get('/steam/:steamAppId', async (req: Request, res: Response) => {
  const steamAppId = req.params.steamAppId as string;
  if (!steamAppId) {
    res.status(400).json({ error: 'steamAppId required' });
    return;
  }

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
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Steam request failed' });
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

// GET /api/proxy/image?url=xxx — 图片代理（解决豆瓣防盗链 + 缓存控制）
router.get('/proxy/image', async (req: Request, res: Response) => {
  let url = req.query.url as string;
  if (!url) {
    res.status(400).json({ error: 'url required' });
    return;
  }

  // Validate URL
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    res.status(400).json({ error: 'Invalid URL' });
    return;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    res.status(400).json({ error: 'Only http/https URLs allowed' });
    return;
  }

  if (!ALLOWED_HOSTS.has(parsed.hostname)) {
    res.status(400).json({ error: 'Host not allowed' });
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