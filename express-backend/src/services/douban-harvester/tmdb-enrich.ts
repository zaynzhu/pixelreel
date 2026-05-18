import axios from 'axios';
import { config } from '../../config';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// TMDB 搜索结果
export interface TmdbEnrichResult {
  type: 'movie' | 'tv' | 'unknown';
  tmdbId: number | null;
  posterUrl: string | null;
  releaseDate: string | null;   // 电影: release_date, 电视剧: first_air_date
  overview: string | null;
  title: string | null;          // TMDB 返回的原始标题
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

interface TmdbSearchHit {
  tmdbId: number;
  title: string;
  posterUrl: string | null;
  releaseDate: string | null;
  overview: string | null;
  popularity: number;
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
    const response = await axios.get(`${config.tmdb.baseUrl}${endpoint}`, {
      params: { api_key: config.tmdb.apiKey, query, page: 1 },
      timeout: 10000,
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
      popularity: item.popularity ?? 0,
      similarity: titleSimilarity(query, item[titleField] ?? ''),
    }));
  } catch (err: any) {
    if (err.response?.status === 429 && retryCount < 2) {
      const retryAfter = err.response.headers['retry-after'];
      const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : 3000;
      await delay(waitTime);
      return searchTmdb(query, type, retryCount + 1);
    }
    return [];
  }
}

/**
 * 用片名搜索 TMDB，返回最佳匹配及类型判断。
 * 同时搜索 movie 和 tv，选相似度 + popularity 最高的。
 * 间隔 250ms 防限速。
 */
export async function enrichFromTmdb(title: string): Promise<TmdbEnrichResult> {
  if (!config.tmdb.apiKey) {
    return { type: 'unknown', tmdbId: null, posterUrl: null, releaseDate: null, overview: null, title: null };
  }

  const [movieHits, tvHits] = await Promise.all([
    searchTmdb(title, 'movie'),
    searchTmdb(title, 'tv'),
  ]);

  await delay(250);

  // 过滤低相似度结果（阈值 0.4）
  const goodMovies = movieHits.filter(h => h.similarity >= 0.4);
  const goodTvs = tvHits.filter(h => h.similarity >= 0.4);

  // 各取最佳
  const bestMovie = goodMovies.length > 0
    ? goodMovies.reduce((a, b) => (a.similarity * 10 + a.popularity) > (b.similarity * 10 + b.popularity) ? a : b)
    : null;
  const bestTv = goodTvs.length > 0
    ? goodTvs.reduce((a, b) => (a.similarity * 10 + a.popularity) > (b.similarity * 10 + b.popularity) ? a : b)
    : null;

  // 比较 movie 和 tv 的最佳匹配
  const movieScore = bestMovie ? bestMovie.similarity * 10 + bestMovie.popularity / 100 : 0;
  const tvScore = bestTv ? bestTv.similarity * 10 + bestTv.popularity / 100 : 0;

  if (movieScore === 0 && tvScore === 0) {
    return { type: 'unknown', tmdbId: null, posterUrl: null, releaseDate: null, overview: null, title: null };
  }

  if (movieScore >= tvScore && bestMovie) {
    return {
      type: 'movie',
      tmdbId: bestMovie.tmdbId,
      posterUrl: bestMovie.posterUrl,
      releaseDate: bestMovie.releaseDate,
      overview: bestMovie.overview,
      title: bestMovie.title,
    };
  }

  if (bestTv) {
    return {
      type: 'tv',
      tmdbId: bestTv.tmdbId,
      posterUrl: bestTv.posterUrl,
      releaseDate: bestTv.releaseDate,
      overview: bestTv.overview,
      title: bestTv.title,
    };
  }

  return { type: 'unknown', tmdbId: null, posterUrl: null, releaseDate: null, overview: null, title: null };
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
