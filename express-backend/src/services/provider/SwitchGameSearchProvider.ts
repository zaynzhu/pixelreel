import { ExternalGameSearchResult, ProviderSearchResult } from '../../dto/external-search';
import { GameSearchProvider } from '../provider/GameSearchProvider';

// Switch 游戏搜索 Provider — 占位，与 Java 端 SwitchGameSearchProvider 对齐
export class SwitchGameSearchProvider implements GameSearchProvider {
  id(): string {
    return 'switch';
  }

  async search(query: string, page: number): Promise<ProviderSearchResult<ExternalGameSearchResult>> {
    return {
      provider: this.id(),
      enabled: false,
      message: 'Switch 暂无公开 API，保留占位',
      page,
      totalPages: 0,
      totalResults: 0,
      results: [],
    };
  }
}