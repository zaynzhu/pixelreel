import type { RecordStatus } from './library'

export type SyncSourceKey = 'steam' | 'trakt' | 'douban' | 'xbox' | 'psn'

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
