# Cancel Task & Clear Douban Data — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add task cancellation (AbortController) and "clear douban data" to the TaskPanel, so users can stop long-running harvests and wipe partial imports.

**Architecture:** Backend `task-manager.ts` adds `cancelTask()` which sets status to `cancelled` and calls `abortController.abort()`. The scraper and import loops check `signal.aborted` each iteration. Frontend gets a DELETE endpoint and a clear-data endpoint, with buttons on TaskPanel cards.

**Tech Stack:** Express 5, Prisma 6, React 18, Zustand, AbortController (Node.js built-in)

---

## File Structure

| File | Responsibility |
|------|---------------|
| `express-backend/src/services/task-manager.ts` | Task model + CRUD, cancelTask, serialize without AbortController |
| `express-backend/src/services/douban-harvester/import-service.ts` | Pass signal to scraper/import loops, check aborted |
| `express-backend/src/services/douban-harvester/scraper.ts` | scrapeCollect accepts signal, checks each page iteration |
| `express-backend/src/routes/import.ts` | DELETE /tasks/:taskId, POST /douban/clear-data |
| `frontend/src/stores/taskStore.ts` | cancelTask, clearDoubanData actions, TaskStatus add cancelled |
| `frontend/src/components/TaskPanel.tsx` | Cancel button on running cards, clear-data button on cancelled/failed douban cards |

---

### Task 1: Backend — cancelTask in task-manager.ts

**Files:**
- Modify: `express-backend/src/services/task-manager.ts`

- [ ] **Step 1: Add `cancelled` to TaskStatus and `abortController` to Task interface**

In `task-manager.ts`, update the type and interface:

```ts
export type TaskStatus = 'running' | 'completed' | 'failed' | 'cancelled';

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
```

- [ ] **Step 2: Add `abortController` to `createTask`**

In the `createTask` function, add `abortController: new AbortController()` to the task object.

- [ ] **Step 3: Add `cancelTask` function**

After `failTask`, add:

```ts
export function cancelTask(taskId: string): { ok: boolean; error?: string } {
  const task = tasks.get(taskId);
  if (!task) return { ok: false, error: '任务不存在' };
  if (task.status !== 'running') return { ok: false, error: '任务非运行状态' };
  task.status = 'cancelled';
  task.abortController.abort();
  task.completedAt = new Date().toISOString();
  return { ok: true };
}
```

- [ ] **Step 4: Strip `abortController` from listTasks output**

In `listTasks()`, map tasks to strip the non-serializable field before returning:

```ts
export function listTasks(): Omit<Task, 'abortController'>[] {
  cleanup();
  return Array.from(tasks.values())
    .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    .map(({ abortController: _, ...rest }) => rest);
}
```

Also update `getTask` to return the stripped version:

```ts
export function getTask(taskId: string): Omit<Task, 'abortController'> | undefined {
  const task = tasks.get(taskId);
  if (!task) return undefined;
  const { abortController: _, ...rest } = task;
  return rest;
}
```

- [ ] **Step 5: Export `cancelTask`**

Add `cancelTask` to the exports.

- [ ] **Step 6: Commit**

```bash
git add express-backend/src/services/task-manager.ts
git commit -m "feat: add cancelTask and AbortController to task-manager"
```

---

### Task 2: Backend — Wire signal into scraper and import loops

**Files:**
- Modify: `express-backend/src/services/douban-harvester/import-service.ts`
- Modify: `express-backend/src/services/douban-harvester/scraper.ts`
- Modify: `express-backend/src/services/douban-harvester/task-manager.ts`

- [ ] **Step 1: Add signal parameter to `scrapeCollect` signature**

In `scraper.ts`, update the function signature:

```ts
export async function scrapeCollect(
  context: BrowserContext,
  progress: Progress,
  cutoffDate?: string,
  maxPages?: number,
  signal?: AbortSignal,
): Promise<{ ok: boolean; newItems: CollectItem[] }> {
```

- [ ] **Step 2: Add abort check at the top of the scrapeCollect while loop**

Right after `while (true) {` (line ~231), add:

```ts
if (signal?.aborted) {
  console.log('⏹ 爬取被用户取消');
  return { ok: false, newItems };
}
```

- [ ] **Step 3: Pass signal from import-service.ts startFullHarvestTask**

In `import-service.ts`, the `startFullHarvestTask` function currently does:

```ts
const collectResult = await scrapeCollect(context, progress, undefined, maxPages);
```

Change to:

```ts
const signal = task.abortController.signal;
const collectResult = await scrapeCollect(context, progress, undefined, maxPages, signal);
```

