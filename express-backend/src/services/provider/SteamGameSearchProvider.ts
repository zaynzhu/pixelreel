import axios from 'axios';
import { config } from '../../config';
import { getDb } from '../../config/db';
import { GameSearchProvider } from '../provider/GameSearchProvider';
import {
  ExternalGameSearchResult,
  ProviderSearchResult,
  GameRecordSuggestion,
} from '../../dto/external-search';
import { RecordStatus } from '../../enums/RecordStatus';

function containsChinese(str: string): boolean {
  return /[一-鿿]/.test(str);
}

async function translateToEnglish(text: string): Promise<string | null> {
  try {
    const res = await axios.get('https://api.mymemory.translated.net/get', {
      params: { q: text, langpair: 'zh|en' },
      timeout: 5000,
    });
    const translated = res.data?.responseData?.translatedText;
    if (translated && translated.toLowerCase() !== text.toLowerCase()) {
      return translated;
    }
    return null;
  } catch {
    return null;
  }
}

// Steam 游戏搜索 Provider
// 使用 Steam Store Search API（结果按相关性排序，覆盖已下架游戏的重制版）
export class SteamGameSearchProvider implements GameSearchProvider {
  private static readonly PAGE_SIZE = 20;

  id(): string {
    return 'steam';
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

    if (!config.steam.apiKey) {
      result.enabled = false;
      result.message = '缺少 Steam Web API Key';
      return result;
    }

    if (!query) throw new Error('query must not be blank');
    const normalizedPage = Math.max(page, 1);

    // Steam 不支持中文搜索，翻译为英文
    let searchQuery = query.trim();
    if (containsChinese(searchQuery)) {
      const translated = await translateToEnglish(searchQuery);
      if (translated) {
        searchQuery = translated;
      }
    }

    try {
      const response = await axios.get('https://store.steampowered.com/api/storesearch/', {
        params: { term: searchQuery, l: 'english', cc: 'US' },
        timeout: 10000,
      });

      const items = response.data?.items ?? [];
      const total = response.data?.total ?? items.length;
      const totalPages = total === 0 ? 0 : Math.ceil(total / SteamGameSearchProvider.PAGE_SIZE);
      const fromIndex = Math.min((normalizedPage - 1) * SteamGameSearchProvider.PAGE_SIZE, items.length);
      const toIndex = Math.min(fromIndex + SteamGameSearchProvider.PAGE_SIZE, items.length);
      const pageItems = items.slice(fromIndex, toIndex);

      const steamAppIds = pageItems.map((i: any) => i.id).filter(Boolean);
      const existingMap = steamAppIds.length > 0
        ? await this.findExistingBySteamId(steamAppIds)
        : new Map<any, any>();

      const results: ExternalGameSearchResult[] = pageItems.map((item: any) => {
        const existing = existingMap.get(item.id) ?? null;
        const mapped: ExternalGameSearchResult = {
          provider: this.id(),
          rawgId: null,
          steamAppId: item.id ?? null,
          xboxId: null,
          psnId: null,
          title: item.name,
          posterUrl: `https://cdn.akamai.steamstatic.com/steam/apps/${item.id}/header.jpg`,
          releaseDate: null,
          overview: null,
          alreadyAdded: existing !== null,
          existingRecordId: existing?.id != null ? Number(existing.id) : null,
          suggestedRecord: null,
        };
        mapped.suggestedRecord = this.buildSuggestion(mapped);
        return mapped;
      });

      result.page = normalizedPage;
      result.totalPages = totalPages;
      result.totalResults = total;
      result.results = results;
    } catch {
      // 搜索失败返回空结果
    }

    return result;
  }

  private async findExistingBySteamId(ids: number[]): Promise<Map<any, any>> {
    const games = await getDb().game.findMany({ where: { steamAppId: { in: ids } } });
    return new Map(games.map((g) => [g.steamAppId!, g]));
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
