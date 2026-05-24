import { getDb } from '../config/db'
import { AnalyticsResponse } from '../dto/analytics'
import { RecordStatus } from '../enums/RecordStatus'

export async function getAnalytics(year: number): Promise<AnalyticsResponse> {
  const db = getDb()
  const [movies, games, tvShows] = await Promise.all([
    db.movie.findMany({ orderBy: { updatedAt: 'desc' } }),
    db.game.findMany({ orderBy: { updatedAt: 'desc' } }),
    db.tvShow.findMany({ orderBy: { updatedAt: 'desc' } }),
  ])

  const yearStart = new Date(year, 0, 1)
  const yearEnd = new Date(year + 1, 0, 1)
  const lastYearStart = new Date(year - 1, 0, 1)
  const lastYearEnd = new Date(year, 0, 1)

  const inYear = (d: Date | null) => d != null && d >= yearStart && d < yearEnd
  const inLastYear = (d: Date | null) => d != null && d >= lastYearStart && d < lastYearEnd

  // 本年完成的记录
  const doneMoviesThisYear = movies.filter(m => m.status === RecordStatus.DONE && inYear(m.updatedAt))
  const doneGamesThisYear = games.filter(g => g.status === RecordStatus.DONE && inYear(g.updatedAt))
  const doneTvShowsThisYear = tvShows.filter(s => s.status === RecordStatus.DONE && inYear(s.updatedAt))

  // 上年完成的记录
  const doneMoviesLastYear = movies.filter(m => m.status === RecordStatus.DONE && inLastYear(m.updatedAt))
  const doneGamesLastYear = games.filter(g => g.status === RecordStatus.DONE && inLastYear(g.updatedAt))
  const doneTvShowsLastYear = tvShows.filter(s => s.status === RecordStatus.DONE && inLastYear(s.updatedAt))

  const completedThisYear = doneMoviesThisYear.length + doneGamesThisYear.length + doneTvShowsThisYear.length
  const completedLastYear = doneMoviesLastYear.length + doneGamesLastYear.length + doneTvShowsLastYear.length

  // 本年有评分的记录（updatedAt 在该年且 rating 不为 null）
  const ratedMoviesThisYear = movies.filter(m => m.rating != null && inYear(m.updatedAt))
  const ratedGamesThisYear = games.filter(g => g.rating != null && inYear(g.updatedAt))
  const ratedTvShowsThisYear = tvShows.filter(s => s.rating != null && inYear(s.updatedAt))
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

  // 本年有短评的记录
  const reviewedMoviesThisYear = movies.filter(m => m.shortReview?.trim() && inYear(m.updatedAt))
  const reviewedGamesThisYear = games.filter(g => g.shortReview?.trim() && inYear(g.updatedAt))
  const reviewedTvShowsThisYear = tvShows.filter(s => s.shortReview?.trim() && inYear(s.updatedAt))
  const reviewedThisYear = reviewedMoviesThisYear.length + reviewedGamesThisYear.length + reviewedTvShowsThisYear.length

  return {
    year,
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
    sourceBreakdown: buildSourceBreakdown(movies, games, tvShows),
    crossPlatformRatings: buildCrossPlatformRatings(movies),
    topRated: buildTopRated(movies, games, tvShows, yearStart, yearEnd),
  }
}

