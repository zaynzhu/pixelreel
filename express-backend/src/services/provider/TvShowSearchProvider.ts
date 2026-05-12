import { ProviderSearchResult, ExternalTvShowSearchResult } from '../../dto/external-search';

// 电视剧搜索 Provider 接口
export interface TvShowSearchProvider {
  id(): string;
  search(query: string, page: number): Promise<ProviderSearchResult<ExternalTvShowSearchResult>>;
}