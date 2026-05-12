import { ProviderSearchResult, ExternalGameSearchResult } from '../../dto/external-search';

// 游戏搜索 Provider 接口，与 Java 端 GameSearchProvider 对齐
export interface GameSearchProvider {
  id(): string;
  search(query: string, page: number): Promise<ProviderSearchResult<ExternalGameSearchResult>>;
}