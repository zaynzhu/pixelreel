import { prisma } from '../config/db';
import { LibraryRecordResponse, LibraryRecordUpdateRequest } from '../dto/library';
import { RecordStatus, parseRecordStatus } from '../enums/RecordStatus';

// Library 混合列表服务，与 Java 端 LibraryService 完全对齐

export async function listRecords(): Promise<LibraryRecordResponse[]> {
  const movies = await prisma.movie.findMany();
  const games = await prisma.game.findMany();
  const tvShows = await prisma.tvShow.findMany();

  const records: LibraryRecordResponse[] = [
    ...movies.map(toMovieRecord),
    ...games.map(toGameRecord),
    ...tvShows.map(toTvShowRecord),
  ];

  // 按 createdAt 降序（豆瓣标记日期），再按 updatedAt 降序
  records.sort((a, b) => {
    const ca = new Date(b.createdAt).getTime() || 0;
    const cb = new Date(a.createdAt).getTime() || 0;
    if (ca !== cb) return ca - cb;
    const ua = new Date(b.updatedAt).getTime() || 0;
    const ub = new Date(a.updatedAt).getTime() || 0;
    return ua - ub;
  });

  return records;
}

export async function updateRecord(
  category: string,
  id: number,
  request: LibraryRecordUpdateRequest,
): Promise<LibraryRecordResponse> {
  const normalized = category.trim().toLowerCase();

  if (normalized === 'movie') {
    return updateMovie(id, request);
  } else if (normalized === 'game') {
    return updateGame(id, request);
  } else if (normalized === 'tv_show' || normalized === 'tvshow') {
    return updateTvShow(id, request);
  } else {
    throw new Error(`Unknown category: ${category}`);
  }
}

async function updateMovie(id: number, request: LibraryRecordUpdateRequest): Promise<LibraryRecordResponse> {
  const movie = await prisma.movie.findUnique({ where: { id } });
  if (!movie) throw Object.assign(new Error('Movie record not found'), { status: 404 });

  await prisma.movie.update({
    where: { id },
    data: {
      status: request.status,
      rating: request.rating ?? null,
      shortReview: request.shortReview?.trim() || null,
    },
  });

  const updated = await prisma.movie.findUnique({ where: { id } });
  return toMovieRecord(updated!);
}

async function updateGame(id: number, request: LibraryRecordUpdateRequest): Promise<LibraryRecordResponse> {
  const game = await prisma.game.findUnique({ where: { id } });
  if (!game) throw Object.assign(new Error('Game record not found'), { status: 404 });

  await prisma.game.update({
    where: { id },
    data: {
      status: request.status,
      rating: request.rating ?? null,
      shortReview: request.shortReview?.trim() || null,
    },
  });

  const updated = await prisma.game.findUnique({ where: { id } });
  return toGameRecord(updated!);
}

async function updateTvShow(id: number, request: LibraryRecordUpdateRequest): Promise<LibraryRecordResponse> {
  const show = await prisma.tvShow.findUnique({ where: { id } });
  if (!show) throw Object.assign(new Error('TV Show record not found'), { status: 404 });

  await prisma.tvShow.update({
    where: { id },
    data: {
      status: request.status,
      rating: request.rating ?? null,
      shortReview: request.shortReview?.trim() || null,
    },
  });

  const updated = await prisma.tvShow.findUnique({ where: { id } });
  return toTvShowRecord(updated!);
}

function toMovieRecord(movie: any): LibraryRecordResponse {
  const sourceKey = detectMovieSource(movie);
  return {
    id: Number(movie.id),
    category: 'movie',
    title: movie.title,
    posterUrl: movie.posterUrl,
    sourceKey,
    sourceLabel: movieSourceLabel(sourceKey),
    platformLabel: null,
    status: movie.status || RecordStatus.UNSET,
    rating: movie.rating,
    shortReview: movie.shortReview,
    playtimeMinutes: null,
    achievementTotal: null,
    achievementUnlocked: null,
    createdAt: movie.createdAt,
    updatedAt: movie.updatedAt,
    importedAt: null,
    doubanTitle: movie.doubanTitle ?? null,
    doubanAltTitle: movie.doubanAltTitle ?? null,
    doubanIntro: movie.doubanIntro ?? null,
    doubanRating: movie.doubanRating ?? null,
    doubanDate: movie.doubanDate ?? null,
    doubanComment: movie.doubanComment ?? null,
    doubanLink: movie.doubanLink ?? null,
    doubanAvgRating: movie.doubanAvgRating != null ? Number(movie.doubanAvgRating) : null,
    tmdbTitle: movie.tmdbTitle ?? null,
    tmdbPosterUrl: movie.tmdbPosterUrl ?? null,
    tmdbReleaseDate: movie.tmdbReleaseDate ?? null,
    tmdbOverview: movie.tmdbOverview ?? null,
    tmdbVoteAverage: movie.tmdbVoteAverage != null ? Number(movie.tmdbVoteAverage) : null,
    tmdbPopularity: movie.tmdbPopularity != null ? Number(movie.tmdbPopularity) : null,
    tmdbGenreIds: movie.tmdbGenreIds ?? null,
    imdbRating: movie.imdbRating != null ? Number(movie.imdbRating) : null,
  };
}

