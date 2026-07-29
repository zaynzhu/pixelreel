import { getDb } from '../config/db';
import {
  ActionQueueItem,
  MonthlyMemoryItem,
  ProfileSummaryResponse,
  CountItem,
  RecentRecordItem,
  YearlyTimelineItem,
} from '../dto/profile';
import { RecordStatus } from '../enums/RecordStatus';
import { effectiveGameStatus, gamePlaytimeMinutes } from './GameStatusService';
import {
  detectGameSource,
  detectMovieSource,
  detectTvShowSource,
  gameSourceLabel,
  movieSourceLabel,
  tvShowSourceLabel,
} from './LibraryService';
import { resolveCompletionDate } from './RecordDateService';
import { normalizePlatformAchievementProgress } from './import/PlatformGameSyncService';

// 个人主页统计聚合服务，与 Java 端 ProfileSummaryService 完全对齐

const RECENT_LIMIT = 15;
const ACTION_QUEUE_LIMIT = 4;
const MONTHLY_MEMORY_LIMIT = 5;

export async function getProfileSummary(): Promise<ProfileSummaryResponse> {
  const db = getDb();
  const [movies, games, tvShows] = await Promise.all([
    db.movie.findMany({
      select: {
        id: true,
        title: true,
        posterUrl: true,
        status: true,
        rating: true,
        shortReview: true,
        createdAt: true,
        updatedAt: true,
        tmdbId: true,
        doubanId: true,
        doubanDate: true,
        imdbId: true,
        traktId: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    db.game.findMany({
      select: {
        id: true,
        title: true,
        posterUrl: true,
        status: true,
        rating: true,
        shortReview: true,
        createdAt: true,
        updatedAt: true,
        platform: true,
        playtimeMinutes: true,
        importedAt: true,
        steamAppId: true,
        xboxId: true,
        psnId: true,
        rawgId: true,
        platformEntries: {
          select: {
            platform: true,
            playtimeMinutes: true,
            achievementTotal: true,
            achievementUnlocked: true,
            lastSyncedAt: true,
          },
        },
        achievementTotal: true,
        achievementUnlocked: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
    db.tvShow.findMany({
      select: {
        id: true,
        title: true,
        posterUrl: true,
        status: true,
        rating: true,
        shortReview: true,
        createdAt: true,
        updatedAt: true,
        tmdbId: true,
        doubanId: true,
        doubanDate: true,
        imdbId: true,
        traktId: true,
      },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return {
    overview: buildOverview(movies, games, tvShows),
    ratings: buildRatings(movies, games, tvShows),
    movieStatuses: buildMovieStatusCounts(movies),
    gameStatuses: buildGameStatusCounts(games),
    tvShowStatuses: buildTvShowStatusCounts(tvShows),
    movieSources: buildMovieSourceCounts(movies),
    gamePlatforms: buildGamePlatformCounts(games),
    gameTelemetry: buildGameTelemetry(games),
    tvShowSources: buildTvShowSourceCounts(tvShows),
    nextUp: buildNextUpQueue(movies, games, tvShows),
    monthlyMemories: buildMonthlyMemories(movies, games, tvShows),
    recentItems: buildRecentItems(movies, games, tvShows),
    yearlyTimeline: buildYearlyTimeline(movies, games, tvShows),
  };
}

export function buildMonthlyMemories(
  movies: any[],
  games: any[],
  tvShows: any[],
  now = new Date(),
): MonthlyMemoryItem[] {
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();
  const candidates = [
    ...movies.map(record => ({ category: 'movie' as const, record })),
    ...tvShows.map(record => ({ category: 'tv_show' as const, record })),
    ...games.map(record => ({ category: 'game' as const, record })),
  ]
    .filter(({ record }) => safeStatus(record.status) === RecordStatus.DONE)
    .map(candidate => ({
      ...candidate,
      completedAt: resolveCompletionDate(candidate.record),
    }))
    .filter(candidate => (
      candidate.completedAt != null
      && candidate.completedAt.getUTCFullYear() < currentYear
      && candidate.completedAt.getUTCMonth() === currentMonth
    ))
    .sort((left, right) => (
      right.completedAt!.getUTCFullYear() - left.completedAt!.getUTCFullYear()
      || (right.record.rating ?? 0) - (left.record.rating ?? 0)
      || right.completedAt!.getTime() - left.completedAt!.getTime()
      || left.category.localeCompare(right.category)
      || Number(right.record.id) - Number(left.record.id)
    ));

  const seenYears = new Set<number>();
  const memories: MonthlyMemoryItem[] = [];
  for (const candidate of candidates) {
    const completedAt = candidate.completedAt!;
    const completionYear = completedAt.getUTCFullYear();
    if (seenYears.has(completionYear)) continue;
    seenYears.add(completionYear);
    memories.push({
      ...toRecentRecordItem(candidate.category, candidate.record),
      completedAt: completedAt.toISOString(),
      yearsAgo: currentYear - completionYear,
    });
    if (memories.length === MONTHLY_MEMORY_LIMIT) break;
  }
  return memories;
}

export function buildNextUpQueue(movies: any[], games: any[], tvShows: any[]) {
  const resume = games
    .filter(game => effectiveGameStatus(game) === RecordStatus.IN_PROGRESS)
    .map(game => toActionQueueItem('game', game))
    .sort((left, right) => (
      (right.playtimeMinutes ?? 0) - (left.playtimeMinutes ?? 0)
      || new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
      || right.id - left.id
    ))
    .slice(0, ACTION_QUEUE_LIMIT);

  const backlog = [
    ...movies
      .filter(movie => safeStatus(movie.status) === RecordStatus.WANT)
      .map(movie => toActionQueueItem('movie', movie)),
    ...tvShows
      .filter(show => safeStatus(show.status) === RecordStatus.WANT)
      .map(show => toActionQueueItem('tv_show', show)),
    ...games
      .filter(game => effectiveGameStatus(game) === RecordStatus.WANT)
      .map(game => toActionQueueItem('game', game)),
  ]
    .sort((left, right) => (
      new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
      || left.category.localeCompare(right.category)
      || left.id - right.id
    ))
    .slice(0, ACTION_QUEUE_LIMIT);

  const reflect = [
    ...movies.map(record => ({ category: 'movie' as const, record })),
    ...tvShows.map(record => ({ category: 'tv_show' as const, record })),
    ...games.map(record => ({ category: 'game' as const, record })),
  ]
    .filter(({ record }) => (
      safeStatus(record.status) === RecordStatus.DONE
      && record.rating != null
      && record.rating >= 4
      && !record.shortReview?.trim()
    ))
    .map(({ category, record }) => toActionQueueItem(category, record))
    .sort((left, right) => (
      (right.rating ?? 0) - (left.rating ?? 0)
      || new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
      || left.category.localeCompare(right.category)
      || right.id - left.id
    ))
    .slice(0, ACTION_QUEUE_LIMIT);

  return { resume, backlog, reflect };
}

function toActionQueueItem(
  category: ActionQueueItem['category'],
  record: any,
): ActionQueueItem {
  return {
    ...toRecentRecordItem(category, record),
    playtimeMinutes: category === 'game' ? gamePlaytimeMinutes(record) : null,
  };
}

function toRecentRecordItem(
  category: RecentRecordItem['category'],
  record: any,
): RecentRecordItem {
  const subtitle = category === 'game'
    ? gameSourceLabel(detectGameSource(record))
    : category === 'movie'
      ? movieSourceLabel(detectMovieSource(record))
      : tvShowSourceLabel(detectTvShowSource(record));
  return {
    category,
    id: Number(record.id),
    title: record.title,
    subtitle,
    posterUrl: record.posterUrl ?? null,
    status: category === 'game' ? effectiveGameStatus(record) : safeStatus(record.status),
    rating: record.rating ?? null,
    createdAt: record.createdAt,
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
  const importedGames = games.filter(isImportedGame).length;

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

export function buildGameTelemetry(games: any[]): ProfileSummaryResponse['gameTelemetry'] {
  let totalPlaytimeMinutes = 0;
  let platformProfiles = 0;
  let achievementUnlocked = 0;
  let achievementTotal = 0;
  let achievementProfiles = 0;
  const platformHealth = new Map<string, {
    platform: string;
    profiles: number;
    playtimeProfiles: number;
    achievementProfiles: number;
    achievementsWithoutTotal: number;
    lastSyncedAt: Date;
  }>();

  for (const game of games) {
    totalPlaytimeMinutes += gamePlaytimeMinutes(game) ?? 0;
    const platformEntries = Array.isArray(game.platformEntries) ? game.platformEntries : [];
    platformProfiles += platformEntries.length;
    const progressEntries = platformEntries.length > 0 ? platformEntries : [game];

    for (const entry of progressEntries) {
      const progress = normalizePlatformAchievementProgress(
        entry.achievementTotal,
        entry.achievementUnlocked,
      );
      achievementUnlocked += progress.achievementUnlocked ?? 0;
      achievementTotal += progress.achievementTotal ?? 0;
      if ((progress.achievementUnlocked ?? 0) > 0 || progress.achievementTotal != null) {
        achievementProfiles++;
      }
    }

    for (const entry of platformEntries) {
      const platform = String(entry.platform ?? '').toUpperCase();
      const lastSyncedAt = entry.lastSyncedAt instanceof Date
        ? entry.lastSyncedAt
        : new Date(entry.lastSyncedAt);
      if (!platform || Number.isNaN(lastSyncedAt.getTime())) continue;

      const progress = normalizePlatformAchievementProgress(
        entry.achievementTotal,
        entry.achievementUnlocked,
      );
      const current = platformHealth.get(platform) ?? {
        platform,
        profiles: 0,
        playtimeProfiles: 0,
        achievementProfiles: 0,
        achievementsWithoutTotal: 0,
        lastSyncedAt,
      };

      current.profiles++;
      if (entry.playtimeMinutes != null) current.playtimeProfiles++;
      if ((progress.achievementUnlocked ?? 0) > 0 || progress.achievementTotal != null) {
        current.achievementProfiles++;
      }
      if ((progress.achievementUnlocked ?? 0) > 0 && progress.achievementTotal == null) {
        current.achievementsWithoutTotal++;
      }
      if (lastSyncedAt > current.lastSyncedAt) current.lastSyncedAt = lastSyncedAt;
      platformHealth.set(platform, current);
    }
  }

  return {
    totalPlaytimeMinutes,
    platformProfiles,
    achievementUnlocked,
    achievementTotal,
    achievementProfiles,
    platforms: Array.from(platformHealth.values())
      .sort((left, right) => right.profiles - left.profiles)
      .map(item => ({
        ...item,
        lastSyncedAt: item.lastSyncedAt.toISOString(),
      })),
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
    count: games.filter((g) => effectiveGameStatus(g) === status).length,
  }));
}

function buildTvShowStatusCounts(tvShows: any[]): CountItem[] {
  return Object.values(RecordStatus).map((status) => ({
    key: status,
    label: statusLabel(status),
    count: tvShows.filter((s) => safeStatus(s.status) === status).length,
  }));
}

export function buildMovieSourceCounts(movies: any[]): CountItem[] {
  return [
    countItem('TMDB', 'TMDB', movies.filter((m) => detectMovieSource(m) === 'tmdb').length),
    countItem('DOUBAN', '豆瓣', movies.filter((m) => detectMovieSource(m) === 'douban').length),
    countItem('IMDB', 'IMDb', movies.filter((m) => detectMovieSource(m) === 'imdb').length),
    countItem('TRAKT', 'Trakt', movies.filter((m) => detectMovieSource(m) === 'trakt').length),
    countItem('MANUAL', '手动', movies.filter((m) => detectMovieSource(m) === 'manual').length),
  ];
}

function buildGamePlatformCounts(games: any[]): CountItem[] {
  const orderedPlatforms = ['RAWG', 'STEAM', 'XBOX', 'PSN', 'MANUAL'];
  return orderedPlatforms.map((platform) => ({
    key: platform,
    label: gameSourceLabel(platform.toLowerCase()),
    count: games.filter((game) => {
      const entryPlatforms = new Set(
        (game.platformEntries ?? []).map((entry: any) => entry.platform?.toUpperCase()),
      );
      if (platform === 'MANUAL') {
        return entryPlatforms.size === 0 && detectGameSource(game) === 'manual';
      }
      if (platform === 'RAWG') return game.rawgId != null && entryPlatforms.size === 0;
      return entryPlatforms.has(platform)
        || (entryPlatforms.size === 0 && detectGameSource(game) === platform.toLowerCase());
    }).length,
  }));
}

export function buildTvShowSourceCounts(tvShows: any[]): CountItem[] {
  return [
    countItem('TMDB', 'TMDB', tvShows.filter((s) => detectTvShowSource(s) === 'tmdb').length),
    countItem('DOUBAN', '豆瓣', tvShows.filter((s) => detectTvShowSource(s) === 'douban').length),
    countItem('IMDB', 'IMDb', tvShows.filter((s) => detectTvShowSource(s) === 'imdb').length),
    countItem('TRAKT', 'Trakt', tvShows.filter((s) => detectTvShowSource(s) === 'trakt').length),
    countItem('MANUAL', '手动', tvShows.filter((s) => detectTvShowSource(s) === 'manual').length),
  ];
}

function buildRecentItems(movies: any[], games: any[], tvShows: any[]): RecentRecordItem[] {
  const snapshots: any[] = [
    ...movies.map((m) => ({
      category: 'movie',
      id: Number(m.id),
      title: m.title,
      subtitle: movieSourceLabel(detectMovieSource(m)),
      posterUrl: m.posterUrl,
      status: safeStatus(m.status),
      rating: m.rating,
      createdAt: m.createdAt,
    })),
    ...games.map((g) => ({
      category: 'game',
      id: Number(g.id),
      title: g.title,
      subtitle: gameSourceLabel(detectGameSource(g)),
      posterUrl: g.posterUrl,
      status: effectiveGameStatus(g),
      rating: g.rating,
      createdAt: g.createdAt,
    })),
    ...tvShows.map((s) => ({
      category: 'tv_show',
      id: Number(s.id),
      title: s.title,
      subtitle: tvShowSourceLabel(detectTvShowSource(s)),
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

function safeStatus(status: string | null): string {
  return status || RecordStatus.UNSET;
}

export function isImportedGame(game: {
  importedAt?: Date | null;
  steamAppId?: bigint | null;
  xboxId?: string | null;
  psnId?: string | null;
  platformEntries?: unknown[];
}): boolean {
  return game.importedAt != null
    || game.steamAppId != null
    || game.xboxId != null
    || game.psnId != null
    || (game.platformEntries?.length ?? 0) > 0;
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

function buildYearlyTimeline(movies: any[], games: any[], tvShows: any[]): YearlyTimelineItem[] {
  const counts: Record<string, number> = {};

  for (const m of movies) {
    if (m.createdAt) {
      const year = new Date(m.createdAt).getFullYear().toString();
      counts[year] = (counts[year] || 0) + 1;
    }
  }
  for (const g of games) {
    if (g.createdAt) {
      const year = new Date(g.createdAt).getFullYear().toString();
      counts[year] = (counts[year] || 0) + 1;
    }
  }
  for (const s of tvShows) {
    if (s.createdAt) {
      const year = new Date(s.createdAt).getFullYear().toString();
      counts[year] = (counts[year] || 0) + 1;
    }
  }

  return Object.entries(counts)
    .map(([year, count]) => ({ year, count }))
    .sort((a, b) => a.year.localeCompare(b.year));
}
