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

export function startImportSummaryTask(type: string, label: string, importer: SummaryImporter) {
  const task = createTask(type, label);
  void importer(
    (processed, total, currentTitle) => {
      updateProgress(task.taskId, { processed, total, currentTitle });
    },
    task.abortController.signal,
  ).then(result => {
    completeTask(task.taskId, result);
  }).catch((error: unknown) => {
    failTask(task.taskId, error instanceof Error ? error.message : `${label}失败`);
  });
  return task;
}
