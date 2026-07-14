import fs from 'fs';
import path from 'path';
import { ImportSummary } from '../dto/import-summary';
import { logActivity } from './activity-log';

export type TaskStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export interface TaskProgress {
  processed: number;
  total: number;
  currentTitle: string;
}

export interface Task {
  taskId: string;
  type: string;
  label: string;
  status: TaskStatus;
  progress: TaskProgress;
  result: ImportSummary | null;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
  abortController: AbortController;
}

export type TaskSnapshot = Omit<Task, 'abortController'>;

type ActivityLogger = typeof logActivity;

interface TaskManagerOptions {
  storagePath: string;
  now?: () => Date;
  ttlMs?: number;
  activityLogger?: ActivityLogger;
}

const DEFAULT_TTL_MS = 30 * 60 * 1000;
const PROGRESS_PERSIST_DELAY_MS = 250;
const TASK_STORAGE_PATH = path.resolve(__dirname, '../../data/tasks.json');
export const INTERRUPTED_TASK_ERROR = '服务重启，运行中的任务已中断';

export class TaskConflictError extends Error {
  readonly status = 409;

  constructor(task: Task) {
    super(`同类型任务正在运行: ${task.label}`);
    this.name = 'TaskConflictError';
  }
}

const TASK_STATUSES = new Set<TaskStatus>(['running', 'completed', 'failed', 'cancelled']);

function isTaskSnapshot(value: unknown): value is TaskSnapshot {
  if (!value || typeof value !== 'object') return false;
  const task = value as Partial<TaskSnapshot>;
  const progress = task.progress as Partial<TaskProgress> | undefined;
  return typeof task.taskId === 'string'
    && typeof task.type === 'string'
    && typeof task.label === 'string'
    && typeof task.status === 'string'
    && TASK_STATUSES.has(task.status as TaskStatus)
    && Boolean(progress)
    && typeof progress?.processed === 'number'
    && typeof progress?.total === 'number'
    && typeof progress?.currentTitle === 'string'
    && (task.result === null || typeof task.result === 'object')
    && (task.error === null || typeof task.error === 'string')
    && typeof task.startedAt === 'string'
    && Number.isFinite(new Date(task.startedAt).getTime())
    && (task.completedAt === null || (typeof task.completedAt === 'string'
      && Number.isFinite(new Date(task.completedAt).getTime())));
}

export class TaskManager {
  private readonly tasks = new Map<string, Task>();
  private readonly storagePath: string;
  private readonly tempPath: string;
  private readonly now: () => Date;
  private readonly ttlMs: number;
  private readonly activityLogger: ActivityLogger;
  private initialized = false;
  private taskCounter = 0;
  private progressPersistTimer: NodeJS.Timeout | null = null;

  constructor(options: TaskManagerOptions) {
    this.storagePath = options.storagePath;
    this.tempPath = `${options.storagePath}.tmp`;
    this.now = options.now ?? (() => new Date());
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.activityLogger = options.activityLogger ?? logActivity;
  }

  initialize(): number {
    if (this.initialized) return 0;
    this.initialized = true;
    if (!fs.existsSync(this.storagePath)) return 0;

    let recoveredCount = 0;
    let changed = false;
    const recoveredTasks: Task[] = [];
    try {
      const parsed: unknown = JSON.parse(fs.readFileSync(this.storagePath, 'utf-8'));
      if (!Array.isArray(parsed)) throw new Error('任务状态文件格式错误');

      const now = this.now();
      for (const item of parsed) {
        if (!isTaskSnapshot(item)) {
          changed = true;
          continue;
        }

        const completedTime = item.completedAt ? new Date(item.completedAt).getTime() : null;
        if (item.status !== 'running' && completedTime != null && Number.isFinite(completedTime)
          && now.getTime() - completedTime > this.ttlMs) {
          changed = true;
          continue;
        }

        const task: Task = { ...item, abortController: new AbortController() };
        if (task.status === 'running') {
          task.status = 'failed';
          task.error = INTERRUPTED_TASK_ERROR;
          task.progress.currentTitle = '';
          task.completedAt = now.toISOString();
          recoveredCount++;
          recoveredTasks.push(task);
          changed = true;
        }
        this.tasks.set(task.taskId, task);
      }

      this.taskCounter = this.tasks.size;
      if (changed) this.persistNow();

      for (const task of recoveredTasks) {
        this.logTaskActivity('TASK_FAIL', task, { error: task.error, recoveredAfterRestart: true });
      }
    } catch (error) {
      console.error('[TaskManager] 读取任务状态失败:', error);
    }

    return recoveredCount;
  }

  createTask(type: string, label: string): Task {
    this.ensureInitialized();
    this.cleanup();
    const runningTask = Array.from(this.tasks.values())
      .find(task => task.type === type && task.status === 'running');
    if (runningTask) throw new TaskConflictError(runningTask);

    const now = this.now();
    this.taskCounter++;
    const task: Task = {
      taskId: `${type}-${now.toISOString().slice(0, 10).replace(/-/g, '')}-${now.getTime()}-${this.taskCounter}`,
      type,
      label,
      status: 'running',
      progress: { processed: 0, total: 0, currentTitle: '' },
      result: null,
      error: null,
      startedAt: now.toISOString(),
      completedAt: null,
      abortController: new AbortController(),
    };
    this.tasks.set(task.taskId, task);
    try {
      this.persistNow();
    } catch (error) {
      this.tasks.delete(task.taskId);
      throw error;
    }
    this.logTaskActivity('TASK_START', task);
    return task;
  }

