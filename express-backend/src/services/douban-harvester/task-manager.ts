import { ImportSummary } from '../../dto/import-summary';

export type TaskMode = 'json' | 'full' | 'incremental';
export type TaskStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export interface TaskProgress {
  processed: number;
  total: number;
  currentTitle: string;
}

export interface HarvestTask {
  taskId: string;
  mode: TaskMode;
  status: TaskStatus;
  progress: TaskProgress;
  result: ImportSummary | null;
  error: string | null;
  startedAt: string;
  abortController: AbortController;
}

// 内存任务存储（单实例足够）
const tasks = new Map<string, HarvestTask>();

let taskCounter = 0;

export function createTask(mode: TaskMode): HarvestTask {
  taskCounter++;
  const taskId = `douban-harvest-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${taskCounter}`;
  const task: HarvestTask = {
    taskId,
    mode,
    status: 'running',
    progress: { processed: 0, total: 0, currentTitle: '' },
    result: null,
    error: null,
    startedAt: new Date().toISOString(),
    abortController: new AbortController(),
  };
  tasks.set(taskId, task);
  return task;
}

export function getTask(taskId: string): HarvestTask | undefined {
  return tasks.get(taskId);
}

export function updateProgress(taskId: string, progress: Partial<TaskProgress>): void {
  const task = tasks.get(taskId);
  if (task) {
    task.progress = { ...task.progress, ...progress };
  }
}

export function completeTask(taskId: string, result: ImportSummary): void {
  const task = tasks.get(taskId);
  if (task) {
    task.status = 'completed';
    task.result = result;
    task.progress.currentTitle = '';
  }
}

export function failTask(taskId: string, error: string): void {
  const task = tasks.get(taskId);
  if (task) {
    task.status = 'failed';
    task.error = error;
  }
}

export function cancelTask(taskId: string): { ok: boolean; error?: string } {
  const task = tasks.get(taskId);
  if (!task) return { ok: false, error: '任务不存在' };
  if (task.status !== 'running') return { ok: false, error: '任务非运行状态' };
  task.status = 'cancelled';
  task.abortController.abort();
  return { ok: true };
}
