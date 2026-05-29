import axios from 'axios';
import { config } from '../../config';
import { RadarItemInput, RadarCategory, TMDB_WATCH_PROVIDERS } from './types';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || '';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { HttpsProxyAgent } = require('https-proxy-agent');
const axiosProxyOpts: any = proxyUrl
  ? { proxy: false, httpsAgent: new HttpsProxyAgent(proxyUrl) }
  : {};

const tmdbAuthHeaders: Record<string, string> = config.tmdb.apiKey
  ? { Authorization: `Bearer ${config.tmdb.apiKey}` }
  : {};

interface TmdbEndpoint {
  path: string;
  category: RadarCategory;
  type: 'movie' | 'tv';
  titleField: string;
  dateField: string;
}

const TMDB_ENDPOINTS: TmdbEndpoint[] = [
  { path: '/movie/now_playing', category: 'now_playing', type: 'movie', titleField: 'title', dateField: 'release_date' },
  { path: '/movie/upcoming', category: 'upcoming', type: 'movie', titleField: 'title', dateField: 'release_date' },
  { path: '/trending/movie/week', category: 'trending', type: 'movie', titleField: 'title', dateField: 'release_date' },
  { path: '/trending/tv/week', category: 'trending', type: 'tv', titleField: 'name', dateField: 'first_air_date' },
  { path: '/tv/on_the_air', category: 'on_the_air', type: 'tv', titleField: 'name', dateField: 'first_air_date' },
];

async function fetchTmdbEndpoint(endpoint: TmdbEndpoint, retryCount = 0): Promise<any[]> {
  const url = `${config.tmdb.baseUrl}${endpoint.path}`;
  try {
    const response = await axios.get(url, {
      params: { language: 'zh-CN', page: 1 },
      headers: tmdbAuthHeaders,
      timeout: config.radar.requestTimeoutMs,
      ...axiosProxyOpts,
    });
    return response.data?.results ?? [];
  } catch (err: any) {
    if (err.response?.status === 429 && retryCount < 2) {
      const retryAfter = err.response.headers['retry-after'];
      const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : 3000;
      await delay(waitTime);
      return fetchTmdbEndpoint(endpoint, retryCount + 1);
    }
    throw err;
  }
}

function mapTmdbItem(item: any, endpoint: TmdbEndpoint): RadarItemInput {
  return {
    sourceKey: `tmdb:${endpoint.type}:${item.id}`,
    source: 'tmdb',
    sourceId: String(item.id),
    tmdbId: item.id,
    type: endpoint.type,
    title: item[endpoint.titleField] ?? '',
    titleZh: item[endpoint.titleField] ?? '',
    overview: item.overview ?? undefined,
    posterPath: item.poster_path ? config.tmdb.imageBaseUrl + item.poster_path : undefined,
    releaseDate: item[endpoint.dateField] ?? undefined,
    category: endpoint.category,
    voteAverage: item.vote_average ?? undefined,
  };
}

export async function fetchTmdbRadar(): Promise<RadarItemInput[]> {
  const allItems: RadarItemInput[] = [];
  for (const endpoint of TMDB_ENDPOINTS) {
    const items = await fetchTmdbEndpoint(endpoint);
    for (const item of items) {
      allItems.push(mapTmdbItem(item, endpoint));
    }
    await delay(250);
  }
  return allItems;
}

// --- Discover API for watch providers ---

interface TmdbDiscoverEndpoint {
  path: string;
  category: RadarCategory;
  type: 'movie' | 'tv';
  titleField: string;
  dateField: string;
  providerKey: string;
  providerName: string;
  providerId: number;
}

async function fetchTmdbDiscoverEndpoint(
  endpoint: TmdbDiscoverEndpoint,
  watchRegion: string,
  retryCount = 0,
): Promise<any[]> {
  const url = `${config.tmdb.baseUrl}${endpoint.path}`;
  try {
    const response = await axios.get(url, {
      params: {
        language: 'zh-CN',
        page: 1,
        with_watch_providers: String(endpoint.providerId),
        watch_region: watchRegion,
        sort_by: 'popularity.desc',
      },
      headers: tmdbAuthHeaders,
      timeout: config.radar.requestTimeoutMs,
      ...axiosProxyOpts,
    });
    return response.data?.results ?? [];
  } catch (err: any) {
    if (err.response?.status === 429 && retryCount < 2) {
      const retryAfter = err.response.headers['retry-after'];
      const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : 3000;
      await delay(waitTime);
      return fetchTmdbDiscoverEndpoint(endpoint, watchRegion, retryCount + 1);
    }
    throw err;
  }
}

function mapTmdbPlatformItem(item: any, endpoint: TmdbDiscoverEndpoint): RadarItemInput {
  return {
    sourceKey: `tmdb_${endpoint.providerKey}:${endpoint.type}:${item.id}`,
    source: 'tmdb',
    sourceId: String(item.id),
    tmdbId: item.id,
    type: endpoint.type,
    title: item[endpoint.titleField] ?? '',
    titleZh: item[endpoint.titleField] ?? '',
    overview: item.overview ?? undefined,
    posterPath: item.poster_path ? config.tmdb.imageBaseUrl + item.poster_path : undefined,
    releaseDate: item[endpoint.dateField] ?? undefined,
    category: endpoint.category,
    voteAverage: item.vote_average ?? undefined,
    platform: endpoint.providerName,
  };
}

