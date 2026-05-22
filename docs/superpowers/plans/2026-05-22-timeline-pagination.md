# Timeline & Library 游标分页 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Library API 从全量返回改为游标分页，前端 Timeline 和 Library 页面改为无限滚动加载。

**Architecture:** 后端 `GET /api/library` 支持 `cursor` + `limit` 参数，返回 `{ records, nextCursor }`。cursor 格式 `createdAt__id`（解决同一秒多条记录的 tiebreaker 问题）。前端用 IntersectionObserver 触发 `fetchMore()` 追加数据。

**Tech Stack:** Express 5, Prisma 6, React 18, Zustand, IntersectionObserver

---

## File Structure

| File | Responsibility |
|------|---------------|
| `express-backend/src/dto/library.ts` | 新增 `PaginatedLibraryResponse` 类型 |
| `express-backend/src/services/LibraryService.ts` | `listRecords` 改为游标分页查询 |
| `express-backend/src/routes/library.ts` | GET /api/library 加 cursor/limit 参数 |
| `frontend/src/stores/libraryStore.ts` | 改为分页模式，新增 fetchMore/hasMore/loadingMore |
| `frontend/src/pages/TimelinePage.tsx` | 无限滚动 IntersectionObserver |
| `frontend/src/pages/LibraryPage.tsx` | 无限滚动 IntersectionObserver |

---

### Task 1: 后端 — DTO 新增 PaginatedLibraryResponse

**Files:**
- Modify: `express-backend/src/dto/library.ts`

- [ ] **Step 1: 新增 PaginatedLibraryResponse 接口**

在 `library.ts` 文件末尾添加：

```ts
export interface PaginatedLibraryResponse {
  records: LibraryRecordResponse[];
  nextCursor: string | null;
}
```

- [ ] **Step 2: Commit**

```bash
git add express-backend/src/dto/library.ts
git commit -m "feat: add PaginatedLibraryResponse type"
```

---

### Task 2: 后端 — LibraryService 游标分页

**Files:**
- Modify: `express-backend/src/services/LibraryService.ts`

- [ ] **Step 1: 修改 listRecords 函数签名和实现**

将 `listRecords()` 改为接受游标分页参数：

```ts
export interface ListRecordsOptions {
  cursor?: string;
  limit?: number;
}

// 解析 cursor 格式 "createdAt__id"
function parseCursor(cursor: string): { createdAt: Date; id: number } | null {
  const parts = cursor.split('__');
  if (parts.length !== 2) return null;
  const createdAt = new Date(parts[0]);
  const id = Number(parts[1]);
  if (isNaN(createdAt.getTime()) || isNaN(id)) return null;
  return { createdAt, id };
}

export async function listRecords(
  options?: ListRecordsOptions,
): Promise<{ records: LibraryRecordResponse[]; nextCursor: string | null }> {
  const limit = Math.min(options?.limit ?? 50, 200);
  const cursorObj = options?.cursor ? parseCursor(options.cursor) : undefined;

  // 构建各表的查询条件：cursor 之后的记录
  const cursorFilter = cursorObj
    ? {
        OR: [
          { createdAt: { lt: cursorObj.createdAt } },
          { createdAt: { equals: cursorObj.createdAt }, id: { lt: cursorObj.id } },
        ],
      }
    : {};

  const [movies, games, tvShows] = await Promise.all([
    prisma.movie.findMany({ where: cursorFilter, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
    prisma.game.findMany({ where: cursorFilter, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
    prisma.tvShow.findMany({ where: cursorFilter, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
  ]);

  const allRecords: LibraryRecordResponse[] = [
    ...movies.map(toMovieRecord),
    ...games.map(toGameRecord),
    ...tvShows.map(toTvShowRecord),
  ];

  // 合并排序：createdAt DESC, id DESC
  allRecords.sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    if (tb !== ta) return tb - ta;
    return b.id - a.id;
  });

  // 取前 limit 条，判断是否有下一页
  const records = allRecords.slice(0, limit);
  const hasMore = allRecords.length > limit;
  const lastRecord = records[records.length - 1];
  const nextCursor = hasMore && lastRecord
    ? `${lastRecord.createdAt}__${lastRecord.id}`
    : null;

  return { records, nextCursor };
}
```

注意：`cursorFilter` 的 `OR` 条件确保同一秒内 `id` 较小的记录排在后面（因为我们是降序，要取比 cursor 更早的记录）。