Also add the same `signal` extraction in `startIncrementalHarvestTask`.

- [ ] **Step 4: Add abort check in importFromJson loop**

In `importFromJson`, the `for` loop (line ~77) iterates over items. Add a signal parameter and check:

Update the function signature to accept an optional signal:

```ts
export async function importFromJson(
  dataDir?: string,
  onProgress?: (processed: number, total: number, currentTitle: string) => void,
  signal?: AbortSignal,
): Promise<ImportSummary> {
```

Add at the top of the `for` loop body:

```ts
if (signal?.aborted) {
  console.log(`⏹ 导入被用户取消，已处理 ${i}/${items.length}`);
  break;
}
```

- [ ] **Step 5: Pass signal through from startJsonImportTask and startFullHarvestTask**

In `startJsonImportTask`:

```ts
const result = await importFromJson(dataDir, (processed, total, currentTitle) => {
  updateProgress(task.taskId, { processed, total, currentTitle });
}, task.abortController.signal);
```

In both `startFullHarvestTask` and `startIncrementalHarvestTask`, update the `importFromJson` calls to pass `task.abortController.signal` as the third argument.

- [ ] **Step 6: Handle cancelled state after loops in startFullHarvestTask / startIncrementalHarvestTask**

After the `importFromJson` call in both harvest functions, add a check:

```ts
if (task.abortController.signal.aborted) {
  // cancelTask already set status to 'cancelled'
  return;
}
```

This prevents `completeTask` from overwriting the cancelled status.

Place this check right before the existing `completeTask(task.taskId, result)` calls in both functions.

- [ ] **Step 7: Commit**

```bash
git add express-backend/src/services/douban-harvester/import-service.ts express-backend/src/services/douban-harvester/scraper.ts
git commit -m "feat: wire AbortController signal into scraper and import loops"
```

---

### Task 3: Backend — DELETE and POST routes

**Files:**
- Modify: `express-backend/src/routes/import.ts`

- [ ] **Step 1: Import cancelTask and prisma**

At the top of `import.ts`, add:

```ts
import { cancelTask } from '../services/task-manager';
import { prisma } from '../config/db';
```

- [ ] **Step 2: Add DELETE /tasks/:taskId route**

After the existing `GET /tasks` route (around line 113), add:

```ts
// DELETE /api/import/tasks/:taskId — 取消任务
router.delete('/tasks/:taskId', (req: Request, res: Response) => {
  const result = cancelTask(req.params.taskId);
  if (!result.ok) {
    res.status(result.error === '任务不存在' ? 404 : 400).json({ error: result.error });
    return;
  }
  res.json({ ok: true });
});
```

- [ ] **Step 3: Add POST /douban/clear-data route**

After the DELETE route, add:

```ts
// POST /api/import/douban/clear-data — 清空豆瓣来源数据
router.post('/douban/clear-data', async (_req: Request, res: Response) => {
  try {
    const deletedMovies = await prisma.movie.deleteMany({
      where: { doubanId: { not: null } },
    });
    const deletedTvShows = await prisma.tvShow.deleteMany({
      where: { doubanId: { not: null } },
    });
    res.json({
      deletedMovies: deletedMovies.count,
      deletedTvShows: deletedTvShows.count,
    });
  } catch (ex: any) {
    res.status(500).json({ error: ex.message });
  }
});
```

- [ ] **Step 4: Commit**

```bash
git add express-backend/src/routes/import.ts
git commit -m "feat: add DELETE /tasks/:taskId and POST /douban/clear-data routes"
```

---

### Task 4: Frontend — taskStore actions + TaskStatus update

**Files:**
- Modify: `frontend/src/stores/taskStore.ts`

- [ ] **Step 1: Add `cancelled` to Task status type**

Change the Task interface status type:

```ts
status: 'running' | 'completed' | 'failed' | 'cancelled';
```

- [ ] **Step 2: Add `cancelTask` and `clearDoubanData` actions to the store**

Expand `TaskState` and the `create` callback:

```ts
interface TaskState {
  tasks: Task[];
  pollTasks: () => Promise<void>;
  cancelTask: (taskId: string) => Promise<void>;
  clearDoubanData: () => Promise<{ deletedMovies: number; deletedTvShows: number }>;
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  pollTasks: async () => {
    try {
      const tasks = await apiFetch<Task[]>('/import/tasks');
      set({ tasks });
    } catch {
      // 静默失败，下次轮询重试
    }
  },
  cancelTask: async (taskId: string) => {
    await apiFetch(`/import/tasks/${taskId}`, { method: 'DELETE' });
    await get().pollTasks();
  },
  clearDoubanData: async () => {
    const result = await apiFetch<{ deletedMovies: number; deletedTvShows: number }>('/import/douban/clear-data', { method: 'POST' });
    return result;
  },
}));
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/stores/taskStore.ts
git commit -m "feat: add cancelTask and clearDoubanData actions to taskStore"
```

