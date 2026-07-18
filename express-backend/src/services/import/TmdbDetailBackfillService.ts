import axios from 'axios'
import { getDb } from '../../config/db'
import { config } from '../../config'
import { tmdbAuthHeaders, axiosProxyOpts } from '../douban-harvester/tmdb-enrich'
import { createTask, updateProgress, completeTask, failTask } from '../task-manager'
import { assertTaskActive } from './ImportSummaryTaskService'
import { toSafeTmdbId } from './TmdbId'

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export interface TmdbDetail {
  tmdbId: number
  title: string
  overview: string | null
  voteAverage: number | null
  popularity: number | null
  releaseDate: string | null
  posterUrl: string | null
  genreIds: number[]
  imdbId: string | null
}

export async function fetchMovieDetail(
  tmdbId: number,
  signal?: AbortSignal,
): Promise<TmdbDetail | null> {
  try {
    const url = `${config.tmdb.baseUrl}/movie/${tmdbId}`
    const { data } = await axios.get(url, {
      params: { language: 'zh-CN' },
      headers: tmdbAuthHeaders,
      timeout: 10000,
      signal,
      ...axiosProxyOpts,
    })
    return {
      tmdbId: data.id,
      title: data.title ?? '',
      overview: data.overview ?? null,
      voteAverage: data.vote_average ?? null,
      popularity: data.popularity ?? null,
      releaseDate: data.release_date ?? null,
      posterUrl: data.poster_path ? config.tmdb.imageBaseUrl + data.poster_path : null,
      genreIds: (data.genres ?? []).map((g: any) => g.id),
      imdbId: data.imdb_id ?? null,
    }
  } catch (err: any) {
    assertTaskActive(signal)
    if (err.response?.status === 429) {
      const wait = parseInt(err.response.headers['retry-after'] ?? '3', 10) * 1000
      await delay(wait)
      assertTaskActive(signal)
      return fetchMovieDetail(tmdbId, signal)
    }
    console.error(`[TMDB Detail] movie/${tmdbId} error:`, err.message)
    return null
  }
}

export async function fetchTvDetail(
  tmdbId: number,
  signal?: AbortSignal,
): Promise<TmdbDetail | null> {
  try {
    const [detailRes, extIdsRes] = await Promise.all([
      axios.get(`${config.tmdb.baseUrl}/tv/${tmdbId}`, {
        params: { language: 'zh-CN' },
        headers: tmdbAuthHeaders,
        timeout: 10000,
        signal,
        ...axiosProxyOpts,
      }),
      axios.get(`${config.tmdb.baseUrl}/tv/${tmdbId}/external_ids`, {
        headers: tmdbAuthHeaders,
        timeout: 10000,
        signal,
        ...axiosProxyOpts,
      }),
    ])
    const data = detailRes.data
    return {
      tmdbId: data.id,
      title: data.name ?? '',
      overview: data.overview ?? null,
      voteAverage: data.vote_average ?? null,
      popularity: data.popularity ?? null,
      releaseDate: data.first_air_date ?? null,
      posterUrl: data.poster_path ? config.tmdb.imageBaseUrl + data.poster_path : null,
      genreIds: (data.genres ?? []).map((g: any) => g.id),
      imdbId: extIdsRes.data?.imdb_id ?? null,
    }
  } catch (err: any) {
    assertTaskActive(signal)
    if (err.response?.status === 429) {
      const wait = parseInt(err.response.headers['retry-after'] ?? '3', 10) * 1000
      await delay(wait)
      assertTaskActive(signal)
      return fetchTvDetail(tmdbId, signal)
    }
    console.error(`[TMDB Detail] tv/${tmdbId} error:`, err.message)
    return null
  }
}

