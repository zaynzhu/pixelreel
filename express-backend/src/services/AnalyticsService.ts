import { getDb } from '../config/db'
import { AnalyticsResponse } from '../dto/analytics'
import { RecordStatus } from '../enums/RecordStatus'
import { detectGameSource, detectMovieSource, detectTvShowSource } from './LibraryService'
import { resolveCompletionDate } from './RecordDateService'

export async function getAnalytics(year: number): Promise<AnalyticsResponse> {
  const db = getDb()
  const [movies, games, tvShows] = await Promise.all([
    db.movie.findMany({
      select: {
        id: true,
        title: true,
        posterUrl: true,
        status: true,
        rating: true,
        shortReview: true,
        createdAt: true,
        updatedAt: true,
        tmdbId: true,
        doubanId: true,
        doubanDate: true,
        imdbId: true,
        traktId: true,
        doubanRating: true,
        tmdbVoteAverage: true,
      },
      orderBy: { updatedAt: 'desc' },
    }),
    db.game.findMany({
      select: {
        id: true,
        title: true,
        posterUrl: true,
        status: true,
        rating: true,
        shortReview: true,
        createdAt: true,
        updatedAt: true,
        platform: true,
        steamAppId: true,
        xboxId: true,
        psnId: true,
        rawgId: true,
        platformEntries: {
          select: { platform: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    }),
    db.tvShow.findMany({
      select: {
        id: true,
        title: true,
        posterUrl: true,
        status: true,
        rating: true,
        shortReview: true,
        createdAt: true,
        updatedAt: true,
        tmdbId: true,
        doubanId: true,
        doubanDate: true,
        imdbId: true,
        traktId: true,
      },
      orderBy: { updatedAt: 'desc' },
    }),
  ])

  const yearStart = new Date(year, 0, 1)
  const yearEnd = new Date(year + 1, 0, 1)

  const inYear = (d: Date | null) => d != null && d >= yearStart && d < yearEnd

  // 豆瓣记录使用原始标记日期，其他来源才用 updatedAt 作为完成时间近似
  const doneMoviesThisYear = movies.filter(
    m => m.status === RecordStatus.DONE && completionFallsInYear(m, year),
  )
  const doneGamesThisYear = games.filter(
    g => g.status === RecordStatus.DONE && completionFallsInYear(g, year),
  )
  const doneTvShowsThisYear = tvShows.filter(
    s => s.status === RecordStatus.DONE && completionFallsInYear(s, year),
  )

  // 上年完成的记录
  const doneMoviesLastYear = movies.filter(
    m => m.status === RecordStatus.DONE && completionFallsInYear(m, year - 1),
  )
  const doneGamesLastYear = games.filter(
    g => g.status === RecordStatus.DONE && completionFallsInYear(g, year - 1),
  )
  const doneTvShowsLastYear = tvShows.filter(
    s => s.status === RecordStatus.DONE && completionFallsInYear(s, year - 1),
  )

  const completedThisYear = doneMoviesThisYear.length + doneGamesThisYear.length + doneTvShowsThisYear.length
  const completedLastYear = doneMoviesLastYear.length + doneGamesLastYear.length + doneTvShowsLastYear.length

  // 本年入库且有评分的记录（用 createdAt 而非 updatedAt，避免编辑短评导致误算）
  const inYearCreated = (d: Date | null) => inYear(d)
  const ratedMoviesThisYear = movies.filter(m => m.rating != null && inYearCreated(m.createdAt))
  const ratedGamesThisYear = games.filter(g => g.rating != null && inYearCreated(g.createdAt))
  const ratedTvShowsThisYear = tvShows.filter(s => s.rating != null && inYearCreated(s.createdAt))
  const ratedThisYear = ratedMoviesThisYear.length + ratedGamesThisYear.length + ratedTvShowsThisYear.length

  // 本年评分均值
  const allRatingsThisYear = [
    ...ratedMoviesThisYear.map(m => m.rating!),
    ...ratedGamesThisYear.map(g => g.rating!),
    ...ratedTvShowsThisYear.map(s => s.rating!),
  ]
  const avgRatingThisYear = allRatingsThisYear.length > 0
    ? Math.round((allRatingsThisYear.reduce((s, r) => s + r, 0) / allRatingsThisYear.length) * 10) / 10
    : null

  // 本年入库且有短评的记录
  const reviewedMoviesThisYear = movies.filter(m => m.shortReview?.trim() && inYearCreated(m.createdAt))
  const reviewedGamesThisYear = games.filter(g => g.shortReview?.trim() && inYearCreated(g.createdAt))
  const reviewedTvShowsThisYear = tvShows.filter(s => s.shortReview?.trim() && inYearCreated(s.createdAt))
  const reviewedThisYear = reviewedMoviesThisYear.length + reviewedGamesThisYear.length + reviewedTvShowsThisYear.length

  return {
    year,
    availableYears: collectAvailableAnalyticsYears([...movies, ...games, ...tvShows], year),
    overview: {
      completedThisYear,
      completedLastYear,
      avgRatingThisYear,
      ratedThisYear,
      reviewedThisYear,
      totalInLibrary: movies.length + games.length + tvShows.length,
    },
    monthlyCompletion: buildMonthlyCompletion(doneMoviesThisYear, doneGamesThisYear, doneTvShowsThisYear),
    ratingDistribution: buildRatingDistribution(ratedMoviesThisYear, ratedGamesThisYear, ratedTvShowsThisYear),
    sourceBreakdown: buildSourceBreakdown(movies, games, tvShows, yearStart, yearEnd),
    crossPlatformRatings: buildCrossPlatformRatings(movies, yearStart, yearEnd),
    topRated: buildTopRated(movies, games, tvShows, yearStart, yearEnd),
  }
}

export function collectAvailableAnalyticsYears(
  records: Array<{
    createdAt: Date | null
    updatedAt: Date | null
    doubanDate?: string | null
    status: string | null
  }>,
  selectedYear: number,
) {
  const years = new Set<number>([selectedYear])
  const addYear = (date: Date | null) => {
    const year = date?.getUTCFullYear()
    if (year != null && year >= 1900 && year <= 3000) years.add(year)
  }

  for (const record of records) {
    addYear(record.createdAt)
    if (record.status === RecordStatus.DONE) addYear(resolveCompletionDate(record))
  }

  return [...years].sort((left, right) => right - left)
}

function buildMonthlyCompletion(
  movies: any[], games: any[], tvShows: any[]
): AnalyticsResponse['monthlyCompletion'] {
  const months: AnalyticsResponse['monthlyCompletion'] = []
  for (let i = 1; i <= 12; i++) {
    const mm = i.toString().padStart(2, '0')
    months.push({
      month: mm,
      movies: movies.filter(m => (resolveCompletionDate(m)?.getUTCMonth() ?? -1) === i - 1).length,
      games: games.filter(g => (resolveCompletionDate(g)?.getUTCMonth() ?? -1) === i - 1).length,
      tvShows: tvShows.filter(s => (resolveCompletionDate(s)?.getUTCMonth() ?? -1) === i - 1).length,
    })
  }
  return months
}

function completionFallsInYear(
  record: { doubanDate?: string | null; updatedAt: Date | null },
  year: number,
) {
  return resolveCompletionDate(record)?.getUTCFullYear() === year
}

function buildRatingDistribution(
  movies: any[], games: any[], tvShows: any[]
): AnalyticsResponse['ratingDistribution'] {
  const dist = (items: any[]) => {
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    for (const item of items) {
      if (item.rating >= 1 && item.rating <= 5) counts[item.rating]++
    }
    return [1, 2, 3, 4, 5].map(r => ({ rating: r, count: counts[r] }))
  }
  return { movies: dist(movies), games: dist(games), tvShows: dist(tvShows) }
}

export function buildSourceBreakdown(
  movies: any[], games: any[], tvShows: any[],
  yearStart: Date, yearEnd: Date
): AnalyticsResponse['sourceBreakdown'] {
  const inYear = (d: Date | null) => d != null && d >= yearStart && d < yearEnd
  movies = movies.filter(m => inYear(m.createdAt))
  games = games.filter(g => inYear(g.createdAt))
  tvShows = tvShows.filter(s => inYear(s.createdAt))
  const countBy = (items: any[], fn: (item: any) => string) => {
    const counts: Record<string, number> = {}
    for (const item of items) {
      const key = fn(item)
      counts[key] = (counts[key] || 0) + 1
    }
    return counts
  }

  const movieSourceCounts = countBy(movies, movie => detectMovieSource(movie).toUpperCase())
  const movieLabels: Record<string, string> = { TMDB: 'TMDB', DOUBAN: '豆瓣', IMDB: 'IMDb', TRAKT: 'Trakt', MANUAL: '手动' }
  const movieSources = Object.entries(movieSourceCounts)
    .map(([source, count]) => ({ source, label: movieLabels[source] || source, count }))
    .sort((a, b) => b.count - a.count)

  const gamePlatformCounts = buildGamePlatformCounts(games)
  const gameLabels: Record<string, string> = { STEAM: 'Steam', RAWG: 'RAWG', XBOX: 'Xbox', PSN: 'PSN', MANUAL: '手动' }
  const gamePlatforms = Object.entries(gamePlatformCounts)
    .map(([platform, count]) => ({ platform, label: gameLabels[platform] || platform, count }))
    .sort((a, b) => b.count - a.count)

  const tvSourceCounts = countBy(tvShows, show => detectTvShowSource(show).toUpperCase())
  const tvLabels: Record<string, string> = { TMDB: 'TMDB', DOUBAN: '豆瓣', IMDB: 'IMDb', TRAKT: 'Trakt', MANUAL: '手动' }
  const tvSources = Object.entries(tvSourceCounts)
    .map(([source, count]) => ({ source, label: tvLabels[source] || source, count }))
    .sort((a, b) => b.count - a.count)

  return { movies: movieSources, games: gamePlatforms, tvShows: tvSources }
}

export function buildGamePlatformCounts(games: any[]) {
  const counts: Record<string, number> = {}
  for (const game of games) {
    const platformEntries = Array.isArray(game.platformEntries) ? game.platformEntries : []
    let countedProfiles = 0
    for (const entry of platformEntries) {
      const platform = String(entry.platform ?? '').trim().toUpperCase()
      if (!platform) continue
      counts[platform] = (counts[platform] || 0) + 1
      countedProfiles++
    }
    if (countedProfiles === 0) {
      const platform = detectGameSource(game).toUpperCase()
      counts[platform] = (counts[platform] || 0) + 1
    }
  }
  return counts
}

export function buildCrossPlatformRatings(
  movies: any[],
  yearStart: Date,
  yearEnd: Date,
): AnalyticsResponse['crossPlatformRatings'] {
  const ratings = new Map<string, AnalyticsResponse['crossPlatformRatings'][number]>()

  for (const movie of movies) {
    if (movie.createdAt == null || movie.createdAt < yearStart || movie.createdAt >= yearEnd) continue
    if (movie.doubanRating == null || movie.tmdbVoteAverage == null) continue
    const doubanRating = movie.doubanRating
    const tmdbRating = Math.round((Number(movie.tmdbVoteAverage) / 2) * 10) / 10
    const key = `${doubanRating}:${tmdbRating}`
    const existing = ratings.get(key)
    if (existing) {
      existing.count++
    } else {
      ratings.set(key, { doubanRating, tmdbRating, count: 1 })
    }
  }

  return [...ratings.values()].sort((a, b) =>
    a.doubanRating - b.doubanRating || a.tmdbRating - b.tmdbRating
  )
}

function buildTopRated(
  movies: any[], games: any[], tvShows: any[],
  yearStart: Date, yearEnd: Date
): AnalyticsResponse['topRated'] {
  const inYear = (d: Date | null) => d != null && d >= yearStart && d < yearEnd

  const items: AnalyticsResponse['topRated'] = [
    ...movies.filter(m => m.rating != null && inYear(m.createdAt)).map(m => ({
      category: 'movie' as const,
      id: Number(m.id),
      title: m.title,
      posterUrl: m.posterUrl,
      rating: m.rating!,
      shortReview: m.shortReview,
      source: detectMovieSource(m).toUpperCase(),
    })),
    ...games.filter(g => g.rating != null && inYear(g.createdAt)).map(g => ({
      category: 'game' as const,
      id: Number(g.id),
      title: g.title,
      posterUrl: g.posterUrl,
      rating: g.rating!,
      shortReview: g.shortReview,
      source: detectGameSource(g).toUpperCase(),
    })),
    ...tvShows.filter(s => s.rating != null && inYear(s.createdAt)).map(s => ({
      category: 'tv_show' as const,
      id: Number(s.id),
      title: s.title,
      posterUrl: s.posterUrl,
      rating: s.rating!,
      shortReview: s.shortReview,
      source: detectTvShowSource(s).toUpperCase(),
    })),
  ]

  return items.sort((a, b) => b.rating - a.rating).slice(0, 10)
}
