import { Prisma } from '@prisma/client';
import { getDb } from '../config/db';
import { findDuplicateGroupByKey } from './DuplicateDetectionService';

interface MergeableGame {
  id: bigint;
  status: string;
  rating: number | null;
  shortReview: string | null;
  posterUrl: string | null;
  importReviewState: string;
  importedAt: Date | null;
  rawgId: bigint | null;
  steamAppId: bigint | null;
  xboxId: string | null;
  psnId: string | null;
  platform: string | null;
}

export interface GameMergeValues {
  status: string;
  rating: number | null;
  shortReview: string | null;
  posterUrl: string | null;
  importReviewState: string;
  importedAt: Date | null;
  rawgId: bigint | null;
  steamAppId: bigint | null;
  xboxId: string | null;
  psnId: string | null;
  platform: string | null;
}

export type GameMergeBlocker = 'status' | 'rating' | 'review' | 'rawg';

interface GameMergeInspection {
  meaningfulStatuses: string[];
  ratings: number[];
  reviews: string[];
  rawgIds: string[];
  blockers: GameMergeBlocker[];
}

interface SerializedGameMergeValues {
  status: string;
  rating: number | null;
  shortReview: string | null;
  posterUrl: string | null;
  importReviewState: string;
  importedAt: string | null;
  rawgId: string | null;
  steamAppId: string | null;
  xboxId: string | null;
  psnId: string | null;
  platform: string | null;
}

interface GameSnapshot extends SerializedGameMergeValues {
  id: string;
  title: string;
  playtimeMinutes: number | null;
  achievementTotal: number | null;
  achievementUnlocked: number | null;
  createdAt: string;
  updatedAt: string;
}

interface GameMergeArchive {
  version: 1;
  targetBefore: GameSnapshot;
  targetAfter: SerializedGameMergeValues;
  sources: GameSnapshot[];
  platformEntryOwners: Array<{ entryId: string; gameId: string }>;
}

function conflict(message: string): never {
  throw Object.assign(new Error(message), { status: 409 });
}

function uniqueValues<T>(values: Array<T | null | undefined>): T[] {
  return Array.from(new Set(values.filter((value): value is T => value != null)));
}

export function inspectGameMerge(records: MergeableGame[]): GameMergeInspection {
  const meaningfulStatuses = uniqueValues(
    records.map(record => ['IN_PROGRESS', 'DONE', 'DROPPED'].includes(record.status) ? record.status : null),
  );
  const ratings = uniqueValues(records.map(record => record.rating));
  const reviews = uniqueValues(records.map(record => record.shortReview?.trim() || null));
  const rawgIds = uniqueValues(records.map(record => record.rawgId?.toString() ?? null));
  const blockers: GameMergeBlocker[] = [];
  if (meaningfulStatuses.length > 1) blockers.push('status');
  if (ratings.length > 1) blockers.push('rating');
  if (reviews.length > 1) blockers.push('review');
  if (rawgIds.length > 1) blockers.push('rawg');
  return { meaningfulStatuses, ratings, reviews, rawgIds, blockers };
}

export function resolveGameMergeValues(
  target: MergeableGame,
  records: MergeableGame[],
): GameMergeValues {
  const inspection = inspectGameMerge(records);
  const blocker = inspection.blockers[0];
  if (blocker === 'status') conflict('候选记录的个人状态存在冲突，请先手动统一');
  if (blocker === 'rating') conflict('候选记录的个人评分存在冲突，请先手动统一');
  if (blocker === 'review') conflict('候选记录的个人短评存在冲突，请先手动统一');
  if (blocker === 'rawg') conflict('候选记录绑定了不同的 RAWG 条目，请先纠正匹配');

  const importedDates = records
    .map(record => record.importedAt)
    .filter((value): value is Date => value != null)
    .sort((left, right) => left.getTime() - right.getTime());
  const reviewStates = new Set(records.map(record => record.importReviewState));

  return {
    status: inspection.meaningfulStatuses[0] ?? target.status,
    rating: target.rating ?? inspection.ratings[0] ?? null,
    shortReview: target.shortReview?.trim() || inspection.reviews[0] || null,
    posterUrl: target.posterUrl ?? records.find(record => record.posterUrl)?.posterUrl ?? null,
    importReviewState: reviewStates.has('ACCEPTED')
      ? 'ACCEPTED'
      : reviewStates.has('PENDING') ? 'PENDING' : target.importReviewState,
    importedAt: importedDates[0] ?? null,
    rawgId: target.rawgId ?? (inspection.rawgIds[0] ? BigInt(inspection.rawgIds[0]) : null),
    steamAppId: target.steamAppId ?? records.find(record => record.steamAppId)?.steamAppId ?? null,
    xboxId: target.xboxId ?? records.find(record => record.xboxId)?.xboxId ?? null,
    psnId: target.psnId ?? records.find(record => record.psnId)?.psnId ?? null,
    platform: target.platform ?? records.find(record => record.platform)?.platform ?? null,
  };
}