function toGameRecord(game: any): LibraryRecordResponse {
  const sourceKey = detectGameSource(game);
  return {
    id: Number(game.id),
    category: 'game',
    title: game.title,
    posterUrl: game.posterUrl,
    sourceKey,
    sourceLabel: gameSourceLabel(sourceKey),
    platformLabel: game.platform
      ? (game.platform.trim().toUpperCase() === 'PSN' ? 'PSN'
        : game.platform.trim().toUpperCase() === 'XBOX' ? 'Xbox'
        : game.platform.trim().toUpperCase() === 'STEAM' ? 'Steam'
        : game.platform)
      : gameSourceLabel(sourceKey),
    status: game.status || RecordStatus.UNSET,
    rating: game.rating,
    shortReview: game.shortReview,
    playtimeMinutes: game.playtimeMinutes,
    achievementTotal: game.achievementTotal,
    achievementUnlocked: game.achievementUnlocked,
    createdAt: game.createdAt,
    updatedAt: game.updatedAt,
    importedAt: game.importedAt,
    doubanTitle: null, doubanAltTitle: null, doubanIntro: null,
    doubanRating: null, doubanDate: null, doubanComment: null,
    doubanLink: null, doubanAvgRating: null,
    tmdbTitle: null, tmdbPosterUrl: null, tmdbReleaseDate: null,
    tmdbOverview: null, tmdbVoteAverage: null, tmdbPopularity: null,
    tmdbGenreIds: null,
    imdbRating: null,
  };
}

function toTvShowRecord(show: any): LibraryRecordResponse {
  const sourceKey = detectTvShowSource(show);
  return {
    id: Number(show.id),
    category: 'tv_show',
    title: show.title,
    posterUrl: show.posterUrl,
    sourceKey,
    sourceLabel: tvShowSourceLabel(sourceKey),
    platformLabel: null,
    status: show.status || RecordStatus.UNSET,
    rating: show.rating,
    shortReview: show.shortReview,
    playtimeMinutes: null,
    achievementTotal: null,
    achievementUnlocked: null,
    createdAt: show.createdAt,
    updatedAt: show.updatedAt,
    importedAt: null,
    doubanTitle: show.doubanTitle ?? null,
    doubanAltTitle: show.doubanAltTitle ?? null,
    doubanIntro: show.doubanIntro ?? null,
    doubanRating: show.doubanRating ?? null,
    doubanDate: show.doubanDate ?? null,
    doubanComment: show.doubanComment ?? null,
    doubanLink: show.doubanLink ?? null,
    doubanAvgRating: show.doubanAvgRating != null ? Number(show.doubanAvgRating) : null,
    tmdbTitle: show.tmdbTitle ?? null,
    tmdbPosterUrl: show.tmdbPosterUrl ?? null,
    tmdbReleaseDate: show.tmdbReleaseDate ?? null,
    tmdbOverview: show.tmdbOverview ?? null,
    tmdbVoteAverage: show.tmdbVoteAverage != null ? Number(show.tmdbVoteAverage) : null,
    tmdbPopularity: show.tmdbPopularity != null ? Number(show.tmdbPopularity) : null,
    tmdbGenreIds: show.tmdbGenreIds ?? null,
    imdbRating: show.imdbRating != null ? Number(show.imdbRating) : null,
  };
}

function detectMovieSource(movie: any): string {
  if (movie.doubanId) return 'douban';
  if (movie.tmdbId) return 'tmdb';
  if (movie.imdbId) return 'imdb';
  if (movie.traktId) return 'trakt';
  return 'manual';
}

function detectGameSource(game: any): string {
  if (game.psnId) return 'psn';
  if (game.xboxId) return 'xbox';
  if (game.steamAppId) return 'steam';
  if (game.rawgId) return 'rawg';
  return 'manual';
}

function detectTvShowSource(show: any): string {
  if (show.doubanId) return 'douban';
  if (show.tmdbId) return 'tmdb';
  if (show.imdbId) return 'imdb';
  if (show.traktId) return 'trakt';
  return 'manual';
}

function movieSourceLabel(sourceKey: string): string {
  const map: Record<string, string> = { douban: '豆瓣', tmdb: 'TMDB', imdb: 'IMDb', trakt: 'Trakt' };
  return map[sourceKey] || 'Manual';
}

function gameSourceLabel(sourceKey: string): string {
  const map: Record<string, string> = { psn: 'PSN', xbox: 'Xbox', steam: 'Steam', rawg: 'RAWG' };
  return map[sourceKey] || 'Manual';
}

function tvShowSourceLabel(sourceKey: string): string {
  const map: Record<string, string> = { douban: '豆瓣', tmdb: 'TMDB', imdb: 'IMDb', trakt: 'Trakt' };
  return map[sourceKey] || 'Manual';
}