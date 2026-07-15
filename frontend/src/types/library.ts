export type RecordStatus = "UNSET" | "WANT" | "IN_PROGRESS" | "DONE" | "DROPPED";

export type LibraryCategory = "movie" | "game" | "tv_show";

export type LibraryRecord = {
  id: number;
  category: LibraryCategory;
  title: string;
  posterUrl?: string | null;
  sourceKey: string;
  sourceLabel: string;
  platformLabel?: string | null;
  status: RecordStatus;
  rating?: number | null;
  shortReview?: string | null;
  playtimeMinutes?: number | null;
  achievementTotal?: number | null;
  achievementUnlocked?: number | null;
  createdAt: string;
  updatedAt?: string | null;
  importedAt?: string | null;

  // 豆瓣原始字段
  doubanTitle?: string | null;
  doubanAltTitle?: string | null;
  doubanIntro?: string | null;
  doubanRating?: number | null;
  doubanDate?: string | null;
  doubanComment?: string | null;
  doubanLink?: string | null;
  doubanAvgRating?: number | null;

  // TMDB 原始字段
  tmdbTitle?: string | null;
  tmdbPosterUrl?: string | null;
  tmdbReleaseDate?: string | null;
  tmdbOverview?: string | null;
  tmdbVoteAverage?: number | null;
  tmdbPopularity?: number | null;
  tmdbGenreIds?: string | null;

  // IMDb 占位
  imdbRating?: number | null;
};

export type LibraryRecordUpdateInput = {
  status: RecordStatus;
  rating?: number | null;
  shortReview?: string | null;
};