---

### Task 5: Frontend — TaskPanel cancel and clear buttons

**Files:**
- Modify: `frontend/src/components/TaskPanel.tsx`

- [ ] **Step 1: Add cancel button to TaskCard for running status**

In the `TaskCard` component, inside the title row (`<div className="flex items-center justify-between mb-2">`), after the status label `<span>`, add a cancel button that only shows for `running` tasks:

```tsx
{task.status === 'running' && (
  <button
    onClick={() => useTaskStore.getState().cancelTask(task.taskId)}
    className="ml-2 text-[10px] uppercase tracking-wider text-red-400 border border-red-400/40 px-2 py-0.5 hover:bg-red-400/10 transition-colors"
  >
    CANCEL
  </button>
)}
```

- [ ] **Step 2: Add clear-data button for cancelled/failed douban-harvest tasks**

After the time display at the bottom of `TaskCard`, add:

```tsx
{(task.status === 'cancelled' || task.status === 'failed') && task.type === 'douban-harvest' && (
  <button
    onClick={async () => {
      const result = await useTaskStore.getState().clearDoubanData();
      alert(`已删除 ${result.deletedMovies} 部电影, ${result.deletedTvShows} 部剧集`);
      await useTaskStore.getState().pollTasks();
    }}
    className="mt-2 w-full text-[10px] uppercase tracking-wider text-red-400 border border-red-400/40 py-1 hover:bg-red-400/10 transition-colors"
  >
    清空豆瓣数据 _DANGER
  </button>
)}
```

- [ ] **Step 3: Add cancelled status display to TaskCard**

In the `statusLabel` variable, add the `cancelled` case:

```ts
const statusLabel = task.status === 'running'
  ? 'RUNNING'
  : task.status === 'completed'
    ? 'DONE'
    : task.status === 'cancelled'
      ? 'CANCELLED'
      : 'FAILED';
```

And update `statusColor`:

```ts
const statusColor = task.status === 'running'
  ? 'text-[var(--accent)]'
  : task.status === 'completed'
    ? 'text-green-400'
    : task.status === 'cancelled'
      ? 'text-yellow-400'
      : 'text-red-400';
```

- [ ] **Step 4: Show cancelled task result**

The completed task result section currently shows for `task.status === 'completed'`. Add `|| task.status === 'cancelled'` so cancelled tasks also show their partial result:

```tsx
{(task.status === 'completed' || task.status === 'cancelled') && task.result && (
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/TaskPanel.tsx
git commit -m "feat: add cancel and clear-douban-data buttons to TaskPanel"
```

---

### Task 6: Verify end-to-end

- [ ] **Step 1: Start backend and frontend**

```bash
# Backend
cd express-backend && npm run dev

# Frontend
cd frontend && npm run dev
```

- [ ] **Step 2: Trigger a JSON import and verify TaskPanel shows it**

```bash
curl -s -X POST http://localhost:18889/api/import/douban-harvest?mode=json | python -m json.tool
```

Open TaskPanel, verify task appears with DONE status.

- [ ] **Step 3: Test cancel endpoint**

```bash
# Create a task (it will complete quickly for JSON mode, but we test the API shape)
curl -s -X POST http://localhost:18889/api/import/douban-harvest?mode=json

# Cancel a non-existent task
curl -s -X DELETE http://localhost:18889/api/import/tasks/nonexistent | python -m json.tool
# Expected: { "error": "任务不存在" }

# Cancel a completed task
# (use taskId from step above)
curl -s -X DELETE http://localhost:18889/api/import/tasks/<taskId> | python -m json.tool
# Expected: { "error": "任务非运行状态" }
```

- [ ] **Step 4: Test clear-data endpoint**

```bash
curl -s -X POST http://localhost:18889/api/import/douban/clear-data | python -m json.tool
# Expected: { "deletedMovies": N, "deletedTvShows": M }
```

- [ ] **Step 5: Verify TaskPanel UI**

Open the app in a browser, click TASKS button, verify:
- Running task shows CANCEL button
- Cancelled task shows yellow CANCELLED label
- Cancelled/failed douban-harvest task shows "清空豆瓣数据 _DANGER" button

- [ ] **Step 6: Final commit if any fixes needed**