export async function previewDuplicateGameMerge(groupKey: string, targetId: bigint) {
  const group = await findDuplicateGroupByKey('game', groupKey);
  if (!group) conflict('候选组已变化，请刷新后重试');
  if (!group.records.some(record => BigInt(record.id) === targetId)) {
    conflict('保留记录不属于当前候选组');
  }

  const recordIds = group.records.map(record => BigInt(record.id));
  const records = await getDb().game.findMany({
    where: { id: { in: recordIds } },
    include: {
      platformEntries: {
        select: { id: true },
      },
    },
  });
  if (records.length !== recordIds.length) conflict('候选记录已变化，请刷新后重试');
  const target = records.find(record => record.id === targetId);
  if (!target) conflict('保留记录不存在');
  const sources = records.filter(record => record.id !== targetId);
  const inspection = inspectGameMerge(records);
  const movedProfiles = sources.reduce((sum, source) => sum + source.platformEntries.length, 0);
  const values = inspection.blockers.length === 0 ? resolveGameMergeValues(target, records) : null;

  return {
    targetId: Number(targetId),
    targetTitle: target.title,
    removedIds: sources.map(source => Number(source.id)),
    canMerge: inspection.blockers.length === 0,
    blockers: inspection.blockers,
    platformProfiles: {
      retained: target.platformEntries.length,
      moved: movedProfiles,
      total: target.platformEntries.length + movedProfiles,
    },
    result: values ? {
      status: values.status,
      rating: values.rating,
      hasReview: Boolean(values.shortReview),
    } : null,
  };
}

function serializeDate(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function serializeMergeValues(values: GameMergeValues): SerializedGameMergeValues {
  return {
    status: values.status,
    rating: values.rating,
    shortReview: values.shortReview,
    posterUrl: values.posterUrl,
    importReviewState: values.importReviewState,
    importedAt: serializeDate(values.importedAt),
    rawgId: values.rawgId?.toString() ?? null,
    steamAppId: values.steamAppId?.toString() ?? null,
    xboxId: values.xboxId,
    psnId: values.psnId,
    platform: values.platform,
  };
}

function serializeGameSnapshot(game: any): GameSnapshot {
  return {
    id: game.id.toString(),
    title: game.title,
    posterUrl: game.posterUrl,
    platform: game.platform,
    playtimeMinutes: game.playtimeMinutes,
    achievementTotal: game.achievementTotal,
    achievementUnlocked: game.achievementUnlocked,
    importedAt: serializeDate(game.importedAt),
    importReviewState: game.importReviewState,
    status: game.status,
    rating: game.rating,
    shortReview: game.shortReview,
    createdAt: game.createdAt.toISOString(),
    updatedAt: game.updatedAt.toISOString(),
    rawgId: game.rawgId?.toString() ?? null,
    steamAppId: game.steamAppId?.toString() ?? null,
    xboxId: game.xboxId,
    psnId: game.psnId,
  };
}

export function buildGameMergeArchive(
  target: any,
  sources: any[],
  values: GameMergeValues,
): GameMergeArchive {
  return {
    version: 1,
    targetBefore: serializeGameSnapshot(target),
    targetAfter: serializeMergeValues(values),
    sources: sources.map(serializeGameSnapshot),
    platformEntryOwners: sources.flatMap(source => (
      source.platformEntries.map((entry: any) => ({
        entryId: entry.id.toString(),
        gameId: source.id.toString(),
      }))
    )),
  };
}

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parsePositiveId(value: unknown, label: string): bigint {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    conflict(`合并日志中的 ${label} 无效，无法撤销`);
  }
  return BigInt(value);
}

