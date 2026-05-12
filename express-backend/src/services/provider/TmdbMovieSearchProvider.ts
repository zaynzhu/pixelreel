import axios from 'axios';
import { config } from '../../config';
import { prisma } from '../../config/db';
import { MovieSearchProvider } from '../provider/MovieSearchProvider';
import {
  ExternalMovieSearchResult,
  ProviderSearchResult,
  MovieRecordSuggestion,
} from '../../dto/external-search';
import { RecordStatus } from '../../enums/RecordStatus';

// TMDB 影视搜索 Provider，与 Java 端 TmdbMovieSearchService 完全对齐
export class TmdbMovieSearchProvider implements MovieSearchProvider {
  id(): string {
    return 'tmdb';
  }

  async search(query: string, page: number): Promise<ProviderSearchResult<ExternalMovieSearchResult>> {
    const result: ProviderSearchResult<ExternalMovieSearchResult> = {
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

    const response = await axios.get(`${config.tmdb.baseUrl}/search/movie`, {
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

    const results: ExternalMovieSearchResult[] = items.map((item: any) => {
      const existing = item.id ? existingMap.get(item.id) ?? null : null;
      const mapped: ExternalMovieSearchResult = {
        provider: this.id(),
        tmdbId: item.id ?? null,
        imdbId: null,
        doubanId: null,
        traktId: null,
        title: item.title ?? '',
        posterUrl: item.poster_path ? config.tmdb.imageBaseUrl + item.poster_path : null,
        releaseDate: item.release_date ?? null,
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
    const movies = await prisma.movie.findMany({ where: { tmdbId: { in: ids } } });
    return new Map(movies.map((m) => [m.tmdbId!, m]));
  }

  private buildSuggestion(mapped: ExternalMovieSearchResult): MovieRecordSuggestion {
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