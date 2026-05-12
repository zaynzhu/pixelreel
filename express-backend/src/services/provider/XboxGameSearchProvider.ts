import { ExternalGameSearchResult, ProviderSearchResult } from '../../dto/external-search';
import { GameSearchProvider } from '../provider/GameSearchProvider';

// Xbox 游戏搜索 Provider — 占位，与 Java 端 XboxGameSearchProvider 对齐
export class XboxGameSearchProvider implements GameSearchProvider {
  id(): string {
    return 'xbox';
  }

  async search(query: string, page: number): Promise<ProviderSearchResult<ExternalGameSearchResult>> {
    return {
      provider: this.id(),
      enabled: false,
      message: 'Xbox 搜索 API 尚未配置',
      page,
      totalPages: 0,
      totalResults: 0,
      results: [],
    };
  }
}