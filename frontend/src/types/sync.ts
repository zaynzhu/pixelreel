import type { RecordStatus } from './library'

export type SyncSourceKey = 'steam' | 'trakt' | 'douban' | 'xbox' | 'psn'
export type PlatformSource = 'xbox' | 'psn'
export type PlatformAccounts = Record<PlatformSource, string>
export type RememberedPlatformAccounts = Record<PlatformSource, boolean>

export const SYNC_SOURCE_ORDER: SyncSourceKey[] = ['douban', 'trakt', 'steam', 'xbox', 'psn']

const PLATFORM_ACCOUNT_STORAGE_KEY = 'pixelreel.sync.platform-accounts.v1'

export type SyncUnavailableReason =
  | 'missing_api_key'
  | 'missing_account'
  | 'missing_client_id'
  | 'missing_client_secret'
  | 'missing_authorization'
  | 'missing_access_token'
  | 'missing_data'
  | 'disabled'
  | null

export interface SyncAvailability {
  available: boolean
  reason: SyncUnavailableReason
}

export function applyPlatformAccountOverride(
  availability: SyncAvailability,
  accountOverride: string,
): SyncAvailability {
  if (availability.reason !== 'missing_account' || !accountOverride.trim()) return availability
  return { available: true, reason: null }
}

export function loadRememberedPlatformAccounts(): PlatformAccounts {
  const emptyAccounts = { xbox: '', psn: '' }
  try {
    const stored = JSON.parse(localStorage.getItem(PLATFORM_ACCOUNT_STORAGE_KEY) ?? '{}') as Partial<PlatformAccounts>
    return {
      xbox: typeof stored.xbox === 'string' && stored.xbox.length <= 100 ? stored.xbox : '',
      psn: typeof stored.psn === 'string' && stored.psn.length <= 100 ? stored.psn : '',
    }
  } catch {
    return emptyAccounts
  }
}

export function saveRememberedPlatformAccounts(
  accounts: PlatformAccounts,
  remembered: RememberedPlatformAccounts,
) {
  const stored = {
    xbox: remembered.xbox ? accounts.xbox : '',
    psn: remembered.psn ? accounts.psn : '',
  }
  try {
    if (stored.xbox || stored.psn) {
      localStorage.setItem(PLATFORM_ACCOUNT_STORAGE_KEY, JSON.stringify(stored))
    } else {
      localStorage.removeItem(PLATFORM_ACCOUNT_STORAGE_KEY)
    }
  } catch {
    // 浏览器拒绝本地存储时仍允许本次同步
  }
}

export interface SyncSourceStatus {
  steam: SyncAvailability
  trakt: SyncAvailability
  douban: SyncAvailability & {
    modes: {
      json: SyncAvailability
      incremental: SyncAvailability
      full: SyncAvailability
    }
  }
  xbox: SyncAvailability & {
    providers: {
      openxbl: SyncAvailability
      microsoft: SyncAvailability
    }
  }
  psn: SyncAvailability
}

export function getSyncAvailabilityCounts(
  status: SyncSourceStatus,
  xboxAvailability: SyncAvailability,
  psnAvailability: SyncAvailability,
) {
  const available = SYNC_SOURCE_ORDER.filter(source => {
    if (source === 'xbox') return xboxAvailability.available
    if (source === 'psn') return psnAvailability.available
    return status[source].available
  }).length

  return {
    available,
    attention: SYNC_SOURCE_ORDER.length - available,
  }
}

export interface SyncResult {
  total: number
  imported: number
  updated?: number
  skipped: number
  errors: string[]
}

export type SyncHistoryStatus = 'completed' | 'failed' | 'cancelled'

export interface SyncHistoryEntry {
  source: SyncSourceKey
  taskId: string
  type: string
  label: string
  status: SyncHistoryStatus
  result: SyncResult | null
  error: string | null
  startedAt: string
  completedAt: string
}

export type SyncHistoryResponse = Record<SyncSourceKey, SyncHistoryEntry | null>

export interface SyncTaskResponse {
  taskId: string
  status: 'running'
  type: string
  label: string
}

export interface PlatformConnectionResponse {
  ok: true
  gamertag?: string | null
}

export interface SyncSourceForm {
  accountId: string
  status: RecordStatus
}
