export type RecordStatus = "UNSET" | "WANT" | "IN_PROGRESS" | "DONE";

export type CountItem = {
  key: string;
  label: string;
  count: number;
};

export type RecentRecordItem = {
  category: "movie" | "game" | "tv_show";
  id: number;
  title: string;
  subtitle: string;
  posterUrl?: string | null;
  status: RecordStatus;
  rating?: number | null;
  createdAt: string;
};

export type ProfileSummary = {
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
    overallAverage?: number | null;
    movieAverage?: number | null;
    gameAverage?: number | null;
    tvShowAverage?: number | null;
  };
  movieStatuses: CountItem[];
  gameStatuses: CountItem[];
  tvShowStatuses: CountItem[];
  movieSources: CountItem[];
  gamePlatforms: CountItem[];
  tvShowSources: CountItem[];
  recentItems: RecentRecordItem[];
};
