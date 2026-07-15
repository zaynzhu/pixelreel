// Library 记录响应
export interface LibraryRecordResponse {
  id: number;
  category: 'movie' | 'game' | 'tv_show';
  title: string;
  posterUrl: string | null;
  sourceKey: string | null;
  sourceLabel: string | null;
  platformLabel: string | null;
  status: string;
  rating: number | null;
  shortReview: string | null;
  playtimeMinutes: number | null;
  achievementTotal: number | null;
  achievementUnlocked: number | null;
  createdAt: string;
  updatedAt: string;
  importedAt: string | null;
  overview: string | null;
  releaseDate: string | null;
  firstAirDate: string | null;
  platform: string | null;

  // 来源身份
  doubanId: string | null;
  tmdbId: string | null;
  imdbId: string | null;
  traktId: string | null;
  rawgId: string | null;
  steamAppId: string | null;
  xboxId: string | null;
  psnId: string | null;

  // 豆瓣原始字段
  doubanTitle: string | null;
  doubanAltTitle: string | null;
  doubanIntro: string | null;
  doubanRating: number | null;
  doubanDate: string | null;
  doubanComment: string | null;
  doubanLink: string | null;
  doubanAvgRating: number | null;

  // TMDB 原始字段
  tmdbTitle: string | null;
  tmdbPosterUrl: string | null;
  tmdbReleaseDate: string | null;
  tmdbOverview: string | null;
  tmdbVoteAverage: number | null;
  tmdbPopularity: number | null;
  tmdbGenreIds: string | null;

  // IMDb 占位
  imdbRating: number | null;
}

// Library 记录更新请求
export interface LibraryRecordUpdateRequest {
  status: string;
  rating?: number | null;
  shortReview?: string | null;
}

export interface PaginatedLibraryResponse {
  records: LibraryRecordResponse[];
  nextCursor: string | null;
  totals?: {
    total: number;
    rated: number;
    reviewed: number;
    completed: number;
  };
}
