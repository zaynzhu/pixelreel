import { prisma } from '../config/db';
import { ProfileSummaryResponse, CountItem, RecentRecordItem } from '../dto/profile';
import { RecordStatus } from '../enums/RecordStatus';

// 个人主页统计聚合服务，与 Java 端 ProfileSummaryService 完全对齐

const RECENT_LIMIT = 8;

export async function getProfileSummary(): Promise<ProfileSummaryResponse> {
  const movies = await prisma.movie.findMany({ orderBy: { createdAt: 'desc' } });
  const games = await prisma.game.findMany({ orderBy: { createdAt: 'desc' } });
  const tvShows = await prisma.tvShow.findMany({ orderBy: { createdAt: 'desc' } });

  return {
    overview: buildOverview(movies, games, tvShows),
    ratings: buildRatings(movies, games, tvShows),
    movieStatuses: buildMovieStatusCounts(movies),
    gameStatuses: buildGameStatusCounts(games),
    tvShowStatuses: buildTvShowStatusCounts(tvShows),
    movieSources: buildMovieSourceCounts(movies),
    gamePlatforms: buildGamePlatformCounts(games),
    tvShowSources: buildTvShowSourceCounts(tvShows),
    recentItems: buildRecentItems(movies, games, tvShows),
  };
}

function buildOverview(movies: any[], games: any[], tvShows: any[]): ProfileSummaryResponse['overview'] {
  const totalMovies = movies.length;
  const totalGames = games.length;
  const totalTvShows = tvShows.length;
  const completedMovies = movies.filter((m) => m.status === RecordStatus.DONE).length;
  const completedGames = games.filter((g) => g.status === RecordStatus.DONE).length;
  const completedTvShows = tvShows.filter((s) => s.status === RecordStatus.DONE).length;
  const ratedRecords =
    movies.filter((m) => m.rating != null).length +
    games.filter((g) => g.rating != null).length +
    tvShows.filter((s) => s.rating != null).length;
  const reviewedRecords =
    movies.filter((m) => m.shortReview?.trim()).length +
    games.filter((g) => g.shortReview?.trim()).length +
    tvShows.filter((s) => s.shortReview?.trim()).length;
  const importedGames = games.filter((g) => g.importedAt != null).length;

  return {
    totalRecords: totalMovies + totalGames + totalTvShows,
    totalMovies,
    totalGames,
    totalTvShows,
    completedMovies,
    completedGames,
    completedTvShows,
    ratedRecords,
    reviewedRecords,
    importedGames,
  };
}

function buildRatings(movies: any[], games: any[], tvShows: any[]): ProfileSummaryResponse['ratings'] {
  const allRatings: number[] = [
    ...movies.filter((m) => m.rating != null).map((m) => m.rating),
    ...games.filter((g) => g.rating != null).map((g) => g.rating),
    ...tvShows.filter((s) => s.rating != null).map((s) => s.rating),
  ];

  const movieRatings = movies.filter((m) => m.rating != null).map((m) => m.rating);
  const gameRatings = games.filter((g) => g.rating != null).map((g) => g.rating);
  const tvShowRatings = tvShows.filter((s) => s.rating != null).map((s) => s.rating);

  const overallAverage = allRatings.length > 0 ? roundOneDecimal(avg(allRatings)) : null;
  const movieAverage = movieRatings.length > 0 ? roundOneDecimal(avg(movieRatings)) : null;
  const gameAverage = gameRatings.length > 0 ? roundOneDecimal(avg(gameRatings)) : null;
  const tvShowAverage = tvShowRatings.length > 0 ? roundOneDecimal(avg(tvShowRatings)) : null;

  return { overallAverage, movieAverage, gameAverage, tvShowAverage };
}

function buildMovieStatusCounts(movies: any[]): CountItem[] {
  return Object.values(RecordStatus).map((status) => ({
    key: status,
    label: statusLabel(status),
    count: movies.filter((m) => safeStatus(m.status) === status).length,
  }));
}

function buildGameStatusCounts(games: any[]): CountItem[] {
  return Object.values(RecordStatus).map((status) => ({
    key: status,
    label: statusLabel(status),
    count: games.filter((g) => safeStatus(g.status) === status).length,
  }));
}

function buildTvShowStatusCounts(tvShows: any[]): CountItem[] {
  return Object.values(RecordStatus).map((status) => ({
    key: status,
    label: statusLabel(status),
    count: tvShows.filter((s) => safeStatus(s.status) === status).length,
  }));
}

function buildMovieSourceCounts(movies: any[]): CountItem[] {
  return [
    countItem('TMDB', 'TMDB', movies.filter((m) => inferMovieSource(m) === 'TMDB').length),
    countItem('DOUBAN', '豆瓣', movies.filter((m) => inferMovieSource(m) === 'DOUBAN').length),
    countItem('IMDB', 'IMDb', movies.filter((m) => inferMovieSource(m) === 'IMDB').length),
    countItem('TRAKT', 'Trakt', movies.filter((m) => inferMovieSource(m) === 'TRAKT').length),
    countItem('MANUAL', '手动', movies.filter((m) => inferMovieSource(m) === 'MANUAL').length),
  ];
}

