import axios from 'axios';
import { config } from '../../config';
import { prisma } from '../../config/db';
import { GameSearchProvider } from '../provider/GameSearchProvider';
import {
  ExternalGameSearchResult,
  ProviderSearchResult,
  GameRecordSuggestion,
} from '../../dto/external-search';
import { RecordStatus } from '../../enums/RecordStatus';

// RAWG 游戏搜索 Provider，与 Java 端 RawgGameSearchProvider 完全对齐
export class RawgGameSearchProvider implements GameSearchProvider {
  private static readonly PAGE_SIZE = 20;

  id(): string {
    return 'rawg';
  }

  async search(query: string, page: number): Promise<ProviderSearchResult<ExternalGameSearchResult>> {
    const result: ProviderSearchResult<ExternalGameSearchResult> = {
      provider: this.id(),
      enabled: true,
      message: '',
      page,
      totalPages: 0,
      totalResults: 0,
      results: [],
    };

    if (!config.rawg.apiKey) {
      result.enabled = false;
      result.message = '缺少 RAWG API Key';
      return result;
    }

    if (!query) throw new Error('query must not be blank');
    const normalizedPage = Math.max(page, 1);

    const response = await axios.get(`${config.rawg.baseUrl}/games`, {
      params: {
        search: query,
        page: normalizedPage,
        page_size: RawgGameSearchProvider.PAGE_SIZE,
        key: config.rawg.apiKey,
      },
    });

    const items = response.data?.results ?? [];
    const rawgIds = items.map((i: any) => i.id).filter(Boolean);
    const existingMap = rawgIds.length > 0
      ? await this.findExistingByRawgId(rawgIds)
      : new Map<any, any>();

    const results: ExternalGameSearchResult[] = [];
    for (const item of items) {
      if (!item || !item.name) continue;
      const existing = item.id ? existingMap.get(item.id) ?? null : null;
      const posterUrl = item.background_image
        ? (item.background_image.startsWith('//') ? 'https:' + item.background_image : item.background_image)
        : null;
      const mapped: ExternalGameSearchResult = {
        provider: this.id(),
        rawgId: item.id ?? null,
        steamAppId: null,
        xboxId: null,
        psnId: null,
        title: item.name,
        posterUrl,
        releaseDate: item.released ?? null,
        overview: null,
        alreadyAdded: existing !== null,
        existingRecordId: existing?.id != null ? Number(existing.id) : null,
        suggestedRecord: null,
      };
      mapped.suggestedRecord = this.buildSuggestion(mapped);
      results.push(mapped);
    }

    const total = response.data?.count ?? results.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / RawgGameSearchProvider.PAGE_SIZE);

    result.page = normalizedPage;
    result.totalPages = totalPages;
    result.totalResults = total;
    result.results = results;
    return result;
  }

  private async findExistingByRawgId(ids: number[]): Promise<Map<any, any>> {
    const games = await prisma.game.findMany({ where: { rawgId: { in: ids } } });
    return new Map(games.map((g) => [g.rawgId!, g]));
  }

  private buildSuggestion(mapped: ExternalGameSearchResult): GameRecordSuggestion {
    return {
      rawgId: mapped.rawgId,
      steamAppId: mapped.steamAppId,
      xboxId: mapped.xboxId,
      psnId: mapped.psnId,
      title: mapped.title,
      posterUrl: mapped.posterUrl,
      status: RecordStatus.WANT,
      rating: null,
      shortReview: '',
    };
  }
}