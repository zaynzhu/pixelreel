import axios from 'axios';
import { config } from '../../config';
import { prisma } from '../../config/db';
import { ImportSummary } from '../../dto/import-summary';

// 延迟辅助函数，用于控制请求速率
export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fillTmdbCovers(limit?: number | null): Promise<ImportSummary> {
  const summary: ImportSummary = { total: 0, imported: 0, skipped: 0, errors: [] };

  if (!config.tmdb.apiKey) {
    summary.errors.push('缺少 TMDB API Key');
    return summary;
  }

  // 为了防止单次请求时间过长导致 Nginx/浏览器 超时，
  // 如果前端没有传 limit，我们后端强制设定一个单次最大处理量（例如 50 或 100）。
  // 这样前端可以多次点击，或实现循环拉取，而不是一次性卡死。
  const effectiveLimit = limit == null || limit <= 0 ? 50 : limit;

  // 1. 处理电影
  const targetMovies = await prisma.movie.findMany({
    where: { 
      posterUrl: null,
      tmdbId: { not: null }
    },
    orderBy: { id: 'asc' },
    take: effectiveLimit,
  });

  summary.total += targetMovies.length;

  for (const movie of targetMovies) {
    try {
      const posterUrl = await fetchTmdbPosterUrl('movie', movie.tmdbId!);
      if (!posterUrl) {
        summary.skipped++;
      } else {
        await prisma.movie.update({
          where: { id: movie.id },
          data: { posterUrl },
        });
        summary.imported++;
      }
    } catch (ex: any) {
      summary.errors.push(`电影 ${movie.title} 补全失败: ${ex.message}`);
      summary.skipped++;
    }
    // 请求间隔 250ms，单线程每秒大概 4 个请求，远低于 TMDB 限制 (一般是 40~50次/秒)
    // 这极大地避免了触发 429 Too Many Requests 
    await delay(250);
  }

  if (summary.total >= effectiveLimit) {
      return summary;
  }

  const remainingLimit = effectiveLimit - summary.total;
  
  // 2. 处理电视剧
  const targetShows = await prisma.tvShow.findMany({
    where: { 
      posterUrl: null,
      tmdbId: { not: null }
    },
    orderBy: { id: 'asc' },
    ...(remainingLimit > 0 ? { take: remainingLimit } : {}),
  });

  summary.total += targetShows.length;

  for (const show of targetShows) {
    try {
      const posterUrl = await fetchTmdbPosterUrl('tv', show.tmdbId!);
      if (!posterUrl) {
        summary.skipped++;
      } else {
        await prisma.tvShow.update({
          where: { id: show.id },
          data: { posterUrl },
        });
        summary.imported++;
      }
    } catch (ex: any) {
      summary.errors.push(`剧集 ${show.title} 补全失败: ${ex.message}`);
      summary.skipped++;
    }
    await delay(250);
  }

  return summary;
}

export async function fetchTmdbPosterUrl(type: 'movie' | 'tv', tmdbId: number | bigint, retryCount = 0): Promise<string | null> {
  try {
    const response = await axios.get(`${config.tmdb.baseUrl}/${type}/${tmdbId.toString()}`, {
      params: { api_key: config.tmdb.apiKey },
      timeout: 5000, // 设置 5s 超时，防止挂死
    });

    const posterPath = response.data?.poster_path;
    if (!posterPath) return null;

    return `${config.tmdb.imageBaseUrl}${posterPath}`;
  } catch (err: any) {
    // 专门处理 429 速率限制
    if (err.response?.status === 429 && retryCount < 2) {
      // 提取 Retry-After 响应头，如果没有则默认等 3 秒
      const retryAfter = err.response.headers['retry-after'];
      const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : 3000;
      await delay(waitTime);
      // 退避重试
      return fetchTmdbPosterUrl(type, tmdbId, retryCount + 1);
    }
    return null;
  }
}
