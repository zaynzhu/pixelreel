import { createHash } from 'node:crypto';
import { getDb } from '../config/db';
import { DataHealthCategory } from './DataHealthService';
import { gamePlaytimeMinutes } from './GameStatusService';

export const DUPLICATE_REASONS = [
  'douban_id',
  'tmdb_id',
  'imdb_id',
  'trakt_id',
  'rawg_id',
  'steam_id',
  'xbox_id',
  'psn_id',
  'title_year',
  'title_platform',
  'title_cross_platform',
] as const;

export type DuplicateReason = typeof DUPLICATE_REASONS[number];
export type DuplicateReviewFilter = 'unreviewed' | 'reviewed';

export interface DuplicateCandidate {
  id: bigint;
  category: DataHealthCategory;
  title: string;
  posterUrl: string | null;
  year: string | null;
  platform: string | null;
  platforms?: string[];
  status?: string | null;
  rating?: number | null;
  hasReview?: boolean;
  playtimeMinutes?: number | null;
  protected: boolean;
  identityValues: Partial<Record<DuplicateReason, string | null>>;
}

interface DuplicateKey {
  key: string;
  reason: DuplicateReason;
}

export function normalizeDuplicateTitle(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase()
    .replace(/[\p{P}\p{S}\s]+/gu, '')
    .trim();
}

function extractYear(value: string | null | undefined): string | null {
  const match = value?.match(/(?:^|\D)((?:19|20)\d{2})(?:\D|$)/);
  return match?.[1] ?? null;
}

function titleVariants(title: string): string[] {
  return Array.from(new Set(
    [title, ...title.split(/[\/／]/)]
      .map(normalizeDuplicateTitle)
      .filter(value => value.length >= 2),
  ));
}

function candidateKeys(candidate: DuplicateCandidate): DuplicateKey[] {
  const keys: DuplicateKey[] = [];
  for (const reason of DUPLICATE_REASONS) {
    if (reason === 'title_year' || reason === 'title_platform' || reason === 'title_cross_platform') continue;
    const value = candidate.identityValues[reason]?.trim();
    if (value) keys.push({ key: `${candidate.category}:${reason}:${value}`, reason });
  }

  const variants = titleVariants(candidate.title);
  if (candidate.category === 'game') {
    for (const platform of candidatePlatforms(candidate)) {
      for (const title of variants) {
        keys.push({ key: `${candidate.category}:title_platform:${title}:${platform}`, reason: 'title_platform' });
      }
    }
  } else if (candidate.year) {
    for (const title of variants) {
      keys.push({ key: `${candidate.category}:title_year:${title}:${candidate.year}`, reason: 'title_year' });
    }
  }
  return keys;
}

function candidatePlatforms(candidate: DuplicateCandidate): string[] {
  return Array.from(new Set(
    (candidate.platforms ?? [candidate.platform])
      .map(value => value?.trim().toLocaleLowerCase())
      .filter((value): value is string => Boolean(value)),
  ));
}

function appendCrossPlatformTitleKeys(
  candidates: DuplicateCandidate[],
  keysByCandidate: DuplicateKey[][],
) {
  const indicesByTitle = new Map<string, number[]>();
  candidates.forEach((candidate, index) => {
    if (candidate.category !== 'game' || candidatePlatforms(candidate).length === 0) return;
    for (const title of titleVariants(candidate.title)) {
      const indices = indicesByTitle.get(title) ?? [];
      indices.push(index);
      indicesByTitle.set(title, indices);
    }
  });

  for (const [title, indices] of indicesByTitle) {
    if (indices.length < 2) continue;
    const platforms = new Set(indices.flatMap(index => candidatePlatforms(candidates[index])));
    if (platforms.size < 2) continue;
    const key = `game:title_cross_platform:${title}`;
    for (const index of indices) {
      keysByCandidate[index].push({ key, reason: 'title_cross_platform' });
    }
  }
}

class DisjointSet {
  private readonly parent: number[];

  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, index) => index);
  }

  find(index: number): number {
    if (this.parent[index] !== index) this.parent[index] = this.find(this.parent[index]);
    return this.parent[index];
  }

  union(left: number, right: number) {
    const leftRoot = this.find(left);
    const rightRoot = this.find(right);
    if (leftRoot !== rightRoot) this.parent[rightRoot] = leftRoot;
  }
}

