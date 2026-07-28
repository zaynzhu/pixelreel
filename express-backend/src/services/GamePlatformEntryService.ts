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

export interface GamePlatformSyncInput {
  platform: GamePlatform;
  externalId: string;
  playtimeMinutes: number | null;
  achievementTotal: number | null;
  achievementUnlocked: number | null;
  importedAt: Date | null;
  lastSyncedAt: Date;
}

export interface GamePlatformCreateInput extends GamePlatformSyncInput {
  gameData: Record<string, unknown>;
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

export async function findGamesByPlatformExternalIds(
  platform: GamePlatform,
  externalIds: string[],
): Promise<Map<string, any>> {
  if (externalIds.length === 0) return new Map();
  const entries = await getDb().gamePlatformEntry.findMany({
    where: {
      platform,
      externalId: { in: Array.from(new Set(externalIds)) },
    },
    include: { game: true },
  });
  return new Map(entries.map(entry => [entry.externalId, entry.game]));
}

export async function syncGamePlatformEntry(
  gameId: bigint,
  input: GamePlatformSyncInput,
): Promise<void> {
  const db = getDb();
  const existing = await db.gamePlatformEntry.findUnique({
    where: {
      platform_externalId: {
        platform: input.platform,
        externalId: input.externalId,
      },
    },
  });
  if (existing && existing.gameId !== gameId) {
    throw new Error(`${input.platform} 平台身份已关联其他游戏记录`);
  }

  const metrics = {
    ...(input.playtimeMinutes != null ? { playtimeMinutes: input.playtimeMinutes } : {}),
    ...(input.achievementTotal != null ? { achievementTotal: input.achievementTotal } : {}),
    ...(input.achievementUnlocked != null ? { achievementUnlocked: input.achievementUnlocked } : {}),
  };
  await db.gamePlatformEntry.upsert({
    where: {
      platform_externalId: {
        platform: input.platform,
        externalId: input.externalId,
      },
    },
    create: {
      gameId,
      ...input,
    },
    update: {
      ...metrics,
      lastSyncedAt: input.lastSyncedAt,
    },
  });
}

export async function createGamesWithPlatformEntries(
  platform: GamePlatform,
  records: GamePlatformCreateInput[],
): Promise<number> {
  if (records.length === 0) return 0;
  const db = getDb();
  return db.$transaction(async transaction => {
    const created = await transaction.game.createMany({
      data: records.map(record => record.gameData as any),
    });
    const games = await findCreatedGames(transaction, platform, records.map(record => record.externalId));
    const gameByExternalId = new Map(games.map(game => [readLegacyExternalId(game, platform), game]));
    const entries = records.map(record => {
      const game = gameByExternalId.get(record.externalId);
      if (!game) throw new Error(`${platform} 新游戏缺少对应的平台身份`);
      return {
        gameId: game.id,
        platform,
        externalId: record.externalId,
        playtimeMinutes: record.playtimeMinutes,
        achievementTotal: record.achievementTotal,
        achievementUnlocked: record.achievementUnlocked,
        importedAt: record.importedAt,
        lastSyncedAt: record.lastSyncedAt,
      };
    });
    await transaction.gamePlatformEntry.createMany({ data: entries });
    return created.count;
  });
}

function findCreatedGames(
  transaction: any,
  platform: GamePlatform,
  externalIds: string[],
): Promise<any[]> {
  if (platform === 'STEAM') {
    return transaction.game.findMany({
      where: { steamAppId: { in: externalIds.map(value => BigInt(value)) } },
    });
  }
  if (platform === 'XBOX') {
    return transaction.game.findMany({ where: { xboxId: { in: externalIds } } });
  }
  return transaction.game.findMany({ where: { psnId: { in: externalIds } } });
}

function readLegacyExternalId(game: any, platform: GamePlatform): string {
  if (platform === 'STEAM') return game.steamAppId?.toString() ?? '';
  if (platform === 'XBOX') return game.xboxId ?? '';
  return game.psnId ?? '';
}