export function parseGameMergeArchive(metadata: unknown): GameMergeArchive {
  if (!isRecord(metadata) || !isRecord(metadata.archive)) {
    conflict('合并日志缺少恢复快照，无法撤销');
  }
  const archive = metadata.archive;
  if (archive.version !== 1
    || !isRecord(archive.targetBefore)
    || !isRecord(archive.targetAfter)
    || !Array.isArray(archive.sources)
    || !Array.isArray(archive.platformEntryOwners)
    || archive.sources.length === 0) {
    conflict('合并日志恢复快照格式无效');
  }
  parsePositiveId(archive.targetBefore.id, '保留记录 ID');
  for (const source of archive.sources) {
    if (!isRecord(source)) conflict('合并日志中的来源记录无效');
    parsePositiveId(source.id, '来源记录 ID');
  }
  for (const owner of archive.platformEntryOwners) {
    if (!isRecord(owner)) conflict('合并日志中的平台档案归属无效');
    parsePositiveId(owner.entryId, '平台档案 ID');
    parsePositiveId(owner.gameId, '平台档案来源记录 ID');
  }
  return archive as GameMergeArchive;
}

function snapshotDate(value: string | null, label: string): Date | null {
  if (value == null) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) conflict(`合并日志中的 ${label} 无效`);
  return date;
}

function snapshotBigInt(value: string | null): bigint | null {
  return value == null ? null : parsePositiveId(value, '外部 ID');
}

function snapshotMergeValues(snapshot: GameMergeArchive['targetAfter']): GameMergeValues {
  return {
    status: snapshot.status,
    rating: snapshot.rating,
    shortReview: snapshot.shortReview,
    posterUrl: snapshot.posterUrl,
    importReviewState: snapshot.importReviewState,
    importedAt: snapshotDate(snapshot.importedAt, '导入时间'),
    rawgId: snapshotBigInt(snapshot.rawgId),
    steamAppId: snapshotBigInt(snapshot.steamAppId),
    xboxId: snapshot.xboxId,
    psnId: snapshot.psnId,
    platform: snapshot.platform,
  };
}

function gameMatchesMergeValues(game: MergeableGame, values: GameMergeValues): boolean {
  return game.status === values.status
    && game.rating === values.rating
    && game.shortReview === values.shortReview
    && game.posterUrl === values.posterUrl
    && game.importReviewState === values.importReviewState
    && game.importedAt?.getTime() === values.importedAt?.getTime()
    && game.rawgId === values.rawgId
    && game.steamAppId === values.steamAppId
    && game.xboxId === values.xboxId
    && game.psnId === values.psnId
    && game.platform === values.platform;
}

async function updateGameMergeValues(
  transaction: Prisma.TransactionClient,
  id: bigint,
  values: GameMergeValues,
) {
  await transaction.$executeRaw`
    UPDATE game
    SET status = ${values.status},
        rating = ${values.rating},
        short_review = ${values.shortReview},
        poster_url = ${values.posterUrl},
        import_review_state = ${values.importReviewState},
        imported_at = ${values.importedAt},
        rawg_id = ${values.rawgId},
        steam_app_id = ${values.steamAppId},
        xbox_id = ${values.xboxId},
        psn_id = ${values.psnId},
        platform = ${values.platform},
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ${id}
  `;
}

async function restoreSourceGame(
  transaction: Prisma.TransactionClient,
  source: GameSnapshot,
) {
  const id = parsePositiveId(source.id, '来源记录 ID');
  await transaction.$executeRaw`
    INSERT INTO game (
      id, title, poster_url, platform, playtime_minutes,
      achievement_total, achievement_unlocked, imported_at,
      import_review_state, status, rating, short_review,
      created_at, updated_at, rawg_id, steam_app_id, xbox_id, psn_id
    ) VALUES (
      ${id}, ${source.title}, ${source.posterUrl}, ${source.platform}, ${source.playtimeMinutes},
      ${source.achievementTotal}, ${source.achievementUnlocked},
      ${snapshotDate(source.importedAt, '导入时间')},
      ${source.importReviewState}, ${source.status}, ${source.rating}, ${source.shortReview},
      ${snapshotDate(source.createdAt, '创建时间')},
      ${snapshotDate(source.updatedAt, '更新时间')},
      ${snapshotBigInt(source.rawgId)}, ${snapshotBigInt(source.steamAppId)},
      ${source.xboxId}, ${source.psnId}
    )
  `;
}

