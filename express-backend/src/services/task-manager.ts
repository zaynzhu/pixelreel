import { ImportSummary } from '../dto/import-summary';

export type TaskStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export interface TaskProgress {
  processed: number;
  total: number;
  currentTitle: string;
}

export interface Task {
  taskId: string;
  type: string;          // 'douban-harvest' | 'trakt-import' | 'cover-fill' | ...
  label: string;         // 人类可读名称，如 '豆瓣全量导入'
  status: TaskStatus;
  progress: TaskProgress;
  result: ImportSummary | null;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
  abortController: AbortController;
}

// 内存任务存储
const tasks = new Map<string, Task>();
let taskCounter = 0;

const TTL_MS = 30 * 60 * 1000; // completed/failed 任务 30 分钟后清理

function cleanup() {
  const now = Date.now();
  for (const [id, task] of tasks) {
    if (task.status !== 'running' && task.completedAt) {
      const age = now - new Date(task.completedAt).getTime();
      if (age > TTL_MS) tasks.delete(id);
    }
  }
}

export function createTask(type: string, label: string): Task {
  cleanup();
  taskCounter++;
  const task: Task = {
    taskId: `${type}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${taskCounter}`,
    type,
    label,
    status: 'running',
    progress: { processed: 0, total: 0, currentTitle: '' },
    result: null,
    error: null,
    startedAt: new Date().toISOString(),
    completedAt: null,
    abortController: new AbortController(),
  };
  tasks.set(task.taskId, task);
  return task;
}

export function getTask(taskId: string): Omit<Task, 'abortController'> | undefined {
  const task = tasks.get(taskId);
  if (!task) return undefined;
  const { abortController: _, ...rest } = task;
  return rest;
}

export function listTasks(): Omit<Task, 'abortController'>[] {
  cleanup();
  return Array.from(tasks.values())
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .map(({ abortController: _, ...rest }) => rest);
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
    task.completedAt = new Date().toISOString();
  }
}

export function failTask(taskId: string, error: string): void {
  const task = tasks.get(taskId);
  if (task) {
    task.status = 'failed';
    task.error = error;
    task.completedAt = new Date().toISOString();
  }
}

export function cancelTask(taskId: string): { ok: boolean; error?: string } {
  const task = tasks.get(taskId);
  if (!task) return { ok: false, error: '任务不存在' };
  if (task.status !== 'running') return { ok: false, error: '任务非运行状态' };
  task.status = 'cancelled';
  task.abortController.abort();
  task.completedAt = new Date().toISOString();
  return { ok: true };
}