- [ ] **Step 2: Commit**

```bash
git add express-backend/src/services/LibraryService.ts
git commit -m "feat: add cursor-based pagination to listRecords"
```

---

### Task 3: 后端 — Library 路由更新

**Files:**
- Modify: `express-backend/src/routes/library.ts`

- [ ] **Step 1: 更新 GET /api/library 路由支持 cursor/limit**

将现有的 `GET /` 路由从全量返回改为分页返回：

```ts
import { Router, Request, Response } from 'express';
import { listRecords, updateRecord } from '../services/LibraryService';

const router = Router();

// GET /api/library — 游标分页混合列表
router.get('/', async (req: Request, res: Response) => {
  const cursor = req.query.cursor as string | undefined;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const result = await listRecords({ cursor, limit });
  res.json(result);
});

// PATCH /api/library/:category/:id — 更新记录状态/评分/短评
router.patch('/:category/:id', async (req: Request, res: Response) => {
  const category = req.params.category as string;
  const id = Number(req.params.id);
  const request = req.body;

  try {
    const result = await updateRecord(category, id, {
      status: request.status,
      rating: request.rating,
      shortReview: request.shortReview,
    });
    res.json(result);
  } catch (err: any) {
    const status = err.status || 400;
    res.status(status).json({ error: err.message });
  }
});

export default router;
```

- [ ] **Step 2: Commit**

```bash
git add express-backend/src/routes/library.ts
git commit -m "feat: update GET /api/library to support cursor/limit params"
```

---

### Task 4: 前端 — libraryStore 分页模式

**Files:**
- Modify: `frontend/src/stores/libraryStore.ts`

- [ ] **Step 1: 改造 store 为分页模式**

将 `libraryStore.ts` 完整替换为：

```ts
import { create } from "zustand";
import type { LibraryRecord, LibraryRecordUpdateInput } from "../types/library";
import { apiFetch } from "../api";

interface PaginatedResponse {
  records: LibraryRecord[];
  nextCursor: string | null;
}

type LibraryState = {
  records: LibraryRecord[];
  nextCursor: string | null;
  loading: boolean;
  loadingMore: boolean;
  saving: boolean;
  error: string | null;
  fetchRecords: () => Promise<void>;
  fetchMore: () => Promise<void>;
  updateRecord: (
    category: LibraryRecord["category"],
    id: number,
    payload: LibraryRecordUpdateInput
  ) => Promise<LibraryRecord | null>;
};

export const useLibraryStore = create<LibraryState>((set, get) => ({
  records: [],
  nextCursor: null,
  loading: false,
  loadingMore: false,
  saving: false,
  error: null,

  fetchRecords: async () => {
    set({ loading: true, error: null });
    try {
      const payload = await apiFetch<PaginatedResponse>("/library");
      set({ records: payload.records, nextCursor: payload.nextCursor, loading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "获取记录库失败",
        loading: false,
      });
    }
  },

  fetchMore: async () => {
    const { nextCursor, loadingMore } = get();
    if (!nextCursor || loadingMore) return;
    set({ loadingMore: true });
    try {
      const payload = await apiFetch<PaginatedResponse>(
        `/library?cursor=${encodeURIComponent(nextCursor)}&limit=50`
      );
      set({
        records: [...get().records, ...payload.records],
        nextCursor: payload.nextCursor,
        loadingMore: false,
      });
    } catch (err) {
      set({ loadingMore: false });
    }
  },

  updateRecord: async (category, id, payload) => {
    set({ saving: true, error: null });
    try {
      const updated = await apiFetch<LibraryRecord>(`/library/${category}/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      set({
        records: get().records.map((record) =>
          record.id === id && record.category === category ? updated : record
        ),
        saving: false,
      });
      return updated;
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "保存失败",
        saving: false,
      });
      return null;
    }
  },
}));
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/stores/libraryStore.ts
git commit -m "feat: add cursor-based pagination to libraryStore"
```

---

### Task 5: 前端 — TimelinePage 无限滚动

**Files:**
- Modify: `frontend/src/pages/TimelinePage.tsx`

- [ ] **Step 1: 在 TimelinePage 中添加 IntersectionObserver 和无限滚动逻辑**

在 `TimelinePage` 组件中：

1. 从 store 解构新增 `fetchMore`, `loadingMore`, `hasMore`（从 `nextCursor !== null` 计算）
2. 添加 `useRef` 创建哨兵元素引用
3. 添加 `useEffect` 设置 IntersectionObserver 监听哨兵元素
4. 在 monthGroups 列表底部添加哨兵元素和加载提示

具体改动：

在组件顶部解构中添加：
```tsx
const { records, loading, error, fetchRecords, fetchMore, loadingMore, nextCursor } = useLibraryStore();
```

添加哨兵 ref 和 Observer：
```tsx
const sentinelRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  const sentinel = sentinelRef.current;
  if (!sentinel || !nextCursor) return;
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting && nextCursor && !loadingMore) {
        void fetchMore();
      }
    },
    { rootMargin: '200px' },
  );
  observer.observe(sentinel);
  return () => observer.disconnect();
}, [nextCursor, loadingMore, fetchMore]);
```

在 `monthGroups` 渲染之后、`</div>` 结束之前添加哨兵和加载提示：
```tsx
{/* 无限滚动哨兵 */}
{nextCursor && (
  <div ref={sentinelRef} className="h-1" />
)}
{loadingMore && (
  <div className="text-center text-[10px] text-[var(--muted)] uppercase tracking-widest py-8">
    LOADING_MORE...
  </div>
)}
```

- [ ] **Step 2: 移除旧的全量加载逻辑**

确保 `fetchRecords` 只在首次调用（已有 `useEffect`），不要在每次渲染时都调用。

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/TimelinePage.tsx
git commit -m "feat: add infinite scroll to TimelinePage"
```

