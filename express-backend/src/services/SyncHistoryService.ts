import fs from 'fs';
import path from 'path';
import type { ImportSummary } from '../dto/import-summary';

export type SyncHistorySource = 'douban' | 'trakt' | 'steam' | 'xbox' | 'psn';
export type SyncHistoryStatus = 'completed' | 'failed' | 'cancelled';

export interface SyncHistoryEntry {
  source: SyncHistorySource;
  taskId: string;
  type: string;
  label: string;
  status: SyncHistoryStatus;
  result: ImportSummary | null;
  error: string | null;
  startedAt: string;
  completedAt: string;
}

export type SyncHistoryResponse = Record<SyncHistorySource, SyncHistoryEntry | null>;

interface TerminalTaskSnapshot {
  taskId: string;
  type: string;
  label: string;
  status: string;
  result: ImportSummary | null;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}

const TASK_SOURCE: Record<string, SyncHistorySource> = {
  'douban-harvest': 'douban',
  'trakt-import': 'trakt',
  'steam-owned': 'steam',
  'xbox-owned': 'xbox',
  'psn-owned': 'psn',
};
const SYNC_HISTORY_PATH = path.resolve(__dirname, '../../data/sync-history.json');
const TERMINAL_STATUSES = new Set<SyncHistoryStatus>(['completed', 'failed', 'cancelled']);

function emptyHistory(): SyncHistoryResponse {
  return { douban: null, trakt: null, steam: null, xbox: null, psn: null };
}

function isImportSummary(value: unknown): value is ImportSummary {
  if (!value || typeof value !== 'object') return false;
  const result = value as Partial<ImportSummary>;
  return Number.isFinite(result.total)
    && Number.isFinite(result.imported)
    && Number.isFinite(result.skipped)
    && Array.isArray(result.errors)
    && result.errors.every(error => typeof error === 'string');
}

function isHistoryEntry(value: unknown, source: SyncHistorySource): value is SyncHistoryEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<SyncHistoryEntry>;
  return entry.source === source
    && typeof entry.taskId === 'string'
    && typeof entry.type === 'string'
    && typeof entry.label === 'string'
    && typeof entry.status === 'string'
    && TERMINAL_STATUSES.has(entry.status as SyncHistoryStatus)
    && (entry.result === null || isImportSummary(entry.result))
    && (entry.error === null || typeof entry.error === 'string')
    && typeof entry.startedAt === 'string'
    && Number.isFinite(new Date(entry.startedAt).getTime())
    && typeof entry.completedAt === 'string'
    && Number.isFinite(new Date(entry.completedAt).getTime());
}

export class SyncHistoryStore {
  private readonly storagePath: string;
  private readonly tempPath: string;

  constructor(storagePath: string) {
    this.storagePath = storagePath;
    this.tempPath = `${storagePath}.tmp`;
  }

  list(): SyncHistoryResponse {
    if (!fs.existsSync(this.storagePath)) return emptyHistory();
    try {
      const parsed = JSON.parse(fs.readFileSync(this.storagePath, 'utf-8')) as Record<string, unknown>;
      const history = emptyHistory();
      for (const source of Object.keys(history) as SyncHistorySource[]) {
        history[source] = isHistoryEntry(parsed?.[source], source) ? parsed[source] : null;
      }
      return history;
    } catch (error) {
      console.error('[SyncHistory] 读取同步历史失败:', error);
      return emptyHistory();
    }
  }

  record(task: TerminalTaskSnapshot): void {
    const source = TASK_SOURCE[task.type];
    if (!source || !task.completedAt || !TERMINAL_STATUSES.has(task.status as SyncHistoryStatus)) return;
    const history = this.list();
    const existing = history[source];
    if (existing && new Date(existing.completedAt).getTime() > new Date(task.completedAt).getTime()) return;
    history[source] = {
      source,
      taskId: task.taskId,
      type: task.type,
      label: task.label,
      status: task.status as SyncHistoryStatus,
      result: task.result,
      error: task.error,
      startedAt: task.startedAt,
      completedAt: task.completedAt,
    };
    fs.mkdirSync(path.dirname(this.storagePath), { recursive: true });
    fs.writeFileSync(this.tempPath, JSON.stringify(history, null, 2), 'utf-8');
    fs.renameSync(this.tempPath, this.storagePath);
  }
}

const syncHistoryStore = new SyncHistoryStore(SYNC_HISTORY_PATH);

export function recordSyncHistory(task: TerminalTaskSnapshot): void {
  syncHistoryStore.record(task);
}

export function getSyncHistory(): SyncHistoryResponse {
  return syncHistoryStore.list();
}
