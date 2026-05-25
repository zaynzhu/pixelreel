import axios from 'axios';
import { config } from '../../config';
import { getDb } from '../../config/db';
import { TvShowSearchProvider } from '../provider/TvShowSearchProvider';
import {
  ExternalTvShowSearchResult,
  ProviderSearchResult,
  TvShowRecordSuggestion,
} from '../../dto/external-search';
import { RecordStatus } from '../../enums/RecordStatus';

// 豆瓣电视剧搜索 Provider — 使用公开 suggest 接口
export class DoubanTvShowSearchProvider implements TvShowSearchProvider {
  id(): string {
    return 'douban';
  }

  async search(query: string, page: number): Promise<ProviderSearchResult<ExternalTvShowSearchResult>> {
    const result: ProviderSearchResult<ExternalTvShowSearchResult> = {
      provider: this.id(),
      enabled: true,
      message: '',
      page,
      totalPages: 1,
      totalResults: 0,
      results: [],
    };

    if (!query) throw new Error('query must not be blank');

    const response = await axios.get(`${config.douban.baseUrl}/j/subject_suggest`, {
      params: { q: query },
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
    });

    const subjects = response.data ?? [];
    const doubanIds = subjects.map((s: any) => s.id).filter(Boolean);
    const existingMap = doubanIds.length > 0
      ? await this.findExistingByDoubanId(doubanIds)
      : new Map<string, any>();

    const results: ExternalTvShowSearchResult[] = subjects.map((subject: any) => {
      const existing = subject.id ? existingMap.get(subject.id) ?? null : null;
      const mapped: ExternalTvShowSearchResult = {
        provider: this.id(),
        tmdbId: null,
        imdbId: null,
        doubanId: subject.id ?? null,
        traktId: null,
        title: subject.title || subject.sub_title || '',
        posterUrl: subject.img || null,
        firstAirDate: subject.year ?? null,
        overview: null,
        alreadyAdded: existing !== null,
        existingRecordId: existing?.id != null ? Number(existing.id) : null,
        suggestedRecord: null,
      };
      mapped.suggestedRecord = this.buildSuggestion(mapped);
      return mapped;
    });

    result.totalResults = results.length;
    result.results = results;
    return result;
  }

  private async findExistingByDoubanId(ids: string[]): Promise<Map<string, any>> {
    const shows = await getDb().tvShow.findMany({ where: { doubanId: { in: ids } } });
    return new Map(shows.map((s) => [s.doubanId!, s]));
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