---

### Task 6: 前端 — LibraryPage 无限滚动

**Files:**
- Modify: `frontend/src/pages/LibraryPage.tsx`

- [ ] **Step 1: 在 LibraryPage 中添加 IntersectionObserver**

与 TimelinePage 类似，添加 `fetchMore`, `loadingMore`, `nextCursor` 解构，哨兵 ref，IntersectionObserver。

在 `LibraryPage` 组件解构中改为：
```tsx
const { records, loading, loadingMore, saving, error, fetchRecords, fetchMore, nextCursor } = useLibraryStore();
```

添加哨兵 ref 和 Observer：
```tsx
const sentinelRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  const sentinel = sentinelRef.current;
  if (!sentinel || !nextCursor) return;
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting && nextCursor && !loadingMore) {
        void fetchMore();
      }
    },
    { rootMargin: '200px' },
  );
  observer.observe(sentinel);
  return () => observer.disconnect();
}, [nextCursor, loadingMore, fetchMore]);
```

在记录列表底部（`filteredRecords.map(...)` 之后）添加：
```tsx
{/* 无限滚动哨兵 */}
{nextCursor && (
  <div ref={sentinelRef} className="h-1" />
)}
{loadingMore && (
  <div className="text-center text-[10px] text-[var(--muted)] uppercase tracking-widest py-8">
    LOADING_MORE...
  </div>
)}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/LibraryPage.tsx
git commit -m "feat: add infinite scroll to LibraryPage"
```

---

### Task 7: 端到端验证

- [ ] **Step 1: 启动后端和前端**

```bash
cd express-backend && npm run dev
cd frontend && npm run dev
```

- [ ] **Step 2: 验证 API 分页**

```bash
# 首页（无 cursor）
curl -s "http://localhost:18889/api/library?limit=5" | python3 -m json.tool | head -20

# 用返回的 nextCursor 请求下一页
# 将上面返回的 nextCursor 值替换到下面
curl -s "http://localhost:18889/api/library?cursor=NEXT_CURSOR_VALUE&limit=5" | python3 -m json.tool | head -20
```

验证：首次返回的 records 为 5 条，nextCursor 不为 null；用 nextCursor 请求返回下一批 5 条。

- [ ] **Step 3: 验证前端无限滚动**

在浏览器打开 `http://localhost:18888/timeline`，验证：
- 首屏只加载 50 条记录
- 滚动到底部自动加载下一批
- 年份筛选器随滚动增加新年份
- 加载完毕后不再触发请求

打开 `http://localhost:18888/library`，验证：
- 首屏只加载 50 条记录
- 滚动到底部自动加载更多
- 筛选和编辑功能正常

- [ ] **Step 4: 最终 commit（如有修复）**