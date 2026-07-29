export interface TimelinePlatformEntryResponse {
  platform: string;
  playtimeMinutes: number | null;
}

export interface TimelineRecordResponse {
  id: number;
  category: 'movie' | 'game' | 'tv_show';
  title: string;
  posterUrl: string | null;
  status: string;
  rating: number | null;
  playtimeMinutes: number | null;
  sourceLabel: string | null;
  platformLabel: string | null;
  platformEntries: TimelinePlatformEntryResponse[];
  createdAt: string;
}

export interface TimelinePageResponse {
  records: TimelineRecordResponse[];
  nextCursor: string | null;
  totals?: {
    total: number;
  };
}
