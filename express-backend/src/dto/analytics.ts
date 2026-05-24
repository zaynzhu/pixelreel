// 分析接口响应类型
export interface AnalyticsResponse {
  year: number

  overview: {
    completedThisYear: number
    completedLastYear: number
    avgRatingThisYear: number | null
    ratedThisYear: number
    reviewedThisYear: number
    totalInLibrary: number
  }

  monthlyCompletion: Array<{
    month: string     // "01" ~ "12"
    movies: number
    games: number
    tvShows: number
  }>

  ratingDistribution: {
    movies: Array<{ rating: number; count: number }>
    games: Array<{ rating: number; count: number }>
    tvShows: Array<{ rating: number; count: number }>
  }

  sourceBreakdown: {
    movies: Array<{ source: string; label: string; count: number }>
    games: Array<{ platform: string; label: string; count: number }>
    tvShows: Array<{ source: string; label: string; count: number }>
  }

  crossPlatformRatings: Array<{
    title: string
    doubanRating: number
    tmdbRating: number
  }>

  topRated: Array<{
    category: string     // "movie" | "game" | "tv_show"
    id: number
    title: string
    posterUrl: string | null
    rating: number
    shortReview: string | null
    source: string
  }>
}