export function findDuplicateGroups(candidates: DuplicateCandidate[]) {
  const sets = new DisjointSet(candidates.length);
  const firstByKey = new Map<string, number>();
  const keysByCandidate = candidates.map(candidateKeys);
  appendCrossPlatformTitleKeys(candidates, keysByCandidate);

  keysByCandidate.forEach((keys, index) => {
    for (const { key } of keys) {
      const first = firstByKey.get(key);
      if (first == null) firstByKey.set(key, index);
      else sets.union(first, index);
    }
  });

  const indicesByRoot = new Map<number, number[]>();
  candidates.forEach((_, index) => {
    const root = sets.find(index);
    const indices = indicesByRoot.get(root) ?? [];
    indices.push(index);
    indicesByRoot.set(root, indices);
  });

  return Array.from(indicesByRoot.values())
    .filter(indices => indices.length > 1)
    .map(indices => {
      const keyCounts = new Map<string, { reason: DuplicateReason; count: number }>();
      for (const index of indices) {
        for (const item of keysByCandidate[index]) {
          const current = keyCounts.get(item.key);
          keyCounts.set(item.key, { reason: item.reason, count: (current?.count ?? 0) + 1 });
        }
      }
      const sharedKeys = Array.from(keyCounts.entries())
        .filter(([, item]) => item.count > 1)
        .sort(([left], [right]) => left.localeCompare(right));
      const reasons = Array.from(new Set(sharedKeys.map(([, item]) => item.reason)))
        .sort((left, right) => DUPLICATE_REASONS.indexOf(left) - DUPLICATE_REASONS.indexOf(right));
      const records = indices.map(index => candidates[index])
        .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
        .map(candidate => ({
          id: Number(candidate.id),
          category: candidate.category,
          title: candidate.title,
          posterUrl: candidate.posterUrl,
          year: candidate.year,
          platform: candidate.platform,
          status: candidate.status ?? null,
          rating: candidate.rating ?? null,
          hasReview: candidate.hasReview ?? false,
          playtimeMinutes: candidate.playtimeMinutes ?? null,
          protected: candidate.protected,
          sourceIds: Object.fromEntries(
            Object.entries(candidate.identityValues).filter(([, value]) => Boolean(value)),
          ),
        }));
      const fingerprint = createHash('sha256')
        .update(`${records.map(record => record.id).join(',')}|${sharedKeys.map(([key]) => key).join('|')}`)
        .digest('hex');
      return {
        key: `${candidates[indices[0]].category}:${fingerprint}`,
        reasons,
        records,
      };
    })
    .sort((left, right) => (
      right.records.length - left.records.length || left.records[0].id - right.records[0].id
    ));
}

