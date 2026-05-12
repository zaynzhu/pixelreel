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

// Steam 游戏搜索 Provider，与 Java 端 SteamGameSearchProvider 完全对齐
// 使用 Steam App List 缓存 + 本地过滤搜索
let cachedApps: SteamApp[] | null = null;
let lastRefresh = 0;
const CACHE_TTL = 1440 * 60 * 1000; // 1440 分钟 = 24 小时

interface SteamApp {
  appid: number;
  name: string;
}

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

    const apps = await this.loadAppList();
    const needle = query.trim().toLowerCase();
    const filtered = apps
      .filter((app) => app.name && app.name.toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name));

    const total = filtered.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / SteamGameSearchProvider.PAGE_SIZE);
    const fromIndex = Math.min((normalizedPage - 1) * SteamGameSearchProvider.PAGE_SIZE, filtered.length);
    const toIndex = Math.min(fromIndex + SteamGameSearchProvider.PAGE_SIZE, filtered.length);
    const pageItems = filtered.slice(fromIndex, toIndex);

    const steamAppIds = pageItems.map((i) => i.appid).filter(Boolean);
    const existingMap = steamAppIds.length > 0
      ? await this.findExistingBySteamId(steamAppIds)
      : new Map<any, any>();

    const results: ExternalGameSearchResult[] = pageItems.map((item) => {
      const existing = existingMap.get(item.appid) ?? null;
      const mapped: ExternalGameSearchResult = {
        provider: this.id(),
        rawgId: null,
        steamAppId: item.appid ?? null,
        xboxId: null,
        psnId: null,
        title: item.name,
        posterUrl: null,
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
    return result;
  }

  private async loadAppList(): Promise<SteamApp[]> {
    const now = Date.now();
    if (cachedApps && now - lastRefresh < CACHE_TTL) {
      return cachedApps;
    }

    try {
      const response = await axios.get(`${config.steam.baseUrl}/IStoreService/GetAppList/v1/`, {
        params: config.steam.apiKey ? { key: config.steam.apiKey } : {},
      });
      const apps = response.data?.response?.apps ?? [];
      cachedApps = apps;
      lastRefresh = now;
      return cachedApps!;
    } catch {
      return cachedApps ?? [];
    }
  }

  private async findExistingBySteamId(ids: number[]): Promise<Map<any, any>> {
    const games = await prisma.game.findMany({ where: { steamAppId: { in: ids } } });
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