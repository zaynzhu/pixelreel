import {
  ExternalMovieSearchResult,
  ExternalGameSearchResult,
  ExternalTvShowSearchResult,
  ExternalSearchResponse,
  ProviderSearchResult,
} from '../dto/external-search';
import { MovieSearchProvider } from './provider/MovieSearchProvider';
import { GameSearchProvider } from './provider/GameSearchProvider';
import { TvShowSearchProvider } from './provider/TvShowSearchProvider';

import { TmdbMovieSearchProvider } from './provider/TmdbMovieSearchProvider';
import { OmdbMovieSearchProvider } from './provider/OmdbMovieSearchProvider';
import { TraktMovieSearchProvider } from './provider/TraktMovieSearchProvider';
import { DoubanMovieSearchProvider } from './provider/DoubanMovieSearchProvider';
import { ImdbMovieSearchProvider } from './provider/ImdbMovieSearchProvider';

import { RawgGameSearchProvider } from './provider/RawgGameSearchProvider';
import { SteamGameSearchProvider } from './provider/SteamGameSearchProvider';
import { PsnGameSearchProvider } from './provider/PsnGameSearchProvider';
import { XboxGameSearchProvider } from './provider/XboxGameSearchProvider';
import { SwitchGameSearchProvider } from './provider/SwitchGameSearchProvider';

import { TmdbTvShowSearchProvider } from './provider/TmdbTvShowSearchProvider';

// 外部搜索聚合服务

const movieProviders: MovieSearchProvider[] = [
  new TmdbMovieSearchProvider(),
  new OmdbMovieSearchProvider(),
  new TraktMovieSearchProvider(),
  new DoubanMovieSearchProvider(),
  new ImdbMovieSearchProvider(),
];

const gameProviders: GameSearchProvider[] = [
  new RawgGameSearchProvider(),
  new SteamGameSearchProvider(),
  new PsnGameSearchProvider(),
  new XboxGameSearchProvider(),
  new SwitchGameSearchProvider(),
];

// 电视剧搜索 Provider
const tvShowProviders: TvShowSearchProvider[] = [
  new TmdbTvShowSearchProvider(),
];

function parseProviders(providers?: string[]): Set<string> {
  if (!providers || providers.length === 0) return new Set();
  const set = new Set<string>();
  for (const value of providers) {
    if (!value) continue;
    for (const part of value.split(',')) {
      const trimmed = part.trim().toLowerCase();
      if (trimmed) set.add(trimmed);
    }
  }
  return set;
}

function selectProviders<T extends { id(): string }>(all: T[], requested: Set<string>): T[] {
  if (requested.size === 0) return all;
  return all.filter((p) => requested.has(p.id().toLowerCase()));
}

async function safeMovieSearch(
  provider: MovieSearchProvider,
  query: string,
  page: number,
): Promise<ProviderSearchResult<ExternalMovieSearchResult>> {
  try {
    return await provider.search(query, page);
  } catch (ex: any) {
    return {
      provider: provider.id(),
      enabled: true,
      message: `搜索失败: ${ex.message ?? ex}`,
      page,
      totalPages: 0,
      totalResults: 0,
      results: [],
    };
  }
}

async function safeGameSearch(
  provider: GameSearchProvider,
  query: string,
  page: number,
): Promise<ProviderSearchResult<ExternalGameSearchResult>> {
  try {
    return await provider.search(query, page);
  } catch (ex: any) {
    return {
      provider: provider.id(),
      enabled: true,
      message: `搜索失败: ${ex.message ?? ex}`,
      page,
      totalPages: 0,
      totalResults: 0,
      results: [],
    };
  }
}

async function safeTvShowSearch(
  provider: TvShowSearchProvider,
  query: string,
  page: number,
): Promise<ProviderSearchResult<ExternalTvShowSearchResult>> {
  try {
    return await provider.search(query, page);
  } catch (ex: any) {
    return {
      provider: provider.id(),
      enabled: true,
      message: `搜索失败: ${ex.message ?? ex}`,
      page,
      totalPages: 0,
      totalResults: 0,
      results: [],
    };
  }
}

export async function searchMovies(
  query: string,
  page: number,
  providers?: string[],
): Promise<ExternalSearchResponse<ExternalMovieSearchResult>> {
  const requested = parseProviders(providers);
  const selected = selectProviders(movieProviders, requested);
  const providerResults = await Promise.all(
    selected.map((p) => safeMovieSearch(p, query, page)),
  );
  return { query, page, providers: providerResults };
}

export async function searchGames(
  query: string,
  page: number,
  providers?: string[],
): Promise<ExternalSearchResponse<ExternalGameSearchResult>> {
  const requested = parseProviders(providers);
  const selected = selectProviders(gameProviders, requested);
  const providerResults = await Promise.all(
    selected.map((p) => safeGameSearch(p, query, page)),
  );
  return { query, page, providers: providerResults };
}

export async function searchTvShows(
  query: string,
  page: number,
  providers?: string[],
): Promise<ExternalSearchResponse<ExternalTvShowSearchResult>> {
  const requested = parseProviders(providers);
  const selected = selectProviders(tvShowProviders, requested);
  const providerResults = await Promise.all(
    selected.map((p) => safeTvShowSearch(p, query, page)),
  );
  return { query, page, providers: providerResults };
}