function buildGamePlatformCounts(games: any[]): CountItem[] {
  const orderedPlatforms = ['RAWG', 'STEAM', 'XBOX', 'PSN', 'MANUAL'];
  return orderedPlatforms.map((platform) => ({
    key: platform,
    label: platformLabel(platform),
    count: games.filter((g) => inferGamePlatform(g) === platform).length,
  }));
}

function buildTvShowSourceCounts(tvShows: any[]): CountItem[] {
  return [
    countItem('TMDB', 'TMDB', tvShows.filter((s) => inferTvShowSource(s) === 'TMDB').length),
    countItem('DOUBAN', '豆瓣', tvShows.filter((s) => inferTvShowSource(s) === 'DOUBAN').length),
    countItem('IMDB', 'IMDb', tvShows.filter((s) => inferTvShowSource(s) === 'IMDB').length),
    countItem('TRAKT', 'Trakt', tvShows.filter((s) => inferTvShowSource(s) === 'TRAKT').length),
    countItem('MANUAL', '手动', tvShows.filter((s) => inferTvShowSource(s) === 'MANUAL').length),
  ];
}

function buildRecentItems(movies: any[], games: any[], tvShows: any[]): RecentRecordItem[] {
  const snapshots: any[] = [
    ...movies.map((m) => ({
      category: 'movie',
      id: Number(m.id),
      title: m.title,
      subtitle: sourceLabel(inferMovieSource(m)),
      posterUrl: m.posterUrl,
      status: safeStatus(m.status),
      rating: m.rating,
      createdAt: m.createdAt,
    })),
    ...games.map((g) => ({
      category: 'game',
      id: Number(g.id),
      title: g.title,
      subtitle: platformLabel(inferGamePlatform(g)),
      posterUrl: g.posterUrl,
      status: safeStatus(g.status),
      rating: g.rating,
      createdAt: g.createdAt,
    })),
    ...tvShows.map((s) => ({
      category: 'tv_show',
      id: Number(s.id),
      title: s.title,
      subtitle: tvShowSourceLabel(inferTvShowSource(s)),
      posterUrl: s.posterUrl,
      status: safeStatus(s.status),
      rating: s.rating,
      createdAt: s.createdAt,
    })),
  ];

  return snapshots
    .sort((a, b) => {
      const ta = b.createdAt?.getTime() ?? 0;
      const tb = a.createdAt?.getTime() ?? 0;
      return ta - tb;
    })
    .slice(0, RECENT_LIMIT)
    .map((s) => ({
      category: s.category,
      id: s.id,
      title: s.title,
      subtitle: s.subtitle,
      posterUrl: s.posterUrl,
      status: s.status,
      rating: s.rating,
      createdAt: s.createdAt,
    }));
}

function inferMovieSource(movie: any): string {
  if (movie.tmdbId) return 'TMDB';
  if (movie.doubanId) return 'DOUBAN';
  if (movie.imdbId) return 'IMDB';
  if (movie.traktId) return 'TRAKT';
  return 'MANUAL';
}

function inferGamePlatform(game: any): string {
  if (game.platform?.trim()) return game.platform.trim().toUpperCase();
  if (game.steamAppId) return 'STEAM';
  if (game.xboxId) return 'XBOX';
  if (game.psnId) return 'PSN';
  if (game.rawgId) return 'RAWG';
  return 'MANUAL';
}

function inferTvShowSource(show: any): string {
  if (show.tmdbId) return 'TMDB';
  if (show.doubanId) return 'DOUBAN';
  if (show.imdbId) return 'IMDB';
  if (show.traktId) return 'TRAKT';
  return 'MANUAL';
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    [RecordStatus.UNSET]: '未分类',
    [RecordStatus.WANT]: '想记录',
    [RecordStatus.IN_PROGRESS]: '进行中',
    [RecordStatus.DONE]: '已完成',
    [RecordStatus.DROPPED]: '已放弃',
  };
  return map[status] || status;
}

function sourceLabel(source: string): string {
  const map: Record<string, string> = { TMDB: 'TMDB', DOUBAN: '豆瓣', IMDB: 'IMDb', TRAKT: 'Trakt' };
  return map[source] || '手动录入';
}

function tvShowSourceLabel(source: string): string {
  const map: Record<string, string> = { TMDB: 'TMDB', DOUBAN: '豆瓣', IMDB: 'IMDb', TRAKT: 'Trakt' };
  return map[source] || '手动录入';
}

function platformLabel(platform: string): string {
  const map: Record<string, string> = { RAWG: 'RAWG', STEAM: 'Steam', XBOX: 'Xbox', PSN: 'PSN' };
  return map[platform] || '手动录入';
}

function safeStatus(status: string | null): string {
  return status || RecordStatus.UNSET;
}

function roundOneDecimal(value: number): number | null {
  if (isNaN(value)) return null;
  return Math.round(value * 10) / 10;
}

function avg(nums: number[]): number {
  if (nums.length === 0) return NaN;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

function countItem(key: string, label: string, count: number): CountItem {
  return { key, label, count };
}