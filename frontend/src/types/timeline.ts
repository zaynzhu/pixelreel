import type { LibraryCategory, RecordStatus } from './library';

export type TimelineCategoryFilter = 'media' | 'game' | 'all';

export type TimelineRecord = {
  id: number;
  category: LibraryCategory;
  title: string;
  posterUrl?: string | null;
  sourceLabel?: string | null;
  platformLabel?: string | null;
  status: RecordStatus;
  rating?: number | null;
  playtimeMinutes?: number | null;
  createdAt: string;
};

export type TimelinePageResponse = {
  records: TimelineRecord[];
  nextCursor: string | null;
  totals?: {
    total: number;
  };
};