import { Prisma } from '@prisma/client'
import { getDb } from '../config/db'

export type ImportReviewCategory = 'movie' | 'tv_show' | 'game'
export type ImportReviewDecision = 'ACCEPTED' | 'IGNORED'

export interface ImportReviewRecordRef {
  category: ImportReviewCategory
  id: number
}

export class ImportReviewConflictError extends Error {
  readonly status = 409

  constructor() {
    super('审核队列已发生变化，请刷新后重新选择')
    this.name = 'ImportReviewConflictError'
  }
}

function assertCompleteBatch(requested: number, counts: number[]) {
  if (counts.reduce((total, count) => total + count, 0) !== requested) {
    throw new ImportReviewConflictError()
  }
}

export async function applyImportReviewDecisionInTransaction(
  transaction: Prisma.TransactionClient,
  records: ImportReviewRecordRef[],
  decision: ImportReviewDecision,
) {
  const reviewableStates = decision === 'ACCEPTED' ? ['PENDING', 'IGNORED'] : ['PENDING']
  const idsByCategory = {
    movie: records.filter(record => record.category === 'movie').map(record => BigInt(record.id)),
    tvShow: records.filter(record => record.category === 'tv_show').map(record => BigInt(record.id)),
    game: records.filter(record => record.category === 'game').map(record => BigInt(record.id)),
  }
  const whereByCategory = {
    movie: { id: { in: idsByCategory.movie }, importReviewState: { in: reviewableStates } },
    tvShow: { id: { in: idsByCategory.tvShow }, importReviewState: { in: reviewableStates } },
    game: { id: { in: idsByCategory.game }, importReviewState: { in: reviewableStates } },
  }

  const matchedCounts = await Promise.all([
    transaction.movie.count({ where: whereByCategory.movie }),
    transaction.tvShow.count({ where: whereByCategory.tvShow }),
    transaction.game.count({ where: whereByCategory.game }),
  ])
  assertCompleteBatch(records.length, matchedCounts)

  const updates = await Promise.all([
    transaction.movie.updateMany({
      where: whereByCategory.movie,
      data: { importReviewState: decision },
    }),
    transaction.tvShow.updateMany({
      where: whereByCategory.tvShow,
      data: { importReviewState: decision },
    }),
    transaction.game.updateMany({
      where: whereByCategory.game,
      data: { importReviewState: decision },
    }),
  ])
  const updatedCounts = updates.map(result => result.count)
  assertCompleteBatch(records.length, updatedCounts)

  return {
    requested: records.length,
    updated: updatedCounts.reduce((total, count) => total + count, 0),
    decision,
  }
}

export async function applyImportReviewDecision(
  records: ImportReviewRecordRef[],
  decision: ImportReviewDecision,
) {
  return getDb().$transaction(
    transaction => applyImportReviewDecisionInTransaction(transaction, records, decision),
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 30_000,
    },
  )
}
