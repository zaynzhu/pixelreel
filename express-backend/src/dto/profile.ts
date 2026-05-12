// 个人主页统计聚合响应：与 Java 端 ProfileSummaryResponse 完全对齐
export interface ProfileSummaryResponse {
  overview: {
    totalRecords: number;
    totalMovies: number;
    totalGames: number;
    totalTvShows: number;
    completedMovies: number;
    completedGames: number;
    completedTvShows: number;
    ratedRecords: number;
    reviewedRecords: number;
    importedGames: number;
  };
  ratings: {
    overallAverage: number | null;
    movieAverage: number | null;
    gameAverage: number | null;
    tvShowAverage: number | null;
  };
  movieStatuses: CountItem[];
  gameStatuses: CountItem[];
  tvShowStatuses: CountItem[];
  movieSources: CountItem[];
  gamePlatforms: CountItem[];
  tvShowSources: CountItem[];
  recentItems: RecentRecordItem[];
}

export interface CountItem {
  key: string;
  label: string;
  count: number;
}

export interface RecentRecordItem {
  category: 'movie' | 'game' | 'tv_show';
  id: number;
  title: string;
  subtitle: string | null;
  posterUrl: string | null;
  status: string;
  rating: number | null;
  createdAt: string;
}