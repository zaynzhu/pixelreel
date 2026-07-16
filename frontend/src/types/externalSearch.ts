export type RecordStatus = "UNSET" | "WANT" | "IN_PROGRESS" | "DONE" | "DROPPED";

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

export type TvShowRecordSuggestion = {
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

export type ImdbDetail = {
  imdbId?: string;
  tmdbId?: number;
  doubanId?: string;
  title: string;
  year: string;
  rated: string;
  runtime: string;
  genre: string;
  director: string;
  actors: string;
  plot: string;
  language: string;
  country: string;
  awards: string;
  posterUrl: string | null;
  rating?: number | null;
  ratingSource?: "douban" | "imdb" | "tmdb";
  imdbRating: string;
  tmdbPopularity?: number | null;
  tmdbGenreIds?: string | null;
  imdbVotes: string;
  boxOffice: string;
};

export type GameDetail = {
  rawgId?: number;
  steamAppId?: number;
  title: string;
  year: string;
  rating: string;
  metacritic: string;
  genre: string;
  platform: string;
  developer: string;
  publisher: string;
  playtime: string;
  esrbRating: string;
  released: string;
  posterUrl: string | null;
  description: string;
  website?: string;
  steamUrl?: string;
  screenshots?: string[];
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

export type ExternalTvShowSearchResult = {
  provider: string;
  tmdbId?: number | null;
  imdbId?: string | null;
  doubanId?: string | null;
  traktId?: string | null;
  title: string;
  posterUrl?: string | null;
  firstAirDate?: string | null;
  overview?: string | null;
  alreadyAdded: boolean;
  existingRecordId?: number | null;
  suggestedRecord: TvShowRecordSuggestion;
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