export async function fetchTmdbPlatformItems(watchRegion: string): Promise<RadarItemInput[]> {
  const allItems: RadarItemInput[] = [];

  for (const [providerKey, provider] of Object.entries(TMDB_WATCH_PROVIDERS)) {
    const endpoints: TmdbDiscoverEndpoint[] = [
      {
        path: '/discover/movie',
        category: 'trending',
        type: 'movie',
        titleField: 'title',
        dateField: 'release_date',
        providerKey,
        providerName: provider.name,
        providerId: provider.providerId,
      },
      {
        path: '/discover/tv',
        category: 'trending',
        type: 'tv',
        titleField: 'name',
        dateField: 'first_air_date',
        providerKey,
        providerName: provider.name,
        providerId: provider.providerId,
      },
    ];

    for (const endpoint of endpoints) {
      try {
        const items = await fetchTmdbDiscoverEndpoint(endpoint, watchRegion);
        for (const item of items) {
          allItems.push(mapTmdbPlatformItem(item, endpoint));
        }
      } catch (err: any) {
        console.error(`[Radar] TMDB platform ${provider.name} (${endpoint.type}) fetch failed:`, err.message);
      }
      await delay(250);
    }
  }

  return allItems;
}

// ══════════════════════════════════════════════════════════════
// New Releases — 只保留真正的新片源，不含 trending
// ══════════════════════════════════════════════════════════════

const TMDB_NEW_RELEASE_ENDPOINTS: TmdbEndpoint[] = [
  { path: '/movie/now_playing', category: 'now_playing', type: 'movie', titleField: 'title', dateField: 'release_date' },
  { path: '/movie/upcoming', category: 'upcoming', type: 'movie', titleField: 'title', dateField: 'release_date' },
  { path: '/tv/on_the_air', category: 'on_the_air', type: 'tv', titleField: 'name', dateField: 'first_air_date' },
];

/** 新片雷达 — 不含 trending */
export async function fetchTmdbNewReleases(): Promise<RadarItemInput[]> {
  const allItems: RadarItemInput[] = [];
  for (const endpoint of TMDB_NEW_RELEASE_ENDPOINTS) {
    const items = await fetchTmdbEndpoint(endpoint);
    for (const item of items) {
      allItems.push(mapTmdbItem(item, endpoint));
    }
    await delay(250);
  }
  return allItems;
}

/** 新片平台 — 按上映日期排序，过滤近 3 个月 */
export async function fetchTmdbPlatformNewReleases(watchRegion: string): Promise<RadarItemInput[]> {
  const allItems: RadarItemInput[] = [];
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
  const dateFilter = threeMonthsAgo.toISOString().split('T')[0];

  for (const [providerKey, provider] of Object.entries(TMDB_WATCH_PROVIDERS)) {
    // Movies: sort by release date, filter recent
    try {
      const movieUrl = `${config.tmdb.baseUrl}/discover/movie`;
      const movieResp = await axios.get(movieUrl, {
        params: {
          language: 'zh-CN',
          page: 1,
          with_watch_providers: String(provider.providerId),
          watch_region: watchRegion,
          sort_by: 'primary_release_date.desc',
          'primary_release_date.gte': dateFilter,
        },
        headers: tmdbAuthHeaders,
        timeout: config.radar.requestTimeoutMs,
        ...axiosProxyOpts,
      });
      for (const item of (movieResp.data?.results ?? [])) {
        allItems.push({
          sourceKey: `tmdb_${providerKey}:movie:${item.id}`,
          source: 'tmdb',
          sourceId: String(item.id),
          tmdbId: item.id,
          type: 'movie',
          title: item.title ?? '',
          titleZh: item.title ?? '',
          overview: item.overview ?? undefined,
          posterPath: item.poster_path ? config.tmdb.imageBaseUrl + item.poster_path : undefined,
          releaseDate: item.release_date ?? undefined,
          category: 'now_playing' as const,
          voteAverage: item.vote_average ?? undefined,
          platform: provider.name,
        });
      }
    } catch (err: any) {
      console.error(`[Radar] TMDB new release ${provider.name} (movie) fetch failed:`, err.message);
    }
    await delay(250);

    // TV: sort by first air date, filter recent
    try {
      const tvUrl = `${config.tmdb.baseUrl}/discover/tv`;
      const tvResp = await axios.get(tvUrl, {
        params: {
          language: 'zh-CN',
          page: 1,
          with_watch_providers: String(provider.providerId),
          watch_region: watchRegion,
          sort_by: 'first_air_date.desc',
          'first_air_date.gte': dateFilter,
        },
        headers: tmdbAuthHeaders,
        timeout: config.radar.requestTimeoutMs,
        ...axiosProxyOpts,
      });
      for (const item of (tvResp.data?.results ?? [])) {
        allItems.push({
          sourceKey: `tmdb_${providerKey}:tv:${item.id}`,
          source: 'tmdb',
          sourceId: String(item.id),
          tmdbId: item.id,
          type: 'tv',
          title: item.name ?? '',
          titleZh: item.name ?? '',
          overview: item.overview ?? undefined,
          posterPath: item.poster_path ? config.tmdb.imageBaseUrl + item.poster_path : undefined,
          releaseDate: item.first_air_date ?? undefined,
          category: 'now_playing' as const,
          voteAverage: item.vote_average ?? undefined,
          platform: provider.name,
        });
      }
    } catch (err: any) {
      console.error(`[Radar] TMDB new release ${provider.name} (tv) fetch failed:`, err.message);
    }
    await delay(250);
  }

  return allItems;
}