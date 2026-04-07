export type RecordStatus = "UNSET" | "WANT" | "IN_PROGRESS" | "DONE";

export type CountItem = {
  key: string;
  label: string;
  count: number;
};

export type RecentRecordItem = {
  category: "movie" | "game";
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
    completedMovies: number;
    completedGames: number;
    ratedRecords: number;
    reviewedRecords: number;
    importedGames: number;
  };
  ratings: {
    overallAverage?: number | null;
    movieAverage?: number | null;
    gameAverage?: number | null;
  };
  movieStatuses: CountItem[];
  gameStatuses: CountItem[];
  movieSources: CountItem[];
  gamePlatforms: CountItem[];
  recentItems: RecentRecordItem[];
};
