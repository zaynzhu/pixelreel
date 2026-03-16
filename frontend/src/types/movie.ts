export type MovieSearchResult = {
  tmdbId: number;
  title: string;
  posterUrl?: string | null;
  releaseDate?: string | null;
  overview?: string | null;
};

export type MovieSearchPage = {
  page: number;
  totalPages: number;
  totalResults: number;
  results: MovieSearchResult[];
};