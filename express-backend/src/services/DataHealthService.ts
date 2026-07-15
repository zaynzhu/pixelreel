import type { Prisma } from '@prisma/client';
import { getDb } from '../config/db';

export const DATA_HEALTH_CATEGORIES = ['movie', 'tv_show', 'game'] as const;
export const DATA_HEALTH_ISSUES = [
  'missing_poster',
  'missing_overview',
  'missing_date',
  'missing_external_id',
] as const;

export type DataHealthCategory = typeof DATA_HEALTH_CATEGORIES[number];
export type DataHealthIssue = typeof DATA_HEALTH_ISSUES[number];

interface DataHealthCategorySummary {
  total: number;
  missingPoster: number;
  missingOverview: number | null;
  missingDate: number | null;
  missingExternalId: number;
}

interface DataHealthIssueItem {
  id: number;
  category: DataHealthCategory;
  title: string;
  posterUrl: string | null;
  updatedAt: Date;
}

const missingString = (field: string) => ({
  OR: [{ [field]: null }, { [field]: '' }],
});

export function isDataHealthIssueApplicable(
  category: DataHealthCategory,
  issue: DataHealthIssue,
): boolean {
  return category !== 'game' || (issue !== 'missing_overview' && issue !== 'missing_date');
}

export function buildDataHealthWhere(
  category: 'movie',
  issue: DataHealthIssue,
): Prisma.MovieWhereInput | null;
export function buildDataHealthWhere(
  category: 'tv_show',
  issue: DataHealthIssue,
): Prisma.TvShowWhereInput | null;
export function buildDataHealthWhere(
  category: 'game',
  issue: DataHealthIssue,
): Prisma.GameWhereInput | null;
export function buildDataHealthWhere(
  category: DataHealthCategory,
  issue: DataHealthIssue,
): Prisma.MovieWhereInput | Prisma.TvShowWhereInput | Prisma.GameWhereInput | null;
export function buildDataHealthWhere(
  category: DataHealthCategory,
  issue: DataHealthIssue,
): Prisma.MovieWhereInput | Prisma.TvShowWhereInput | Prisma.GameWhereInput | null {
  if (!isDataHealthIssueApplicable(category, issue)) return null;

  if (issue === 'missing_poster') return missingString('posterUrl');
  if (issue === 'missing_overview') return missingString('overview');
  if (issue === 'missing_date') {
    return missingString(category === 'movie' ? 'releaseDate' : 'firstAirDate');
  }
  if (category === 'game') {
    return {
      rawgId: null,
      steamAppId: null,
      ...missingString('xboxId'),
      AND: [missingString('psnId')],
    };
  }
  return {
    AND: [
      missingString('doubanId'),
      { tmdbId: null },
      missingString('imdbId'),
      missingString('traktId'),
    ],
  };
}

async function getMovieSummary(): Promise<DataHealthCategorySummary> {
  const db = getDb();
  const [total, missingPoster, missingOverview, missingDate, missingExternalId] = await Promise.all([
    db.movie.count(),
    db.movie.count({ where: buildDataHealthWhere('movie', 'missing_poster')! }),
    db.movie.count({ where: buildDataHealthWhere('movie', 'missing_overview')! }),
    db.movie.count({ where: buildDataHealthWhere('movie', 'missing_date')! }),
    db.movie.count({ where: buildDataHealthWhere('movie', 'missing_external_id')! }),
  ]);
  return { total, missingPoster, missingOverview, missingDate, missingExternalId };
}

async function getTvShowSummary(): Promise<DataHealthCategorySummary> {
  const db = getDb();
  const [total, missingPoster, missingOverview, missingDate, missingExternalId] = await Promise.all([
    db.tvShow.count(),
    db.tvShow.count({ where: buildDataHealthWhere('tv_show', 'missing_poster')! }),
    db.tvShow.count({ where: buildDataHealthWhere('tv_show', 'missing_overview')! }),
    db.tvShow.count({ where: buildDataHealthWhere('tv_show', 'missing_date')! }),
    db.tvShow.count({ where: buildDataHealthWhere('tv_show', 'missing_external_id')! }),
  ]);
  return { total, missingPoster, missingOverview, missingDate, missingExternalId };
}

async function getGameSummary(): Promise<DataHealthCategorySummary> {
  const db = getDb();
  const [total, missingPoster, missingExternalId] = await Promise.all([
    db.game.count(),
    db.game.count({ where: buildDataHealthWhere('game', 'missing_poster')! }),
    db.game.count({ where: buildDataHealthWhere('game', 'missing_external_id')! }),
  ]);
  return {
    total,
    missingPoster,
    missingOverview: null,
    missingDate: null,
    missingExternalId,
  };
}

export async function getDataHealthSummary() {
  const [movie, tvShow, game] = await Promise.all([
    getMovieSummary(),
    getTvShowSummary(),
    getGameSummary(),
  ]);
  return {
    total: movie.total + tvShow.total + game.total,
    categories: { movie, tv_show: tvShow, game },
  };
}

export async function listDataHealthIssues(
  category: DataHealthCategory,
  issue: DataHealthIssue,
  limit: number,
  cursor: bigint | null,
) {
  const db = getDb();
  if (category === 'movie') {
    const issueWhere = buildDataHealthWhere('movie', issue)!;
    const where: Prisma.MovieWhereInput = cursor == null
      ? issueWhere
      : { AND: [issueWhere, { id: { gt: cursor } }] };
    const [total, records] = await Promise.all([
      db.movie.count({ where: issueWhere }),
      db.movie.findMany({
        where,
        orderBy: { id: 'asc' },
        take: limit + 1,
        select: { id: true, title: true, posterUrl: true, updatedAt: true },
      }),
    ]);
    return createIssueResponse(records, total, category, limit);
  }
  if (category === 'tv_show') {
    const issueWhere = buildDataHealthWhere('tv_show', issue)!;
    const where: Prisma.TvShowWhereInput = cursor == null
      ? issueWhere
      : { AND: [issueWhere, { id: { gt: cursor } }] };
    const [total, records] = await Promise.all([
      db.tvShow.count({ where: issueWhere }),
      db.tvShow.findMany({
        where,
        orderBy: { id: 'asc' },
        take: limit + 1,
        select: { id: true, title: true, posterUrl: true, updatedAt: true },
      }),
    ]);
    return createIssueResponse(records, total, category, limit);
  }
  const issueWhere = buildDataHealthWhere('game', issue)!;
  const where: Prisma.GameWhereInput = cursor == null
    ? issueWhere
    : { AND: [issueWhere, { id: { gt: cursor } }] };
  const [total, records] = await Promise.all([
    db.game.count({ where: issueWhere }),
    db.game.findMany({
      where,
      orderBy: { id: 'asc' },
      take: limit + 1,
      select: { id: true, title: true, posterUrl: true, updatedAt: true },
    }),
  ]);
  return createIssueResponse(records, total, category, limit);
}

function createIssueResponse(
  records: Array<{ id: bigint; title: string; posterUrl: string | null; updatedAt: Date }>,
  total: number,
  category: DataHealthCategory,
  limit: number,
) {
  const hasMore = records.length > limit;
  const pageRecords = hasMore ? records.slice(0, limit) : records;
  const items: DataHealthIssueItem[] = pageRecords.map(record => ({
    id: Number(record.id),
    category,
    title: record.title,
    posterUrl: record.posterUrl,
    updatedAt: record.updatedAt,
  }));
  return {
    items,
    total,
    nextCursor: hasMore ? pageRecords[pageRecords.length - 1].id.toString() : null,
  };
}
