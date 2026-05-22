# Timeline & Library 游标分页设计

## Context

当前 `GET /api/library` 对 movie/game/tv_show 三张表做无条件 `findMany()` 全量返回。4286+ 条豆瓣数据已导入，数据量会持续增长。全量加载导致首屏慢、内存占用高、滚动卡顿。需要改为游标分页 + 无限滚动。

## Decisions

- **分页策略**：游标分页（cursor-based pagination），用 `createdAt` 作游标字段
- **前端加载**：无限滚动（IntersectionObserver 触发加载下一批）
- **影响范围**：TimelinePage 和 LibraryPage 一起改

## Backend Changes

### 1. LibraryService — listRecords 改为游标分页

**当前**：无条件 `findMany()` 三张表，合并排序后全量返回。

**改为**：接受 `cursor?: string` 和 `limit: number` 参数。

```ts
listRecords(options?: { cursor?: string; limit?: number })
```

逻辑：
- `limit` 默认 50，上限 200
- `cursor` 是上一页最后一条记录的 `createdAt`（ISO 字符串，精确到秒）
- 三张表分别查询 `createdAt < cursor`（降序）或无条件（首页），`take limit + 1`（多取一条判断是否有下一页）
- 合并三表结果，按 `createdAt DESC` 全局排序，取前 `limit` 条
- 返回 `{ records, nextCursor }`，`nextCursor` 为最后一条的 `createdAt`（如果本次结果不足 limit 条则为 null）

**注意**：cursor 需包含 createdAt 精度到毫秒，但 MySQL DateTime 只到秒。如果同一秒有多条记录，需要加 `id` 作为 tiebreaker。实际方案：cursor 格式为 `{createdAt}__{id}`，查询时 `(createdAt < cursorTime) OR (createdAt = cursorTime AND id < cursorId)`。

### 2. Library 路由 — 更新 GET /api/library

```ts
// GET /api/library?cursor=2026-05-18T00:00:00.000Z__123&limit=50
router.get('/', async (req, res) => {
  const cursor = req.query.cursor as string | undefined;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const result = await listRecords({ cursor, limit });
  res.json(result);
});
```

返回格式：
```json
{
  "records": [...],
  "nextCursor": "2026-05-01T00:00:00.000Z__456"  // null 表示没有更多
}
```

PATCH 接口不变。

## Frontend Changes

### 3. libraryStore — 改为分页模式

**当前**：`records: LibraryRecord[]` 一次性加载。

**改为**：
```ts
interface LibraryState {
  records: LibraryRecord[];
  nextCursor: string | null;
  loading: boolean;
  loadingMore: boolean;  // 加载更多时 true，初始加载时 loading=true
  error: string | null;
  fetchRecords: () => Promise<void>;       // 首次加载（无 cursor）
  fetchMore: () => Promise<void>;           // 加载下一页
  hasMore: boolean;                        // nextCursor !== null
  // updateRecord 不变
}
```

- `fetchRecords()`：清空 records，调 `GET /api/library`（无 cursor），替换 records + nextCursor
- `fetchMore()`：调 `GET /api/library?cursor=xxx&limit=50`，**追加**到 records，更新 nextCursor

### 4. TimelinePage — 无限滚动

- 移除 `useEffect(() => fetchRecords(), [])` 后的同步全量加载
- 首次渲染调 `fetchRecords()`
- IntersectionObserver 监听底部哨兵元素，触发 `fetchMore()`
- 加载中显示骨架/加载提示
- 年份筛选器基于当前已加载 records 计算，随着滚动动态增加可选年份
- `hasMore` 为 false 时隐藏加载触发器和加载提示
- **年份筛选是前端过滤**：只筛选已加载的数据，不触发新的后端请求

### 5. LibraryPage — 无限滚动

- 同 TimelinePage，改为无限滚动
- 首次加载 + 滚动加载更多
- 保持现有的筛选、排序、编辑功能

## Files Changed

| File | Change |
|------|--------|
| `express-backend/src/services/LibraryService.ts` | `listRecords` 改为游标分页 |
| `express-backend/src/routes/library.ts` | GET /api/library 加 cursor/limit 参数 |
| `express-backend/src/dto/library.ts` | 新增 `PaginatedLibraryResponse` 类型 |
| `frontend/src/stores/libraryStore.ts` | 改为分页模式，新增 fetchMore/hasMore/loadingMore |
| `frontend/src/pages/TimelinePage.tsx` | 无限滚动 + IntersectionObserver |
| `frontend/src/pages/LibraryPage.tsx` | 无限滚动 |

## Verification

1. 启动后端 `npm run dev`，启动前端 `npm run dev`
2. 打开 TimelinePage，验证首屏只加载 50 条，滚到底部自动加载下一批
3. 打开 LibraryPage，验证同样行为
4. 验证年份筛选器随滚动增加新年份
5. 验证 `nextCursor: null` 时不再触发加载
6. 验证 PATCH 更新记录后本地状态正确更新
7. 验证刷新页面后重新从首页开始加载