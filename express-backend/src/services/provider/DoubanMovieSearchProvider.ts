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

// 豆瓣影视搜索 Provider，与 Java 端 DoubanMovieSearchProvider 完全对齐
export class DoubanMovieSearchProvider implements MovieSearchProvider {
  private static readonly PAGE_SIZE = 20;

  id(): string {
    return 'douban';
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

    if (!config.douban.cookie) {
      result.enabled = false;
      result.message = '豆瓣未启用';
      return result;
    }

    if (!query) throw new Error('query must not be blank');
    const normalizedPage = Math.max(page, 1);
    const start = (normalizedPage - 1) * DoubanMovieSearchProvider.PAGE_SIZE;

    const response = await axios.get(`${config.douban.baseUrl}/movie/search`, {
      params: { q: query, start, count: DoubanMovieSearchProvider.PAGE_SIZE },
      headers: { Cookie: config.douban.cookie },
    });

    const subjects = response.data?.subjects ?? [];
    const doubanIds = subjects.map((s: any) => s.id).filter(Boolean);
    const existingMap = doubanIds.length > 0
      ? await this.findExistingByDoubanId(doubanIds)
      : new Map<string, any>();

    const results: ExternalMovieSearchResult[] = subjects.map((subject: any) => {
      const existing = subject.id ? existingMap.get(subject.id) ?? null : null;
      const mapped: ExternalMovieSearchResult = {
        provider: this.id(),
        tmdbId: null,
        imdbId: null,
        doubanId: subject.id ?? null,
        traktId: null,
        title: subject.title || subject.original_title || '',
        posterUrl: subject.images?.large ?? null,
        releaseDate: subject.year ?? null,
        overview: subject.summary ?? null,
        alreadyAdded: existing !== null,
        existingRecordId: existing?.id != null ? Number(existing.id) : null,
        suggestedRecord: null,
      };
      mapped.suggestedRecord = this.buildSuggestion(mapped);
      return mapped;
    });

    const total = response.data?.total ?? results.length;
    const totalPages = total === 0 ? 0 : Math.ceil(total / DoubanMovieSearchProvider.PAGE_SIZE);

    result.page = normalizedPage;
    result.totalPages = totalPages;
    result.totalResults = total;
    result.results = results;
    return result;
  }

  private async findExistingByDoubanId(ids: string[]): Promise<Map<string, any>> {
    const movies = await prisma.movie.findMany({ where: { doubanId: { in: ids } } });
    return new Map(movies.map((m) => [m.doubanId!, m]));
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