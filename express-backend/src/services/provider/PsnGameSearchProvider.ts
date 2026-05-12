import { ExternalGameSearchResult, ProviderSearchResult } from '../../dto/external-search';
import { GameSearchProvider } from '../provider/GameSearchProvider';

// PSN 游戏搜索 Provider — 占位，与 Java 端 PsnGameSearchProvider 对齐
export class PsnGameSearchProvider implements GameSearchProvider {
  id(): string {
    return 'psn';
  }

  async search(query: string, page: number): Promise<ProviderSearchResult<ExternalGameSearchResult>> {
    return {
      provider: this.id(),
      enabled: false,
      message: 'PSN 搜索 API 尚未配置',
      page,
      totalPages: 0,
      totalResults: 0,
      results: [],
    };
  }
}