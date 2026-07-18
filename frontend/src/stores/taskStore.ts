import { create } from 'zustand';
import { apiFetch } from '../api';

export interface Task {
  taskId: string;
  type: string;
  label: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  progress: { processed: number; total: number; currentTitle: string };
  result: { total: number; imported: number; updated?: number; skipped: number; errors: string[] } | null;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}

interface TaskState {
  tasks: Task[];
  cancellingTaskIds: string[];
  initialized: boolean;
  pollError: string | null;
  pollTasks: () => Promise<void>;
  cancelTask: (taskId: string) => Promise<void>;
}

let pollTimer: ReturnType<typeof setInterval> | null = null;
let latestTaskPollRequest = 0;
let activeTaskPollPromise: Promise<void> | null = null;
let taskPollQueued = false;

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  cancellingTaskIds: [],
  initialized: false,
  pollError: null,
  pollTasks: async () => {
    if (activeTaskPollPromise) {
      taskPollQueued = true;
      await activeTaskPollPromise;
      return;
    }

    const pollUntilCurrent = async () => {
      do {
        taskPollQueued = false;
        const requestId = ++latestTaskPollRequest;
        try {
          const tasks = await apiFetch<Task[]>('/import/tasks');
          if (requestId !== latestTaskPollRequest) continue;
          set({ tasks, initialized: true, pollError: null });
        } catch (reason) {
          if (requestId !== latestTaskPollRequest) continue;
          set({ pollError: reason instanceof Error ? reason.message : '' });
        }
      } while (taskPollQueued);
    };

    const pollPromise = pollUntilCurrent();
    activeTaskPollPromise = pollPromise;
    try {
      await pollPromise;
    } finally {
      if (activeTaskPollPromise === pollPromise) activeTaskPollPromise = null;
    }
  },
  cancelTask: async (taskId: string) => {
    if (get().cancellingTaskIds.includes(taskId)) return;
    set(state => ({ cancellingTaskIds: [...state.cancellingTaskIds, taskId] }));
    try {
      await apiFetch(`/import/tasks/${taskId}`, { method: 'DELETE' });
      await get().pollTasks();
    } finally {
      set(state => ({
        cancellingTaskIds: state.cancellingTaskIds.filter(id => id !== taskId),
      }));
    }
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
  taskPollQueued = false;
  useTaskStore.setState({ initialized: false, cancellingTaskIds: [] });
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
