export interface PlatformGameMetricSnapshot {
  platform: string | null;
  posterUrl: string | null;
  playtimeMinutes: number | null;
  achievementTotal: number | null;
  achievementUnlocked: number | null;
}

export type PlatformGameMetricUpdate = Partial<PlatformGameMetricSnapshot>;

export function buildPlatformGameMetricUpdate(
  existing: PlatformGameMetricSnapshot,
  incoming: PlatformGameMetricSnapshot,
): PlatformGameMetricUpdate {
  const update: PlatformGameMetricUpdate = {};

  if (!existing.platform && incoming.platform) update.platform = incoming.platform;
  if (!existing.posterUrl && incoming.posterUrl) update.posterUrl = incoming.posterUrl;
  if (incoming.playtimeMinutes != null && incoming.playtimeMinutes !== existing.playtimeMinutes) {
    update.playtimeMinutes = incoming.playtimeMinutes;
  }
  if (incoming.achievementTotal != null && incoming.achievementTotal !== existing.achievementTotal) {
    update.achievementTotal = incoming.achievementTotal;
  }
  if (incoming.achievementUnlocked != null
    && incoming.achievementUnlocked !== existing.achievementUnlocked) {
    update.achievementUnlocked = incoming.achievementUnlocked;
  }

  return update;
}

export function hasPlatformGameMetricUpdate(update: PlatformGameMetricUpdate): boolean {
  return Object.keys(update).length > 0;
}
