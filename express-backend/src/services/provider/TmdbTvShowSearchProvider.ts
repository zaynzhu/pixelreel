import axios from 'axios';
import { config } from '../../config';
import { prisma } from '../../config/db';
import { TvShowSearchProvider } from '../provider/TvShowSearchProvider';
import {
  ExternalTvShowSearchResult,
  ProviderSearchResult,
  TvShowRecordSuggestion,
} from '../../dto/external-search';
import { RecordStatus } from '../../enums/RecordStatus';

// TMDB 电视剧搜索 Provider
export class TmdbTvShowSearchProvider implements TvShowSearchProvider {
  id(): string {
    return 'tmdb';
  }

  async search(query: string, page: number): Promise<ProviderSearchResult<ExternalTvShowSearchResult>> {
    const result: ProviderSearchResult<ExternalTvShowSearchResult> = {
      provider: this.id(),
      enabled: true,
      message: '',
      page,
      totalPages: 0,
      totalResults: 0,
      results: [],
    };

    if (!config.tmdb.apiKey) {
      result.enabled = false;
      result.message = 'TMDB 未启用';
      return result;
    }

    if (!query) throw new Error('query must not be blank');
    const normalizedPage = Math.max(page, 1);

    const response = await axios.get(`${config.tmdb.baseUrl}/search/tv`, {
      params: {
        api_key: config.tmdb.apiKey,
        query,
        page: normalizedPage,
      },
    });

    const items = response.data?.results ?? [];
    const tmdbIds = items.map((i: any) => i.id).filter(Boolean);
    const existingMap = tmdbIds.length > 0
      ? await this.findExistingByTmdbId(tmdbIds)
      : new Map<any, any>();

    const results: ExternalTvShowSearchResult[] = items.map((item: any) => {
      const existing = item.id ? existingMap.get(item.id) ?? null : null;
      const mapped: ExternalTvShowSearchResult = {
        provider: this.id(),
        tmdbId: item.id ?? null,
        imdbId: null,
        doubanId: null,
        traktId: null,
        title: item.name ?? item.title ?? '',
        posterUrl: item.poster_path ? config.tmdb.imageBaseUrl + item.poster_path : null,
        firstAirDate: item.first_air_date ?? null,
        overview: item.overview ?? null,
        alreadyAdded: existing !== null,
        existingRecordId: existing?.id != null ? Number(existing.id) : null,
        suggestedRecord: null,
      };
      mapped.suggestedRecord = this.buildSuggestion(mapped);
      return mapped;
    });

    result.page = response.data?.page ?? normalizedPage;
    result.totalPages = response.data?.total_pages ?? 0;
    result.totalResults = response.data?.total_results ?? 0;
    result.results = results;
    return result;
  }

  private async findExistingByTmdbId(ids: number[]): Promise<Map<any, any>> {
    const shows = await prisma.tvShow.findMany({ where: { tmdbId: { in: ids } } });
    return new Map(shows.map((s) => [s.tmdbId!, s]));
  }

  private buildSuggestion(mapped: ExternalTvShowSearchResult): TvShowRecordSuggestion {
    return {
      tmdbId: mapped.tmdbId,
      imdbId: mapped.imdbId,
      doubanId: mapped.doubanId,
      traktId: mapped.traktId,
      title: mapped.title,
      posterUrl: mapped.posterUrl,
      status: RecordStatus.WANT,
      rating: null,
      shortReview: '',
    };
  }
}