export async function mergeDuplicateGames(groupKey: string, targetId: bigint) {
  const group = await findDuplicateGroupByKey('game', groupKey);
  if (!group) conflict('候选组已变化，请刷新后重试');
  if (!group.records.some(record => BigInt(record.id) === targetId)) {
    conflict('保留记录不属于当前候选组');
  }

  const recordIds = group.records.map(record => BigInt(record.id));
  const sourceIds = recordIds.filter(id => id !== targetId);
  if (sourceIds.length === 0) conflict('候选组至少需要两条记录');

  const result = await getDb().$transaction(async transaction => {
    const records = await transaction.game.findMany({
      where: { id: { in: recordIds } },
      include: {
        platformEntries: {
          select: { id: true },
        },
      },
    });
    if (records.length !== recordIds.length) conflict('候选记录已变化，请刷新后重试');
    const target = records.find(record => record.id === targetId);
    if (!target) conflict('保留记录不存在');
    const values = resolveGameMergeValues(target, records);
    const sources = records.filter(record => record.id !== targetId);
    const archive = buildGameMergeArchive(target, sources, values);

    await transaction.gamePlatformEntry.updateMany({
      where: { gameId: { in: sourceIds } },
      data: { gameId: targetId },
    });
    await updateGameMergeValues(transaction, targetId, values);
    await transaction.$executeRaw(
      Prisma.sql`DELETE FROM game WHERE id IN (${Prisma.join(sourceIds)})`,
    );
    await transaction.duplicateReview.deleteMany({ where: { groupKey } });
    await transaction.activityLog.create({
      data: {
        action: 'MERGE',
        entityType: 'GAME',
        entityId: targetId,
        entityTitle: target.title,
        metadata: {
          sourceIds: sourceIds.map(id => id.toString()),
          platformEntriesMoved: true,
          archive,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return {
      targetId: Number(targetId),
      removedIds: sourceIds.map(id => Number(id)),
    };
  });

  return result;
}

export async function restoreGameMerge(
  activityId: bigint,
  targetId: bigint,
  metadata: unknown,
) {
  const archive = parseGameMergeArchive(metadata);
  if (parsePositiveId(archive.targetBefore.id, '保留记录 ID') !== targetId) {
    conflict('合并日志与保留记录不一致，无法撤销');
  }

  await getDb().$transaction(async transaction => {
    const target = await transaction.game.findUnique({ where: { id: targetId } });
    if (!target) conflict('合并后的保留记录不存在，无法撤销');
    if (!gameMatchesMergeValues(target, snapshotMergeValues(archive.targetAfter))) {
      conflict('合并后的记录已被修改，请先确认当前数据后再处理');
    }

    const sourceIds = archive.sources.map(source => parsePositiveId(source.id, '来源记录 ID'));
    const existingSources = await transaction.game.count({ where: { id: { in: sourceIds } } });
    if (existingSources > 0) conflict('原来源记录 ID 已被占用，无法安全撤销');

    const entryIds = archive.platformEntryOwners
      .map(owner => parsePositiveId(owner.entryId, '平台档案 ID'));
    if (entryIds.length > 0) {
      const movableEntries = await transaction.gamePlatformEntry.count({
        where: { id: { in: entryIds }, gameId: targetId },
      });
      if (movableEntries !== entryIds.length) {
        conflict('合并的平台档案已发生变化，无法安全撤销');
      }
    }

    for (const source of archive.sources) {
      await restoreSourceGame(transaction, source);
    }
    for (const owner of archive.platformEntryOwners) {
      const entryId = parsePositiveId(owner.entryId, '平台档案 ID');
      const gameId = parsePositiveId(owner.gameId, '平台档案来源记录 ID');
      const moved = await transaction.gamePlatformEntry.updateMany({
        where: { id: entryId, gameId: targetId },
        data: { gameId },
      });
      if (moved.count !== 1) conflict('平台档案归属已变化，无法安全撤销');
    }

    await updateGameMergeValues(
      transaction,
      targetId,
      snapshotMergeValues(archive.targetBefore),
    );
    await transaction.activityLog.create({
      data: {
        action: 'UNDO',
        entityType: 'GAME',
        entityId: targetId,
        entityTitle: archive.targetBefore.title,
        metadata: {
          undoneLogId: activityId.toString(),
          restoredSourceIds: sourceIds.map(id => id.toString()),
        },
      },
    });
  });
}
