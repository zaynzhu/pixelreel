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