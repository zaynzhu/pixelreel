import axios from 'axios';
import { config } from '../../config';
import { RadarItemInput, RadarCategory } from './types';

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