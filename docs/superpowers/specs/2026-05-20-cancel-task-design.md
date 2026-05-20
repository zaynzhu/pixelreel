# Cancel Task & Clear Douban Data — Design Spec

## Context

TaskPanel 已实现任务创建和进度展示，但 running 状态的任务无法取消。全量爬取耗时 20+ 分钟，失败或手动取消后保留的部分数据无意义（无法断点续传），用户需要：

1. 取消正在运行的爬取任务（全量/增量）
2. 清除所有豆瓣来源数据，方便重来

## Decisions

- **取消策略**：保留已写入 DB 的数据，不回滚（已入库的 doubanId 去重自动跳过）
- **取消范围**：仅爬取任务（全量/增量），JSON 导入几秒完成不需要取消
- **清除数据**：删除所有 `doubanId IS NOT NULL` 的 Movie/TvShow 记录，不追踪"本次任务写了哪些"
- **实现方式**：AbortController（Node.js 标准 API，可与 fetch/Playwright 配合）

## Backend Changes

### 1. task-manager.ts — 新增 cancelTask + AbortController

Task 接口新增 `abortController` 字段（内部使用，不序列化到 API 响应）：

```ts
type TaskStatus = 'running' | 'completed' | 'failed' | 'cancelled'

interface Task {
  // ...existing fields...
  abortController: AbortController  // 内部字段
}
```

新增函数：

```ts
cancelTask(taskId: string): void
```

- 校验 task 存在且 `status === 'running'`
- 设 `task.status = 'cancelled'`
- 调 `task.abortController.abort()`
- 设 `task.completedAt = now()`

`listTasks()` 返回时剥离 `abortController`（不可序列化），或在序列化时用 `.map()` 过滤。

### 2. 爬虫循环加中断检查

`import-service.ts` 的 `startFullHarvestTask` 和 `startIncrementalHarvestTask`：

- 从 task 取 `signal = task.abortController.signal`
- 在 `scrapeCollect` 和 `importFromJson` 的循环中每个迭代开头检查 `if (signal.aborted) break`
- 退出循环后检查 `signal.aborted`，如是则不调 `completeTask`（cancelTask 已设置状态）

`scraper.ts` 的 `scrapeCollect` 也需要在每页爬取前检查 signal，如果 aborted 则提前返回。

### 3. 路由 — DELETE + POST

`import.ts` 新增：

```ts
// DELETE /api/import/tasks/:taskId — 取消任务
router.delete('/tasks/:taskId', (req, res) => {
  const result = cancelTask(req.params.taskId);
  // 200: { ok: true } | 404: { error: '任务不存在' } | 400: { error: '任务非运行状态' }
});

// POST /api/import/douban/clear-data — 清空豆瓣数据
router.post('/douban/clear-data', async (req, res) => {
  // DELETE Movie WHERE doubanId IS NOT NULL
  // DELETE TvShow WHERE doubanId IS NOT NULL
  // 返回 { deletedMovies: number, deletedTvShows: number }
});
```

## Frontend Changes

### 4. taskStore.ts — 新增 cancelTask 和 clearDoubanData

```ts
cancelTask: async (taskId: string) => {
  await apiFetch(`/import/tasks/${taskId}`, { method: 'DELETE' });
  // 刷新任务列表
  await get().pollTasks();
}

clearDoubanData: async () => {
  const result = await apiFetch('/import/douban/clear-data', { method: 'POST' });
  return result;
}
```

### 5. TaskPanel.tsx — 卡片按钮

**running 状态**：显示红色"取消"按钮

```
[豆瓣全量导入]                    [CANCEL]
[████████████░░░░░] 1800/2421
正在爬取：星际穿越
```

**cancelled/failed 状态**：如果 `task.type === 'douban-harvest'`，显示"清空豆瓣数据"按钮

```
[豆瓣全量导入]                  [CANCELLED]
清空豆瓣数据
```

按钮样式：赛博朋克主题，红色危险按钮 `_DANGER`。

### 6. Task type 更新

`taskStore.ts` 的 Task 接口新增：

```ts
status: 'running' | 'completed' | 'failed' | 'cancelled'
```

## Files Changed

| File | Change |
|------|--------|
| `express-backend/src/services/task-manager.ts` | 新增 `cancelTask`，Task 加 `abortController`，`TaskStatus` 加 `cancelled` |
| `express-backend/src/services/douban-harvester/import-service.ts` | 循环加 `signal.aborted` 检查 |
| `express-backend/src/services/douban-harvester/scraper.ts` | `scrapeCollect` 加 `signal` 参数，每页前检查 |
| `express-backend/src/routes/import.ts` | 新增 `DELETE /tasks/:taskId`，`POST /douban/clear-data` |
| `frontend/src/stores/taskStore.ts` | 新增 `cancelTask`，`clearDoubanData`，Task status 加 `cancelled` |
| `frontend/src/components/TaskPanel.tsx` | running 卡片加取消按钮，cancelled/failed 卡片加清空豆瓣数据按钮 |