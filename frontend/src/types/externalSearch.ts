export type RecordStatus = "WANT" | "IN_PROGRESS" | "DONE";

export type MovieRecordSuggestion = {
  tmdbId?: number | null;
  imdbId?: string | null;
  doubanId?: string | null;
  traktId?: string | null;
  title: string;
  posterUrl?: string | null;
  status: RecordStatus;
  rating?: number | null;
  shortReview?: string | null;
};

export type GameRecordSuggestion = {
  rawgId?: number | null;
  steamAppId?: number | null;
  xboxId?: string | null;
  psnId?: string | null;
  title: string;
  posterUrl?: string | null;
  status: RecordStatus;
  rating?: number | null;
  shortReview?: string | null;
};

export type ExternalMovieSearchResult = {
  provider: string;
  tmdbId?: number | null;
  imdbId?: string | null;
  doubanId?: string | null;
  traktId?: string | null;
  title: string;
  posterUrl?: string | null;
  releaseDate?: string | null;
  overview?: string | null;
  alreadyAdded: boolean;
  existingRecordId?: number | null;
  suggestedRecord: MovieRecordSuggestion;
};

export type ExternalGameSearchResult = {
  provider: string;
  rawgId?: number | null;
  steamAppId?: number | null;
  xboxId?: string | null;
  psnId?: string | null;
  title: string;
  posterUrl?: string | null;
  releaseDate?: string | null;
  overview?: string | null;
  alreadyAdded: boolean;
  existingRecordId?: number | null;
  suggestedRecord: GameRecordSuggestion;
};

export type ProviderSearchResult<T> = {
  provider: string;
  enabled: boolean;
  message?: string | null;
  page: number;
  totalPages: number;
  totalResults: number;
  results: T[];
};

export type ExternalSearchResponse<T> = {
  query: string;
  page: number;
  providers: ProviderSearchResult<T>[];
};