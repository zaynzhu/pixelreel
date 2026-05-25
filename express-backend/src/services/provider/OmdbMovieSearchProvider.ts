import axios from 'axios';
import { config } from '../../config';
import { getDb } from '../../config/db';
import { MovieSearchProvider } from '../provider/MovieSearchProvider';
import {
  ExternalMovieSearchResult,
  ProviderSearchResult,
  MovieRecordSuggestion,
} from '../../dto/external-search';
import { RecordStatus } from '../../enums/RecordStatus';

function containsChinese(str: string): boolean {
  return /[一-鿿]/.test(str);
}

async function tryOmdbWithEnglishTitles(query: string, page: number): Promise<any | null> {
  try {
    const tmdbRes = await axios.get(`${config.tmdb.baseUrl}/search/movie`, {
      params: { query, page: 1 },
      headers: { Authorization: `Bearer ${config.tmdb.apiKey}` },
    });
    const results = tmdbRes.data?.results ?? [];
    // 按 popularity 降序排列，优先选最热门的结果
    const sorted = [...results].sort((a: any, b: any) => (b.vote_count ?? 0) - (a.vote_count ?? 0));
    // 收集所有英文候选标题（去重）
    const candidates: string[] = [];
    for (const item of sorted) {
      if (item.title && /[a-zA-Z]/.test(item.title) && !containsChinese(item.title)) {
        candidates.push(item.title);
      }
      if (item.original_title && /[a-zA-Z]/.test(item.original_title) && !containsChinese(item.original_title)
        && !candidates.includes(item.original_title)) {
        candidates.push(item.original_title);
      }
    }
    // 逐个尝试 OMDb 搜索，返回第一个有结果的
    for (const title of candidates) {
      const omdbRes = await axios.get(config.omdb.baseUrl, {
        params: { apikey: config.omdb.apiKey, s: title, page, type: 'movie' },
      });
      if (omdbRes.data?.Response === 'True') {
        return omdbRes.data;
      }
    }
    return null;
  } catch {
    return null;
  }
}

// OMDb 影视搜索 Provider，与 Java 端 OmdbMovieSearchProvider 完全对齐
export class OmdbMovieSearchProvider implements MovieSearchProvider {
  id(): string {
    return 'omdb';
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

    if (!config.omdb.apiKey) {
      result.enabled = false;
      result.message = 'OMDb 未启用';
      return result;
    }

    if (!query) throw new Error('query must not be blank');
    const normalizedPage = Math.max(page, 1);

    let response = await axios.get(config.omdb.baseUrl, {
      params: { apikey: config.omdb.apiKey, s: query, page: normalizedPage, type: 'movie' },
    });

    // 中文关键词或 OMDb 返回 Too many results 时，通过 TMDB 获取英文标题逐个重试
    if (containsChinese(query) || response.data?.Error === 'Too many results.') {
      const fallback = await tryOmdbWithEnglishTitles(query, normalizedPage);
      if (fallback) {
        response = { ...response, data: fallback };
      }
    }

    if (response.data?.Response === 'False') {
      result.message = response.data.Error ?? 'OMDb 搜索无结果';
      return result;
    }

    const items = response.data?.Search ?? [];
    const imdbIds = items.map((i: any) => i.imdbID).filter(Boolean);
    const existingMap = imdbIds.length > 0
      ? await this.findExistingByImdbId(imdbIds)
      : new Map<string, any>();

    const results: ExternalMovieSearchResult[] = items.map((item: any) => {
      const existing = item.imdbID ? existingMap.get(item.imdbID) ?? null : null;
      const poster = !item.Poster || item.Poster === 'N/A' ? null : item.Poster;
      const mapped: ExternalMovieSearchResult = {
        provider: this.id(),
        tmdbId: null,
        imdbId: item.imdbID ?? null,
        doubanId: null,
        traktId: null,
        title: item.Title ?? '',
        posterUrl: poster,
        releaseDate: item.Year ?? null,
        overview: null,
        alreadyAdded: existing !== null,
        existingRecordId: existing?.id != null ? Number(existing.id) : null,
        suggestedRecord: null,
      };
      mapped.suggestedRecord = this.buildSuggestion(mapped);
      return mapped;
    });

    const total = parseInt(response.data?.totalResults ?? '0', 10) || 0;
    const totalPages = total === 0 ? 0 : Math.ceil(total / 10);

    result.page = normalizedPage;
    result.totalPages = totalPages;
    result.totalResults = total;
    result.results = results;
    return result;
  }

  private async findExistingByImdbId(ids: string[]): Promise<Map<string, any>> {
    const movies = await getDb().movie.findMany({ where: { imdbId: { in: ids } } });
    return new Map(movies.map((m) => [m.imdbId!, m]));
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