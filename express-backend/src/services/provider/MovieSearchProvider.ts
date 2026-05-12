import { ProviderSearchResult, ExternalMovieSearchResult } from '../../dto/external-search';

// 影视搜索 Provider 接口，与 Java 端 MovieSearchProvider 对齐
export interface MovieSearchProvider {
  id(): string;
  search(query: string, page: number): Promise<ProviderSearchResult<ExternalMovieSearchResult>>;
}