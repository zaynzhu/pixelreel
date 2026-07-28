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

function conflict(message: string): never {
  throw Object.assign(new Error(message), { status: 409 });
}

function uniqueValues<T>(values: Array<T | null | undefined>): T[] {
  return Array.from(new Set(values.filter((value): value is T => value != null)));
}

export function resolveGameMergeValues(
  target: MergeableGame,
  records: MergeableGame[],
): GameMergeValues {
  const meaningfulStatuses = uniqueValues(
    records.map(record => ['IN_PROGRESS', 'DONE', 'DROPPED'].includes(record.status) ? record.status : null),
  );
  if (meaningfulStatuses.length > 1) conflict('候选记录的个人状态存在冲突，请先手动统一');

  const ratings = uniqueValues(records.map(record => record.rating));
  if (ratings.length > 1) conflict('候选记录的个人评分存在冲突，请先手动统一');

  const reviews = uniqueValues(records.map(record => record.shortReview?.trim() || null));
  if (reviews.length > 1) conflict('候选记录的个人短评存在冲突，请先手动统一');

  const rawgIds = uniqueValues(records.map(record => record.rawgId?.toString() ?? null));
  if (rawgIds.length > 1) conflict('候选记录绑定了不同的 RAWG 条目，请先纠正匹配');

  const importedDates = records
    .map(record => record.importedAt)
    .filter((value): value is Date => value != null)
    .sort((left, right) => left.getTime() - right.getTime());
  const reviewStates = new Set(records.map(record => record.importReviewState));

  return {
    status: meaningfulStatuses[0] ?? target.status,
    rating: target.rating ?? ratings[0] ?? null,
    shortReview: target.shortReview?.trim() || reviews[0] || null,
    posterUrl: target.posterUrl ?? records.find(record => record.posterUrl)?.posterUrl ?? null,
    importReviewState: reviewStates.has('ACCEPTED')
      ? 'ACCEPTED'
      : reviewStates.has('PENDING') ? 'PENDING' : target.importReviewState,
    importedAt: importedDates[0] ?? null,
    rawgId: target.rawgId ?? (rawgIds[0] ? BigInt(rawgIds[0]) : null),
    steamAppId: target.steamAppId ?? records.find(record => record.steamAppId)?.steamAppId ?? null,
    xboxId: target.xboxId ?? records.find(record => record.xboxId)?.xboxId ?? null,
    psnId: target.psnId ?? records.find(record => record.psnId)?.psnId ?? null,
    platform: target.platform ?? records.find(record => record.platform)?.platform ?? null,
  };
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
    });
    if (records.length !== recordIds.length) conflict('候选记录已变化，请刷新后重试');
    const target = records.find(record => record.id === targetId);
    if (!target) conflict('保留记录不存在');
    const values = resolveGameMergeValues(target, records);

    await transaction.gamePlatformEntry.updateMany({
      where: { gameId: { in: sourceIds } },
      data: { gameId: targetId },
    });
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
      WHERE id = ${targetId}
    `;
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
        },
      },
    });

    return {
      targetId: Number(targetId),
      removedIds: sourceIds.map(id => Number(id)),
    };
  });

  return result;
}
