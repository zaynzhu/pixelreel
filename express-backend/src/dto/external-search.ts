// 响应 DTO：与 Java 端 ExternalSearchResponse 完全对齐
export interface ExternalSearchResponse<T> {
  query: string;
  page: number;
  providers: ProviderSearchResult<T>[];
}

// 单个 Provider 的搜索结果
export interface ProviderSearchResult<T> {
  provider: string;
  enabled: boolean;
  message: string;
  page: number;
  totalPages: number;
  totalResults: number;
  results: T[];
}

// 影视搜索结果
export interface ExternalMovieSearchResult {
  provider: string;
  tmdbId: number | null;
  imdbId: string | null;
  doubanId: string | null;
  traktId: string | null;
  title: string;
  posterUrl: string | null;
  releaseDate: string | null;
  overview: string | null;
  alreadyAdded: boolean;
  existingRecordId: number | null;
  suggestedRecord: MovieRecordSuggestion | null;
}

// 游戏搜索结果
export interface ExternalGameSearchResult {
  provider: string;
  rawgId: number | null;
  steamAppId: number | null;
  xboxId: string | null;
  psnId: string | null;
  title: string;
  posterUrl: string | null;
  releaseDate: string | null;
  overview: string | null;
  alreadyAdded: boolean;
  existingRecordId: number | null;
  suggestedRecord: GameRecordSuggestion | null;
}

// 影视记录建议
export interface MovieRecordSuggestion {
  tmdbId: number | null;
  imdbId: string | null;
  doubanId: string | null;
  traktId: string | null;
  title: string;
  posterUrl: string | null;
  status: string | null;
  rating: number | null;
  shortReview: string | null;
}

// 游戏记录建议
export interface GameRecordSuggestion {
  rawgId: number | null;
  steamAppId: number | null;
  xboxId: string | null;
  psnId: string | null;
  title: string;
  posterUrl: string | null;
  status: string | null;
  rating: number | null;
  shortReview: string | null;
}

// 电视剧搜索结果
export interface ExternalTvShowSearchResult {
  provider: string;
  tmdbId: number | null;
  imdbId: string | null;
  doubanId: string | null;
  traktId: string | null;
  title: string;
  posterUrl: string | null;
  firstAirDate: string | null;
  overview: string | null;
  alreadyAdded: boolean;
  existingRecordId: number | null;
  suggestedRecord: TvShowRecordSuggestion | null;
}

export interface TvShowRecordSuggestion {
  tmdbId: number | null;
  imdbId: string | null;
  doubanId: string | null;
  traktId: string | null;
  title: string;
  posterUrl: string | null;
  status: string | null;
  rating: number | null;
  shortReview: string | null;
}