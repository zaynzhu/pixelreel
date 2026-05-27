export type RadarSource = 'tmdb' | 'youku' | 'tencent' | 'douban';
export type RadarCategory = 'now_playing' | 'upcoming' | 'trending' | 'on_the_air';
export type RadarType = 'movie' | 'tv';

export interface RadarItemInput {
  sourceKey: string;
  source: RadarSource;
  sourceId?: string;
  sourceUrl?: string;
  tmdbId?: number;
  doubanId?: string;
  type: RadarType;
  title: string;
  titleZh?: string;
  overview?: string;
  posterPath?: string;
  releaseDate?: string;
  platform?: string;
  category: RadarCategory;
  voteAverage?: number;
}

export interface RadarSourceResult {
  source: RadarSource;
  ok: boolean;
  count: number;
  warning?: string;
}

export const CRITICAL_SOURCES: RadarSource[] = ['tmdb'];
export const OPTIONAL_SOURCES: RadarSource[] = ['youku', 'tencent'];