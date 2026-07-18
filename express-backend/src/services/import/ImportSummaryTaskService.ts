import type { ImportSummary } from '../../dto/import-summary';
import {
  completeTask,
  createTask,
  failTask,
  updateProgress,
} from '../task-manager';

type ProgressCallback = (processed: number, total: number, currentTitle: string) => void;
type SummaryImporter = (onProgress: ProgressCallback, signal: AbortSignal) => Promise<ImportSummary>;

export function assertTaskActive(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error('任务已取消');
}

export function getImportSummaryFailure(result: ImportSummary): string | null {
  const hasProcessedItem = result.total > 0
    || result.imported > 0
    || (result.updated ?? 0) > 0
    || result.skipped > 0;
  if (hasProcessedItem || result.errors.length === 0) return null;
  return result.errors.find(error => error.trim())?.trim() || '同步失败';
}

export function settleImportSummaryTask(taskId: string, result: ImportSummary): void {
  const failure = getImportSummaryFailure(result);
  if (failure) {
    failTask(taskId, failure, result);
    return;
  }
  completeTask(taskId, result);
}

export function startImportSummaryTask(type: string, label: string, importer: SummaryImporter) {
  const task = createTask(type, label);
  void importer(
    (processed, total, currentTitle) => {
      updateProgress(task.taskId, { processed, total, currentTitle });
    },
    task.abortController.signal,
  ).then(result => {
    settleImportSummaryTask(task.taskId, result);
  }).catch((error: unknown) => {
    failTask(task.taskId, error instanceof Error ? error.message : `${label}失败`);
  });
  return task;
}
