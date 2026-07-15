import { getDb } from '../config/db';

export type ImportReviewCategory = 'movie' | 'tv_show' | 'game';
export type ImportReviewDecision = 'ACCEPTED' | 'IGNORED';

export interface ImportReviewRecordRef {
  category: ImportReviewCategory;
  id: number;
}

export async function applyImportReviewDecision(
  records: ImportReviewRecordRef[],
  decision: ImportReviewDecision,
) {
  const db = getDb();
  const reviewableStates = decision === 'ACCEPTED' ? ['PENDING', 'IGNORED'] : ['PENDING'];
  const idsByCategory = {
    movie: records.filter(record => record.category === 'movie').map(record => BigInt(record.id)),
    tv_show: records.filter(record => record.category === 'tv_show').map(record => BigInt(record.id)),
    game: records.filter(record => record.category === 'game').map(record => BigInt(record.id)),
  };

  const counts = await db.$transaction([
    db.movie.updateMany({
      where: { id: { in: idsByCategory.movie }, importReviewState: { in: reviewableStates } },
      data: { importReviewState: decision },
    }),
    db.tvShow.updateMany({
      where: { id: { in: idsByCategory.tv_show }, importReviewState: { in: reviewableStates } },
      data: { importReviewState: decision },
    }),
    db.game.updateMany({
      where: { id: { in: idsByCategory.game }, importReviewState: { in: reviewableStates } },
      data: { importReviewState: decision },
    }),
  ]);

  return {
    requested: records.length,
    updated: counts.reduce((sum, result) => sum + result.count, 0),
    decision,
  };
}
