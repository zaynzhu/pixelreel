import { create } from 'zustand';
import { apiFetch } from '../api';

export interface Task {
  taskId: string;
  type: string;
  label: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  progress: { processed: number; total: number; currentTitle: string };
  result: { total: number; imported: number; skipped: number; errors: string[] } | null;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}

interface TaskState {
  tasks: Task[];
  pollError: string | null;
  pollTasks: () => Promise<void>;
  cancelTask: (taskId: string) => Promise<void>;
}

let pollTimer: ReturnType<typeof setInterval> | null = null;
let latestTaskPollRequest = 0;
let activeTaskPollRequest: number | null = null;

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  pollError: null,
  pollTasks: async () => {
    if (activeTaskPollRequest !== null) return;
    const requestId = ++latestTaskPollRequest;
    activeTaskPollRequest = requestId;
    try {
      const tasks = await apiFetch<Task[]>('/import/tasks');
      if (requestId !== latestTaskPollRequest) return;
      set({ tasks, pollError: null });
    } catch (reason) {
      if (requestId !== latestTaskPollRequest) return;
      set({ pollError: reason instanceof Error ? reason.message : '' });
    } finally {
      if (activeTaskPollRequest === requestId) activeTaskPollRequest = null;
    }
  },
  cancelTask: async (taskId: string) => {
    await apiFetch(`/import/tasks/${taskId}`, { method: 'DELETE' });
    await get().pollTasks();
  },
}));

export function startPolling() {
  if (pollTimer) return;
  const { pollTasks } = useTaskStore.getState();
  pollTasks();
  pollTimer = setInterval(pollTasks, 2000);
}

export function stopPolling() {
  latestTaskPollRequest++;
  activeTaskPollRequest = null;
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