  getTask(taskId: string): TaskSnapshot | undefined {
    this.ensureInitialized();
    const task = this.tasks.get(taskId);
    return task ? this.toSnapshot(task) : undefined;
  }

  listTasks(): TaskSnapshot[] {
    this.ensureInitialized();
    this.cleanup();
    return Array.from(this.tasks.values())
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .map(task => this.toSnapshot(task));
  }

  updateProgress(taskId: string, progress: Partial<TaskProgress>): void {
    this.ensureInitialized();
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'running') return;
    task.progress = { ...task.progress, ...progress };
    this.scheduleProgressPersist();
  }

  completeTask(taskId: string, result: ImportSummary): void {
    this.ensureInitialized();
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'running') return;
    task.status = 'completed';
    task.result = result;
    task.progress.currentTitle = '';
    task.completedAt = this.now().toISOString();
    this.persistNow();
    this.logTaskActivity('TASK_DONE', task, { result });
  }

  failTask(taskId: string, error: string): void {
    this.ensureInitialized();
    const task = this.tasks.get(taskId);
    if (!task || task.status !== 'running') return;
    task.status = 'failed';
    task.error = error;
    task.progress.currentTitle = '';
    task.completedAt = this.now().toISOString();
    this.persistNow();
    this.logTaskActivity('TASK_FAIL', task, { error });
  }

  cancelTask(taskId: string): { ok: boolean; error?: string } {
    this.ensureInitialized();
    const task = this.tasks.get(taskId);
    if (!task) return { ok: false, error: '任务不存在' };
    if (task.status !== 'running') return { ok: false, error: '任务非运行状态' };
    task.status = 'cancelled';
    task.abortController.abort();
    task.progress.currentTitle = '';
    task.completedAt = this.now().toISOString();
    this.persistNow();
    return { ok: true };
  }

  flush(): void {
    this.ensureInitialized();
    this.persistNow();
  }

  private ensureInitialized(): void {
    if (!this.initialized) this.initialize();
  }

  private cleanup(): void {
    const now = this.now().getTime();
    let changed = false;
    for (const [id, task] of this.tasks) {
      if (task.status === 'running' || !task.completedAt) continue;
      const completedTime = new Date(task.completedAt).getTime();
      if (Number.isFinite(completedTime) && now - completedTime > this.ttlMs) {
        this.tasks.delete(id);
        changed = true;
      }
    }
    if (changed) this.persistNow();
  }

  private scheduleProgressPersist(): void {
    if (this.progressPersistTimer) return;
    this.progressPersistTimer = setTimeout(() => {
      this.progressPersistTimer = null;
      this.persistNow();
    }, PROGRESS_PERSIST_DELAY_MS);
    this.progressPersistTimer.unref();
  }

  private persistNow(): void {
    if (this.progressPersistTimer) {
      clearTimeout(this.progressPersistTimer);
      this.progressPersistTimer = null;
    }
    fs.mkdirSync(path.dirname(this.storagePath), { recursive: true });
    const snapshots = Array.from(this.tasks.values()).map(task => this.toSnapshot(task));
    fs.writeFileSync(this.tempPath, JSON.stringify(snapshots, null, 2), 'utf-8');
    fs.renameSync(this.tempPath, this.storagePath);
  }

  private toSnapshot(task: Task): TaskSnapshot {
    const { abortController: _, ...snapshot } = task;
    return snapshot;
  }

  private logTaskActivity(
    action: 'TASK_START' | 'TASK_DONE' | 'TASK_FAIL',
    task: Task,
    metadata: Record<string, unknown> = {},
  ): void {
    void this.activityLogger({
      action,
      entityType: 'TASK',
      entityTitle: task.label,
      metadata: { taskId: task.taskId, taskType: task.type, ...metadata },
    });
  }
}

const taskManager = new TaskManager({ storagePath: TASK_STORAGE_PATH });

export function initializeTaskManager(): number {
  return taskManager.initialize();
}

export function createTask(type: string, label: string): Task {
  return taskManager.createTask(type, label);
}

export function getTask(taskId: string): TaskSnapshot | undefined {
  return taskManager.getTask(taskId);
}

export function listTasks(): TaskSnapshot[] {
  return taskManager.listTasks();
}

export function updateProgress(taskId: string, progress: Partial<TaskProgress>): void {
  taskManager.updateProgress(taskId, progress);
}

export function completeTask(taskId: string, result: ImportSummary): void {
  taskManager.completeTask(taskId, result);
}

export function failTask(taskId: string, error: string): void {
  taskManager.failTask(taskId, error);
}

export function cancelTask(taskId: string): { ok: boolean; error?: string } {
  return taskManager.cancelTask(taskId);
}