function buildMonthlyCompletion(
  movies: any[], games: any[], tvShows: any[]
): AnalyticsResponse['monthlyCompletion'] {
  const months: AnalyticsResponse['monthlyCompletion'] = []
  for (let i = 1; i <= 12; i++) {
    const mm = i.toString().padStart(2, '0')
    months.push({
      month: mm,
      movies: movies.filter(m => (m.updatedAt?.getMonth() ?? -1) === i - 1).length,
      games: games.filter(g => (g.updatedAt?.getMonth() ?? -1) === i - 1).length,
      tvShows: tvShows.filter(s => (s.updatedAt?.getMonth() ?? -1) === i - 1).length,
    })
  }
  return months
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

function buildSourceBreakdown(
  movies: any[], games: any[], tvShows: any[]
): AnalyticsResponse['sourceBreakdown'] {
  const countBy = (items: any[], fn: (item: any) => string) => {
    const counts: Record<string, number> = {}
    for (const item of items) {
      const key = fn(item)
      counts[key] = (counts[key] || 0) + 1
    }
    return counts
  }

  const movieSourceCounts = countBy(movies, inferMovieSource)
  const movieLabels: Record<string, string> = { TMDB: 'TMDB', DOUBAN: '豆瓣', IMDB: 'IMDb', TRAKT: 'Trakt', MANUAL: '手动' }
  const movieSources = Object.entries(movieSourceCounts)
    .map(([source, count]) => ({ source, label: movieLabels[source] || source, count }))
    .sort((a, b) => b.count - a.count)

  const gamePlatformCounts = countBy(games, inferGamePlatform)
  const gameLabels: Record<string, string> = { STEAM: 'Steam', RAWG: 'RAWG', XBOX: 'Xbox', PSN: 'PSN', MANUAL: '手动' }
  const gamePlatforms = Object.entries(gamePlatformCounts)
    .map(([platform, count]) => ({ platform, label: gameLabels[platform] || platform, count }))
    .sort((a, b) => b.count - a.count)

  const tvSourceCounts = countBy(tvShows, inferTvShowSource)
  const tvLabels: Record<string, string> = { TMDB: 'TMDB', DOUBAN: '豆瓣', IMDB: 'IMDb', TRAKT: 'Trakt', MANUAL: '手动' }
  const tvSources = Object.entries(tvSourceCounts)
    .map(([source, count]) => ({ source, label: tvLabels[source] || source, count }))
    .sort((a, b) => b.count - a.count)

  return { movies: movieSources, games: gamePlatforms, tvShows: tvSources }
}

function buildCrossPlatformRatings(movies: any[]): AnalyticsResponse['crossPlatformRatings'] {
  return movies
    .filter(m => m.doubanRating != null && m.tmdbVoteAverage != null)
    .map(m => ({
      title: m.title,
      doubanRating: m.doubanRating,
      tmdbRating: Math.round((Number(m.tmdbVoteAverage) / 2) * 10) / 10,
    }))
}

function buildTopRated(
  movies: any[], games: any[], tvShows: any[],
  yearStart: Date, yearEnd: Date
): AnalyticsResponse['topRated'] {
  const inYear = (d: Date | null) => d != null && d >= yearStart && d < yearEnd

  const items: AnalyticsResponse['topRated'] = [
    ...movies.filter(m => m.rating != null && inYear(m.updatedAt)).map(m => ({
      category: 'movie' as const,
      id: Number(m.id),
      title: m.title,
      posterUrl: m.posterUrl,
      rating: m.rating!,
      shortReview: m.shortReview,
      source: inferMovieSource(m),
    })),
    ...games.filter(g => g.rating != null && inYear(g.updatedAt)).map(g => ({
      category: 'game' as const,
      id: Number(g.id),
      title: g.title,
      posterUrl: g.posterUrl,
      rating: g.rating!,
      shortReview: g.shortReview,
      source: inferGamePlatform(g),
    })),
    ...tvShows.filter(s => s.rating != null && inYear(s.updatedAt)).map(s => ({
      category: 'tv_show' as const,
      id: Number(s.id),
      title: s.title,
      posterUrl: s.posterUrl,
      rating: s.rating!,
      shortReview: s.shortReview,
      source: inferTvShowSource(s),
    })),
  ]

  return items.sort((a, b) => b.rating - a.rating).slice(0, 10)
}

// 复用 ProfileSummaryService 的来源推断逻辑
function inferMovieSource(movie: any): string {
  if (movie.tmdbId) return 'TMDB'
  if (movie.doubanId) return 'DOUBAN'
  if (movie.imdbId) return 'IMDB'
  if (movie.traktId) return 'TRAKT'
  return 'MANUAL'
}

function inferGamePlatform(game: any): string {
  if (game.platform?.trim()) return game.platform.trim().toUpperCase()
  if (game.steamAppId) return 'STEAM'
  if (game.xboxId) return 'XBOX'
  if (game.psnId) return 'PSN'
  if (game.rawgId) return 'RAWG'
  return 'MANUAL'
}

function inferTvShowSource(show: any): string {
  if (show.tmdbId) return 'TMDB'
  if (show.doubanId) return 'DOUBAN'
  if (show.imdbId) return 'IMDB'
  if (show.traktId) return 'TRAKT'
  return 'MANUAL'
}
