export type RecordStatus = "UNSET" | "WANT" | "IN_PROGRESS" | "DONE" | "DROPPED";

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

export type ActionQueueItem = RecentRecordItem & {
  playtimeMinutes: number | null;
};

export type MonthlyMemoryItem = RecentRecordItem & {
  completedAt: string;
  yearsAgo: number;
};

export type YearlyTimelineItem = {
  year: string;
  count: number;
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
    pendingImports: number;
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
  gameTelemetry: {
    totalPlaytimeMinutes: number;
    platformProfiles: number;
    achievementUnlocked: number;
    achievementTotal: number;
    achievementProfiles: number;
    platforms: Array<{
      platform: string;
      profiles: number;
      playtimeProfiles: number;
      achievementProfiles: number;
      achievementsWithoutTotal: number;
      lastSyncedAt: string;
    }>;
  };
  tvShowSources: CountItem[];
  nextUp: {
    resume: ActionQueueItem[];
    backlog: ActionQueueItem[];
    reflect: ActionQueueItem[];
  };
  monthlyMemories: MonthlyMemoryItem[];
  recentItems: RecentRecordItem[];
  yearlyTimeline: YearlyTimelineItem[];
};
