import { getDb } from '../config/db';

export const GAME_PLATFORMS = ['STEAM', 'XBOX', 'PSN'] as const;
export type GamePlatform = typeof GAME_PLATFORMS[number];

interface LegacyGamePlatformSource {
  id: bigint;
  platform: string | null;
  steamAppId: bigint | null;
  xboxId: string | null;
  psnId: string | null;
  playtimeMinutes: number | null;
  achievementTotal: number | null;
  achievementUnlocked: number | null;
  importedAt: Date | null;
  updatedAt: Date;
}

export interface GamePlatformEntrySeed {
  gameId: bigint;
  platform: GamePlatform;
  externalId: string;
  playtimeMinutes: number | null;
  achievementTotal: number | null;
  achievementUnlocked: number | null;
  importedAt: Date | null;
  lastSyncedAt: Date;
}

export function buildLegacyGamePlatformEntrySeeds(
  game: LegacyGamePlatformSource,
): GamePlatformEntrySeed[] {
  const identities: Array<{ platform: GamePlatform; externalId: string }> = [];
  if (game.steamAppId != null) {
    identities.push({ platform: 'STEAM', externalId: game.steamAppId.toString() });
  }
  if (game.xboxId?.trim()) {
    identities.push({ platform: 'XBOX', externalId: game.xboxId.trim() });
  }
  if (game.psnId?.trim()) {
    identities.push({ platform: 'PSN', externalId: game.psnId.trim() });
  }

  const explicitPlatform = game.platform?.trim().toUpperCase();
  const metricPlatform = GAME_PLATFORMS.includes(explicitPlatform as GamePlatform)
    ? explicitPlatform as GamePlatform
    : identities.length === 1 ? identities[0].platform : null;

  return identities.map(identity => ({
    gameId: game.id,
    platform: identity.platform,
    externalId: identity.externalId,
    playtimeMinutes: identity.platform === metricPlatform ? game.playtimeMinutes : null,
    achievementTotal: identity.platform === metricPlatform ? game.achievementTotal : null,
    achievementUnlocked: identity.platform === metricPlatform ? game.achievementUnlocked : null,
    importedAt: game.importedAt,
    lastSyncedAt: game.updatedAt,
  }));
}

export async function backfillLegacyGamePlatformEntries(apply = false) {
  const db = getDb();
  const games = await db.game.findMany({
    select: {
      id: true,
      platform: true,
      steamAppId: true,
      xboxId: true,
      psnId: true,
      playtimeMinutes: true,
      achievementTotal: true,
      achievementUnlocked: true,
      importedAt: true,
      updatedAt: true,
    },
  });
  const entries = games.flatMap(buildLegacyGamePlatformEntrySeeds);
  if (!apply || entries.length === 0) {
    return { scanned: games.length, candidates: entries.length, created: 0, applied: false };
  }

  const result = await db.gamePlatformEntry.createMany({
    data: entries,
    skipDuplicates: true,
  });
  return {
    scanned: games.length,
    candidates: entries.length,
    created: result.count,
    applied: true,
  };
}
