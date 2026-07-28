import type { Prisma } from '@prisma/client';
import { RecordStatus } from '../enums/RecordStatus';

export function effectiveGameStatus(game: {
  status: string | null;
  playtimeMinutes?: number | null;
  platformEntries?: Array<{ playtimeMinutes?: number | null }>;
}): string {
  const status = game.status || RecordStatus.UNSET;
  if (status === RecordStatus.WANT && (gamePlaytimeMinutes(game) ?? 0) > 0) {
    return RecordStatus.IN_PROGRESS;
  }
  return status;
}

export function gamePlaytimeMinutes(game: {
  playtimeMinutes?: number | null;
  platformEntries?: Array<{ playtimeMinutes?: number | null }>;
}): number | null {
  if (game.platformEntries && game.platformEntries.length > 0) {
    const knownPlaytimes = game.platformEntries
      .map(entry => entry.playtimeMinutes)
      .filter((value): value is number => value != null);
    if (knownPlaytimes.length === 0) return null;
    return knownPlaytimes.reduce(
      (total, value) => total + Math.max(value, 0),
      0,
    );
  }
  return game.playtimeMinutes == null ? null : Math.max(game.playtimeMinutes, 0);
}

export function buildGameStatusWhere(status?: RecordStatus): Prisma.GameWhereInput {
  if (status === RecordStatus.WANT) {
    return {
      status: RecordStatus.WANT,
      AND: [
        { OR: [{ playtimeMinutes: null }, { playtimeMinutes: { lte: 0 } }] },
        { platformEntries: { none: { playtimeMinutes: { gt: 0 } } } },
      ],
    };
  }
  if (status === RecordStatus.IN_PROGRESS) {
    return {
      OR: [
        { status: RecordStatus.IN_PROGRESS },
        {
          status: RecordStatus.WANT,
          OR: [
            { playtimeMinutes: { gt: 0 } },
            { platformEntries: { some: { playtimeMinutes: { gt: 0 } } } },
          ],
        },
      ],
    };
  }
  return status ? { status } : {};
}
