import axios from 'axios';
import { config } from '../../config';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// 代理配置（TMDB API 需要翻墙）
const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || '';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { HttpsProxyAgent } = require('https-proxy-agent');
const axiosProxyOpts: any = proxyUrl
  ? { proxy: false, httpsAgent: new HttpsProxyAgent(proxyUrl) }
  : {};

// TMDB v4 Bearer Token 认证头
const tmdbAuthHeaders: Record<string, string> = config.tmdb.apiKey
  ? { Authorization: `Bearer ${config.tmdb.apiKey}` }
  : {};

// TMDB 搜索结果
export interface TmdbEnrichResult {
  type: 'movie' | 'tv' | 'unknown';
  tmdbId: number | null;
  title: string | null;
  posterUrl: string | null;
  releaseDate: string | null;
  overview: string | null;
  voteAverage: number | null;
  popularity: number | null;
  genreIds: number[];
}

// 标题相似度计算（简单的包含 + 长度比较）
function titleSimilarity(a: string, b: string): number {
  const na = a.toLowerCase().trim();
  const nb = b.toLowerCase().trim();
  if (na === nb) return 1.0;
  if (na.includes(nb) || nb.includes(na)) return 0.7;
  const minLen = Math.min(na.length, nb.length);
  let match = 0;
  for (let i = 0; i < minLen; i++) {
    if (na[i] === nb[i]) match++;
  }
  return match / Math.max(na.length, nb.length);
}

