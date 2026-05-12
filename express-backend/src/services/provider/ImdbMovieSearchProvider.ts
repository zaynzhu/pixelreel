import { ExternalMovieSearchResult, ProviderSearchResult } from '../../dto/external-search';
import { MovieSearchProvider } from '../provider/MovieSearchProvider';

// IMDb 直连 Provider — 占位，与 Java 端 ImdbMovieSearchProvider 对齐
export class ImdbMovieSearchProvider implements MovieSearchProvider {
  id(): string {
    return 'imdb';
  }

  async search(query: string, page: number): Promise<ProviderSearchResult<ExternalMovieSearchResult>> {
    return {
      provider: this.id(),
      enabled: false,
      message: 'IMDb API 需要 AWS Data Exchange 签名调用，当前未实现，建议使用 OMDb（provider=omdb）',
      page,
      totalPages: 0,
      totalResults: 0,
      results: [],
    };
  }
}