export async function backfillTmdbDetails(
  limit: number = 50,
  onProgress?: (processed: number, total: number, currentTitle: string) => void,
  signal?: AbortSignal,
) {
  const summary = { total: 0, imported: 0, skipped: 0, errors: [] as string[] }

  // Movie：有 tmdbId 但缺关键字段
  const movies = await getDb().movie.findMany({
    where: {
      tmdbId: { not: null },
      OR: [
        { imdbId: null },
        { tmdbVoteAverage: null },
        { tmdbTitle: null },
      ],
    },
    orderBy: { id: 'asc' },
    take: limit,
  })

  summary.total += movies.length

  for (const movie of movies) {
    assertTaskActive(signal)
    if (onProgress) onProgress(summary.imported + summary.skipped, summary.total, movie.title)

    const tmdbId = toSafeTmdbId(movie.tmdbId!)
    if (tmdbId == null) {
      summary.errors.push(`电影 ${movie.title}: TMDB ID 超出安全整数范围`)
      summary.skipped++
      continue
    }
    const detail = await fetchMovieDetail(tmdbId, signal)
    assertTaskActive(signal)
    if (!detail) {
      summary.errors.push(`电影 ${movie.title}: TMDB 详情获取失败`)
      summary.skipped++
      await delay(250)
      continue
    }

    const data: any = {}
    if (detail.imdbId && !movie.imdbId) data.imdbId = detail.imdbId
    if (detail.voteAverage != null && !movie.tmdbVoteAverage) data.tmdbVoteAverage = detail.voteAverage
    if (detail.popularity != null && !movie.tmdbPopularity) data.tmdbPopularity = detail.popularity
    if (detail.title && !movie.tmdbTitle) data.tmdbTitle = detail.title
    if (detail.overview && !movie.tmdbOverview) data.tmdbOverview = detail.overview
    if (detail.releaseDate && !movie.tmdbReleaseDate) data.tmdbReleaseDate = detail.releaseDate
    if (detail.posterUrl && !movie.tmdbPosterUrl) data.tmdbPosterUrl = detail.posterUrl
    if (detail.genreIds.length > 0 && !movie.tmdbGenreIds) data.tmdbGenreIds = detail.genreIds.join(',')
    // 显示字段：仅当当前为空时写入
    if (detail.releaseDate && !movie.releaseDate) data.releaseDate = detail.releaseDate
    if (detail.overview && !movie.overview) data.overview = detail.overview

    if (Object.keys(data).length > 0) {
      assertTaskActive(signal)
      await getDb().movie.update({ where: { id: movie.id }, data })
      summary.imported++
    } else {
      summary.skipped++
    }
    await delay(250)
  }

  if (summary.total >= limit) return summary

  // TvShow：有 tmdbId 但缺关键字段
  const remaining = limit - summary.total
  const shows = await getDb().tvShow.findMany({
    where: {
      tmdbId: { not: null },
      OR: [
        { imdbId: null },
        { tmdbVoteAverage: null },
        { tmdbTitle: null },
      ],
    },
    orderBy: { id: 'asc' },
    take: remaining,
  })

  summary.total += shows.length

  for (const show of shows) {
    assertTaskActive(signal)
    if (onProgress) onProgress(summary.imported + summary.skipped, summary.total, show.title)

    const tmdbId = toSafeTmdbId(show.tmdbId!)
    if (tmdbId == null) {
      summary.errors.push(`剧集 ${show.title}: TMDB ID 超出安全整数范围`)
      summary.skipped++
      continue
    }
    const detail = await fetchTvDetail(tmdbId, signal)
    assertTaskActive(signal)
    if (!detail) {
      summary.errors.push(`剧集 ${show.title}: TMDB 详情获取失败`)
      summary.skipped++
      await delay(250)
      continue
    }

    const data: any = {}
    if (detail.imdbId && !show.imdbId) data.imdbId = detail.imdbId
    if (detail.voteAverage != null && !show.tmdbVoteAverage) data.tmdbVoteAverage = detail.voteAverage
    if (detail.popularity != null && !show.tmdbPopularity) data.tmdbPopularity = detail.popularity
    if (detail.title && !show.tmdbTitle) data.tmdbTitle = detail.title
    if (detail.overview && !show.tmdbOverview) data.tmdbOverview = detail.overview
    if (detail.releaseDate && !show.tmdbReleaseDate) data.tmdbReleaseDate = detail.releaseDate
    if (detail.posterUrl && !show.tmdbPosterUrl) data.tmdbPosterUrl = detail.posterUrl
    if (detail.genreIds.length > 0 && !show.tmdbGenreIds) data.tmdbGenreIds = detail.genreIds.join(',')
    // 显示字段
    if (detail.releaseDate && !show.firstAirDate) data.firstAirDate = detail.releaseDate
    if (detail.overview && !show.overview) data.overview = detail.overview

    if (Object.keys(data).length > 0) {
      assertTaskActive(signal)
      await getDb().tvShow.update({ where: { id: show.id }, data })
      summary.imported++
    } else {
      summary.skipped++
    }
    await delay(250)
  }

  return summary
}

export function startTmdbDetailBackfillTask(limit: number = 50) {
  const task = createTask('tmdb-detail-backfill', 'TMDB 详情回填')

  ;(async () => {
    try {
      const result = await backfillTmdbDetails(
        limit,
        (processed, total, currentTitle) => {
          updateProgress(task.taskId, { processed, total, currentTitle })
        },
        task.abortController.signal,
      )
      completeTask(task.taskId, result)
    } catch (ex: any) {
      failTask(task.taskId, ex.message)
    }
  })()

  return task
}
