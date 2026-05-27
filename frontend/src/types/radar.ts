export interface RadarItem {
  id: number;
  sourceKey: string;
  source: string;
  sourceId: string | null;
  sourceUrl: string | null;
  tmdbId: number | null;
  doubanId: string | null;
  type: 'movie' | 'tv';
  title: string;
  titleZh: string | null;
  overview: string | null;
  posterPath: string | null;
  releaseDate: string | null;
  platform: string | null;
  category: string;
  voteAverage: number | null;
  lastSyncedAt: string;
  inLibrary: boolean;
}

export interface RadarListResponse {
  items: RadarItem[];
  page: number;
  limit: number;
  total: number;
  lastSyncedAt: string | null;
  warnings: string[];
}

export interface RadarSyncResponse {
  taskId: string;
  status: string;
}

export interface RadarAddToLibraryResponse {
  exists: boolean;
  recordId: number;
  category: string;
}