// 清理标题：去掉季数、集数等干扰搜索的信息
function cleanTitle(title: string): string {
  return title
    .replace(/第[一二三四五六七八九十百千\d]+季/g, '')
    .replace(/第[一二三四五六七八九十百千\d]+部/g, '')
    .replace(/Season\s*\d+/gi, '')
    .replace(/S\d+/gi, '')
    .replace(/剧场版|电影版|特别篇|番外篇/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// 从复杂标题中提取搜索候选词
// 例: "怪奇物语 第五季 / Stranger Things Season 5" → ["怪奇物语", "Stranger Things"]
function extractSearchCandidates(title: string): string[] {
  const candidates: string[] = []
  const parts = title.split('/').map(p => cleanTitle(p.trim())).filter(Boolean)

  if (parts.length >= 2) {
    // 有中英文分离，优先用中文短标题
    candidates.push(parts[0])
    candidates.push(parts[parts.length - 1])
  } else {
    // 没有分隔符，用清理后的完整标题
    const cleaned = cleanTitle(title)
    if (cleaned && cleaned !== title.trim()) candidates.push(cleaned)
  }
  // 原始标题作为最后兜底
  candidates.push(title.trim())
  return candidates
}

interface TmdbSearchHit {
  tmdbId: number;
  title: string;
  posterUrl: string | null;
  releaseDate: string | null;
  overview: string | null;
  voteAverage: number;
  popularity: number;
  genreIds: number[];
  similarity: number;
}

async function searchTmdb(
  query: string,
  type: 'movie' | 'tv',
  retryCount = 0,
): Promise<TmdbSearchHit[]> {
  const endpoint = type === 'movie' ? '/search/movie' : '/search/tv';
  const titleField = type === 'movie' ? 'title' : 'name';

  try {
    const url = `${config.tmdb.baseUrl}${endpoint}`;
    const response = await axios.get(url, {
      params: { query, page: 1, language: 'zh-CN' },
      headers: tmdbAuthHeaders,
      timeout: 10000,
      ...axiosProxyOpts,
    });

    const items = response.data?.results ?? [];
    return items.map((item: any) => ({
      tmdbId: item.id,
      title: item[titleField] ?? '',
      posterUrl: item.poster_path ? config.tmdb.imageBaseUrl + item.poster_path : null,
      releaseDate: type === 'movie'
        ? (item.release_date ?? null)
        : (item.first_air_date ?? null),
      overview: item.overview ?? null,
      voteAverage: item.vote_average ?? 0,
      popularity: item.popularity ?? 0,
      genreIds: item.genre_ids ?? [],
      similarity: titleSimilarity(query, item[titleField] ?? ''),
    }));
  } catch (err: any) {
    if (err.response?.status === 429 && retryCount < 2) {
      const retryAfter = err.response.headers['retry-after'];
      const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : 3000;
      await delay(waitTime);
      return searchTmdb(query, type, retryCount + 1);
    }
    console.error(`[TMDB] searchTmdb error for "${query}" (${type}):`, err.message);
    return [];
  }
}

/**
 * 从 movie/tv 搜索结果中选出最佳匹配。
 * 相似度阈值 0.4，同类型内按 similarity * 10 + popularity 排序。
 */
function pickBestHit(
  movieHits: TmdbSearchHit[],
  tvHits: TmdbSearchHit[],
): { hit: TmdbSearchHit; type: 'movie' | 'tv' } | null {
  const goodMovies = movieHits.filter(h => h.similarity >= 0.4);
  const goodTvs = tvHits.filter(h => h.similarity >= 0.4);

  const bestMovie = goodMovies.length > 0
    ? goodMovies.reduce((a, b) => (a.similarity * 10 + a.popularity) > (b.similarity * 10 + b.popularity) ? a : b)
    : null;
  const bestTv = goodTvs.length > 0
    ? goodTvs.reduce((a, b) => (a.similarity * 10 + a.popularity) > (b.similarity * 10 + b.popularity) ? a : b)
    : null;

  const movieScore = bestMovie ? bestMovie.similarity * 10 + bestMovie.popularity / 100 : 0;
  const tvScore = bestTv ? bestTv.similarity * 10 + bestTv.popularity / 100 : 0;

  if (movieScore === 0 && tvScore === 0) return null;
  if (movieScore >= tvScore && bestMovie) return { hit: bestMovie, type: 'movie' };
  if (bestTv) return { hit: bestTv, type: 'tv' };
  return null;
}

/**
 * 用片名搜索 TMDB，返回最佳匹配及类型判断。
 * 从标题中提取多个候选词（中文/英文/去季数），逐个尝试直到命中。
 * 每次搜索间隔 250ms 防限速。
 */
export async function enrichFromTmdb(title: string): Promise<TmdbEnrichResult> {
  const empty: TmdbEnrichResult = { type: 'unknown', tmdbId: null, posterUrl: null, releaseDate: null, overview: null, title: null, voteAverage: null, popularity: null, genreIds: [] };
  if (!config.tmdb.apiKey) return empty;

  const candidates = extractSearchCandidates(title);

  for (const query of candidates) {
    const [movieHits, tvHits] = await Promise.all([
      searchTmdb(query, 'movie'),
      searchTmdb(query, 'tv'),
    ]);
    await delay(250);

    const result = pickBestHit(movieHits, tvHits);
    if (result) {
      const { hit, type } = result;
      return {
        type,
        tmdbId: hit.tmdbId,
        posterUrl: hit.posterUrl,
        releaseDate: hit.releaseDate,
        overview: hit.overview,
        title: hit.title,
        voteAverage: hit.voteAverage,
        popularity: hit.popularity,
        genreIds: hit.genreIds,
      };
    }
  }

  return empty;
}

/**
 * 批量丰富，带进度回调。
 * 每条间隔 250ms 防限速。
 */
export async function enrichBatch(
  titles: string[],
  onProgress?: (index: number, total: number, title: string) => void,
): Promise<Map<string, TmdbEnrichResult>> {
  const results = new Map<string, TmdbEnrichResult>();
  for (let i = 0; i < titles.length; i++) {
    const title = titles[i];
    if (onProgress) onProgress(i, titles.length, title);
    const result = await enrichFromTmdb(title);
    results.set(title, result);
    await delay(250);
  }
  return results;
}
