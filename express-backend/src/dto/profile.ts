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
  gameTelemetry: {
    totalPlaytimeMinutes: number;
    platformProfiles: number;
    achievementUnlocked: number;
    achievementTotal: number;
    achievementProfiles: number;
    platforms: GamePlatformHealthItem[];
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
}

export interface YearlyTimelineItem {
  year: string;
  count: number;
}

export interface CountItem {
  key: string;
  label: string;
  count: number;
}

export interface GamePlatformHealthItem {
  platform: string;
  profiles: number;
  playtimeProfiles: number;
  achievementProfiles: number;
  achievementsWithoutTotal: number;
  lastSyncedAt: string;
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

export interface ActionQueueItem extends RecentRecordItem {
  playtimeMinutes: number | null;
}

export interface MonthlyMemoryItem extends RecentRecordItem {
  completedAt: string;
  yearsAgo: number;
}