async function loadDuplicateCandidates(category: DataHealthCategory): Promise<DuplicateCandidate[]> {
  const db = getDb();
  if (category === 'movie') {
    const records = await db.movie.findMany({
      select: {
        id: true,
        title: true,
        posterUrl: true,
        releaseDate: true,
        tmdbReleaseDate: true,
        doubanId: true,
        tmdbId: true,
        imdbId: true,
        traktId: true,
        status: true,
        rating: true,
        shortReview: true,
      },
    });
    return records.map(record => ({
      id: record.id,
      category,
      title: record.title,
      posterUrl: record.posterUrl,
      year: extractYear(record.releaseDate ?? record.tmdbReleaseDate),
      platform: null,
      status: record.status,
      rating: record.rating,
      hasReview: Boolean(record.shortReview?.trim()),
      playtimeMinutes: null,
      protected: Boolean(record.doubanId),
      identityValues: {
        douban_id: record.doubanId,
        tmdb_id: record.tmdbId?.toString() ?? null,
        imdb_id: record.imdbId,
        trakt_id: record.traktId,
      },
    }));
  }
  if (category === 'tv_show') {
    const records = await db.tvShow.findMany({
      select: {
        id: true,
        title: true,
        posterUrl: true,
        firstAirDate: true,
        tmdbReleaseDate: true,
        doubanId: true,
        tmdbId: true,
        imdbId: true,
        traktId: true,
        status: true,
        rating: true,
        shortReview: true,
      },
    });
    return records.map(record => ({
      id: record.id,
      category,
      title: record.title,
      posterUrl: record.posterUrl,
      year: extractYear(record.firstAirDate ?? record.tmdbReleaseDate),
      platform: null,
      status: record.status,
      rating: record.rating,
      hasReview: Boolean(record.shortReview?.trim()),
      playtimeMinutes: null,
      protected: Boolean(record.doubanId),
      identityValues: {
        douban_id: record.doubanId,
        tmdb_id: record.tmdbId?.toString() ?? null,
        imdb_id: record.imdbId,
        trakt_id: record.traktId,
      },
    }));
  }
  const records = await db.game.findMany({
    select: {
      id: true,
      title: true,
      posterUrl: true,
      platform: true,
      rawgId: true,
      steamAppId: true,
      xboxId: true,
      psnId: true,
      status: true,
      rating: true,
      shortReview: true,
      playtimeMinutes: true,
      platformEntries: {
        select: { platform: true, playtimeMinutes: true },
        orderBy: { platform: 'asc' },
      },
    },
  });
  return records.map(record => {
    const platforms = Array.from(new Set(record.platformEntries.map(entry => entry.platform)));
    return {
      id: record.id,
      category,
      title: record.title,
      posterUrl: record.posterUrl,
      year: null,
      platform: platforms.length > 0 ? platforms.join(' / ') : record.platform,
      platforms: platforms.length > 0 ? platforms : undefined,
      status: record.status,
      rating: record.rating,
      hasReview: Boolean(record.shortReview?.trim()),
      playtimeMinutes: gamePlaytimeMinutes(record),
      protected: false,
      identityValues: {
        rawg_id: record.rawgId?.toString() ?? null,
        steam_id: record.steamAppId?.toString() ?? null,
        xbox_id: record.xboxId,
        psn_id: record.psnId,
      },
    };
  });
}

export async function findDuplicateGroupByKey(category: DataHealthCategory, groupKey: string) {
  return findDuplicateGroups(await loadDuplicateCandidates(category))
    .find(group => group.key === groupKey) ?? null;
}

export async function listDuplicateGroups(
  category: DataHealthCategory,
  limit: number,
  cursor: number,
  review: DuplicateReviewFilter = 'unreviewed',
) {
  const groups = findDuplicateGroups(await loadDuplicateCandidates(category));
  const decisions = await getDb().duplicateReview.findMany({
    where: { category, decision: 'DISTINCT' },
    select: { id: true, groupKey: true },
  });
  const reviewByKey = new Map(decisions.map(item => [item.groupKey, item.id]));
  const reviewedGroups = groups.filter(group => reviewByKey.has(group.key));
  const unreviewedGroups = groups.filter(group => !reviewByKey.has(group.key));
  const selectedGroups = review === 'reviewed' ? reviewedGroups : unreviewedGroups;
  const page = selectedGroups.slice(cursor, cursor + limit).map(group => ({
    ...group,
    reviewId: reviewByKey.get(group.key) != null ? Number(reviewByKey.get(group.key)) : null,
  }));
  return {
    groups: page,
    totalGroups: selectedGroups.length,
    totalRecords: selectedGroups.reduce((sum, group) => sum + group.records.length, 0),
    unreviewedGroups: unreviewedGroups.length,
    reviewedGroups: reviewedGroups.length,
    nextCursor: cursor + limit < selectedGroups.length ? String(cursor + limit) : null,
  };
}

export async function reviewDuplicateGroup(category: DataHealthCategory, groupKey: string) {
  const groups = findDuplicateGroups(await loadDuplicateCandidates(category));
  const group = groups.find(item => item.key === groupKey);
  if (!group) throw Object.assign(new Error('候选组已变化，请刷新后重试'), { status: 409 });

  const review = await getDb().duplicateReview.upsert({
    where: { groupKey },
    create: {
      groupKey,
      category,
      decision: 'DISTINCT',
      recordIds: group.records.map(record => record.id),
    },
    update: {
      category,
      decision: 'DISTINCT',
      recordIds: group.records.map(record => record.id),
    },
  });
  return { reviewId: Number(review.id), groupKey: review.groupKey, decision: review.decision };
}

export async function restoreDuplicateGroupReview(reviewId: bigint) {
  const review = await getDb().duplicateReview.findUnique({ where: { id: reviewId } });
  if (!review) throw Object.assign(new Error('裁决记录不存在'), { status: 404 });
  await getDb().duplicateReview.delete({ where: { id: reviewId } });
}
