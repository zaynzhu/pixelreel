import { getDb } from '../config/db';
import { DataHealthCategory } from './DataHealthService';

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
] as const;

export type DuplicateReason = typeof DUPLICATE_REASONS[number];

export interface DuplicateCandidate {
  id: bigint;
  category: DataHealthCategory;
  title: string;
  posterUrl: string | null;
  year: string | null;
  platform: string | null;
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
    if (reason === 'title_year' || reason === 'title_platform') continue;
    const value = candidate.identityValues[reason]?.trim();
    if (value) keys.push({ key: `${candidate.category}:${reason}:${value}`, reason });
  }

  const variants = titleVariants(candidate.title);
  if (candidate.category === 'game') {
    const platform = candidate.platform?.trim().toLocaleLowerCase();
    if (platform) {
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
      const reasons = Array.from(new Set(
        Array.from(keyCounts.values())
          .filter(item => item.count > 1)
          .map(item => item.reason),
      )).sort((left, right) => DUPLICATE_REASONS.indexOf(left) - DUPLICATE_REASONS.indexOf(right));
      const records = indices.map(index => candidates[index])
        .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
        .map(candidate => ({
          id: Number(candidate.id),
          category: candidate.category,
          title: candidate.title,
          posterUrl: candidate.posterUrl,
          year: candidate.year,
          platform: candidate.platform,
          protected: candidate.protected,
          sourceIds: Object.fromEntries(
            Object.entries(candidate.identityValues).filter(([, value]) => Boolean(value)),
          ),
        }));
      return {
        key: `${candidates[indices[0]].category}:${records.map(record => record.id).join('-')}`,
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
      },
    });
    return records.map(record => ({
      id: record.id,
      category,
      title: record.title,
      posterUrl: record.posterUrl,
      year: extractYear(record.releaseDate ?? record.tmdbReleaseDate),
      platform: null,
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
      },
    });
    return records.map(record => ({
      id: record.id,
      category,
      title: record.title,
      posterUrl: record.posterUrl,
      year: extractYear(record.firstAirDate ?? record.tmdbReleaseDate),
      platform: null,
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
    },
  });
  return records.map(record => ({
    id: record.id,
    category,
    title: record.title,
    posterUrl: record.posterUrl,
    year: null,
    platform: record.platform,
    protected: false,
    identityValues: {
      rawg_id: record.rawgId?.toString() ?? null,
      steam_id: record.steamAppId?.toString() ?? null,
      xbox_id: record.xboxId,
      psn_id: record.psnId,
    },
  }));
}

export async function listDuplicateGroups(
  category: DataHealthCategory,
  limit: number,
  cursor: number,
) {
  const groups = findDuplicateGroups(await loadDuplicateCandidates(category));
  const page = groups.slice(cursor, cursor + limit);
  return {
    groups: page,
    totalGroups: groups.length,
    totalRecords: groups.reduce((sum, group) => sum + group.records.length, 0),
    nextCursor: cursor + limit < groups.length ? String(cursor + limit) : null,
  };
}
