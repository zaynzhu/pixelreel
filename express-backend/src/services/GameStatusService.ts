import type { Prisma } from '@prisma/client';
import { RecordStatus } from '../enums/RecordStatus';

export function effectiveGameStatus(game: {
  status: string | null;
  playtimeMinutes?: number | null;
}): string {
  const status = game.status || RecordStatus.UNSET;
  if (status === RecordStatus.WANT && (game.playtimeMinutes ?? 0) > 0) {
    return RecordStatus.IN_PROGRESS;
  }
  return status;
}

export function buildGameStatusWhere(status?: RecordStatus): Prisma.GameWhereInput {
  if (status === RecordStatus.WANT) {
    return {
      status: RecordStatus.WANT,
      OR: [
        { playtimeMinutes: null },
        { playtimeMinutes: { lte: 0 } },
      ],
    };
  }
  if (status === RecordStatus.IN_PROGRESS) {
    return {
      OR: [
        { status: RecordStatus.IN_PROGRESS },
        { status: RecordStatus.WANT, playtimeMinutes: { gt: 0 } },
      ],
    };
  }
  return status ? { status } : {};
}
