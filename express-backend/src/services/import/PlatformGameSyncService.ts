import { RecordStatus } from '../../enums/RecordStatus';

export const PLATFORM_GAME_EXTERNAL_ID_MAX_LENGTH = 50;
export const PLATFORM_GAME_TITLE_MAX_LENGTH = 255;
export const PLATFORM_GAME_POSTER_URL_MAX_LENGTH = 500;
export const PLATFORM_GAME_REQUEST_TIMEOUT_MS = 30_000;
export const PLATFORM_GAME_METRIC_MAX_VALUE = 2_147_483_647;

export function buildPlatformGameRequestOptions(signal?: AbortSignal) {
  return {
    signal,
    timeout: PLATFORM_GAME_REQUEST_TIMEOUT_MS,
  };
}

export function resolvePlatformGameImportStatus(status?: string | null): string {
  return status || RecordStatus.WANT;
}

export function parsePlatformGameMetric(value: unknown): number | null {
  if (value == null || (typeof value !== 'number' && typeof value !== 'string')) return null;
  const normalized = typeof value === 'string' ? value.trim() : value;
  if (normalized === '' || (typeof normalized === 'string' && !/^\d+$/.test(normalized))) return null;
  const parsed = Number(normalized);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= PLATFORM_GAME_METRIC_MAX_VALUE
    ? parsed
    : null;
}

export function isPlatformGameExternalIdValid(value: string): boolean {
  return value.length > 0 && value.length <= PLATFORM_GAME_EXTERNAL_ID_MAX_LENGTH;
}

export function isPlatformGameTitleValid(value: string): boolean {
  return value.length > 0 && value.length <= PLATFORM_GAME_TITLE_MAX_LENGTH;
}

export function normalizePlatformGamePosterUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const parsed = new URL(value);
    const normalized = parsed.toString();
    return (parsed.protocol === 'http:' || parsed.protocol === 'https:')
      && normalized.length <= PLATFORM_GAME_POSTER_URL_MAX_LENGTH
      ? normalized
      : null;
  } catch {
    return null;
  }
}

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
