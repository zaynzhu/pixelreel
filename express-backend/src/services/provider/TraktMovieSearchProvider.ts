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

// Trakt 影视搜索 Provider，与 Java 端 TraktMovieSearchProvider 完全对齐
export class TraktMovieSearchProvider implements MovieSearchProvider {
  private static readonly PAGE_SIZE = 20;

  id(): string {
    return 'trakt';
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

    if (!config.trakt.clientId) {
      result.enabled = false;
      result.message = 'Trakt 未启用';
      return result;
    }

    if (!query) throw new Error('query must not be blank');
    const normalizedPage = Math.max(page, 1);

    const response = await axios.get(`${config.trakt.baseUrl}/search/movie`, {
      params: { query, page: normalizedPage, limit: TraktMovieSearchProvider.PAGE_SIZE },
      headers: {
        'trakt-api-key': config.trakt.clientId,
        'trakt-api-version': '2',
      },
    });

    const items = response.data ?? [];

    // 批量查本地数据库
    const traktIds: string[] = [];
    const tmdbIds: number[] = [];
    const imdbIds: string[] = [];
    for (const item of items) {
      if (item.movie?.ids?.trakt) traktIds.push(String(item.movie.ids.trakt));
      if (item.movie?.ids?.tmdb) tmdbIds.push(item.movie.ids.tmdb);
      if (item.movie?.ids?.imdb) imdbIds.push(item.movie.ids.imdb);
    }

    const byTraktId = traktIds.length > 0
      ? await this.findByField('traktId', traktIds) : new Map<string, any>();
    const byTmdbId = tmdbIds.length > 0
      ? await this.findByFieldBigInt('tmdbId', tmdbIds) : new Map<number, any>();
    const byImdbId = imdbIds.length > 0
      ? await this.findByField('imdbId', imdbIds) : new Map<string, any>();

    const results: ExternalMovieSearchResult[] = [];
    for (const item of items) {
      if (!item.movie || !item.movie.ids) continue;
      const ids = item.movie.ids;
      const mapped: ExternalMovieSearchResult = {
        provider: this.id(),
        title: item.movie.title ?? '',
        releaseDate: item.movie.year != null ? String(item.movie.year) : null,
        traktId: ids.trakt != null ? String(ids.trakt) : null,
        imdbId: ids.imdb ?? null,
        tmdbId: ids.tmdb ?? null,
        doubanId: null,
        posterUrl: null,
        overview: null,
        alreadyAdded: false,
        existingRecordId: null,
        suggestedRecord: null,
      };

      // 查本地是否已添加
      let existing: any = null;
      if (mapped.traktId) existing = byTraktId.get(mapped.traktId);
      if (!existing && mapped.tmdbId) existing = byTmdbId.get(mapped.tmdbId);
      if (!existing && mapped.imdbId) existing = byImdbId.get(mapped.imdbId);
      mapped.alreadyAdded = existing !== null && existing !== undefined;
      mapped.existingRecordId = existing?.id != null ? Number(existing.id) : null;
      mapped.suggestedRecord = this.buildSuggestion(mapped);
      results.push(mapped);
    }

    result.page = normalizedPage;
    result.totalPages = 0;
    result.totalResults = results.length;
    result.results = results;
    return result;
  }

  private async findByField(field: string, values: string[]): Promise<Map<string, any>> {
    const where: any = { [field]: { in: values } };
    const movies = await prisma.movie.findMany({ where });
    return new Map(movies.map((m: any) => [m[field], m]));
  }

  private async findByFieldBigInt(field: string, values: number[]): Promise<Map<any, any>> {
    const where: any = { [field]: { in: values } };
    const movies = await prisma.movie.findMany({ where });
    return new Map(movies.map((m: any) => [m[field], m]));
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