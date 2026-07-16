import type { RecordStatus } from './library'

export type SyncSourceKey = 'steam' | 'trakt' | 'douban' | 'xbox' | 'psn'

export type SyncUnavailableReason =
  | 'missing_api_key'
  | 'missing_account'
  | 'missing_client_id'
  | 'missing_access_token'
  | 'missing_data'
  | 'disabled'
  | 'experimental_not_connected'
  | null

export interface SyncAvailability {
  available: boolean
  reason: SyncUnavailableReason
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
  xbox: SyncAvailability
  psn: SyncAvailability
}

export interface SyncResult {
  total: number
  imported: number
  skipped: number
  errors: string[]
}

export type SyncHistoryStatus = 'completed' | 'failed' | 'cancelled'

export interface SyncHistoryEntry {
  source: Extract<SyncSourceKey, 'douban' | 'trakt' | 'steam'>
  taskId: string
  type: string
  label: string
  status: SyncHistoryStatus
  result: SyncResult | null
  error: string | null
  startedAt: string
  completedAt: string
}

export type SyncHistoryResponse = Record<'douban' | 'trakt' | 'steam', SyncHistoryEntry | null>

export interface SyncTaskResponse {
  taskId: string
  status: 'running'
  type: string
  label: string
}

export interface SyncSourceForm {
  accountId: string
  status: RecordStatus
}
