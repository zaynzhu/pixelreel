# Activity Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an activity log system that records all data changes, task events, and supports undo/item-level history.

**Architecture:** Prisma middleware auto-captures Movie/TvShow/Game CRUD operations into an `activity_log` table. Task events are logged manually in task-manager. A new `/api/activity` route provides cursor-paginated reads with filters and an undo endpoint. Frontend adds an ActivityPage with timeline, filters, and item-level history integration.

**Tech Stack:** Prisma 6 middleware, Express 5, Zustand, React 18, MySQL JSON columns

---

### Task 1: Prisma schema + DB migration

**Files:**
- Modify: `express-backend/prisma/schema.prisma`

- [ ] **Step 1: Add ActivityLog model to schema**

Append after the `Game` model (after line 140):

```prisma
model ActivityLog {
  id           BigInt   @id @default(autoincrement())
  action       String   @db.VarChar(20)
  entityType   String   @db.VarChar(20) @map("entity_type")
  entityId     BigInt?  @map("entity_id")
  entityTitle  String   @db.VarChar(255) @map("entity_title")
  oldValues    Json?    @map("old_values")
  newValues    Json?    @map("new_values")
  metadata     Json?
  createdAt    DateTime @default(now()) @map("created_at") @db.DateTime(0)

  @@index([createdAt], map: "idx_activity_created")
  @@index([entityType, entityId], map: "idx_activity_entity")
  @@map("activity_log")
}
```

- [ ] **Step 2: Generate Prisma client and push to DB**

```bash
cd express-backend && npx prisma generate && npx prisma db push
```

Expected: "Your database is now in sync with your Prisma schema"

- [ ] **Step 3: Verify table exists**

```bash
cd express-backend && DATABASE_URL="mysql://root:password@192.168.50.233:13306/pixelreel" node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.activityLog.findMany({ take: 1 }).then(r => console.log('OK, rows:', r.length)).finally(() => prisma.\$disconnect());
"
```

Expected: `OK, rows: 0`

- [ ] **Step 4: Commit**

```bash
git add express-backend/prisma/schema.prisma express-backend/prisma/schema.prisma
git commit -m "feat: add ActivityLog model to Prisma schema"
```

---

### Task 2: Activity log service

**Files:**
- Create: `express-backend/src/services/activity-log.ts`

- [ ] **Step 1: Create the service**

```typescript
import { prisma } from '../config/db'

// 排除的系统字段，不记录到变更详情
const SYSTEM_FIELDS = new Set(['id', 'createdAt', 'updatedAt'])

export type ActivityAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'TASK_START' | 'TASK_DONE' | 'TASK_FAIL' | 'UNDO'
export type EntityType = 'MOVIE' | 'TV_SHOW' | 'GAME' | 'TASK'

interface LogActivityParams {
  action: ActivityAction
  entityType: EntityType
  entityId?: bigint | number | null
  entityTitle: string
  oldValues?: Record<string, unknown> | null
  newValues?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
}

export async function logActivity(params: LogActivityParams): Promise<void> {
  try {
    await prisma.activityLog.create({
      data: {
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId != null ? BigInt(params.entityId) : null,
        entityTitle: params.entityTitle,
        oldValues: params.oldValues ?? undefined,
        newValues: params.newValues ?? undefined,
        metadata: params.metadata ?? undefined,
      },
    })
  } catch (err) {
    // 日志写入失败不应阻断业务流程
    console.error('[ActivityLog] 写入失败:', err)
  }
}

/**
 * 从 Prisma 模型数据中提取可记录的字段（排除系统字段和 null 值）
 */
export function extractRecordableFields(data: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    if (SYSTEM_FIELDS.has(key)) continue
    if (value === undefined) continue
    result[key] = typeof value === 'bigint' ? value.toString() : value
  }
  return result
}

/**
 * 对比新旧数据，只返回实际变更的字段
 */
export function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): { oldVals: Record<string, unknown>; newVals: Record<string, unknown> } {
  const oldVals: Record<string, unknown> = {}
  const newVals: Record<string, unknown> = {}

  for (const key of Object.keys(after)) {
    if (SYSTEM_FIELDS.has(key)) continue
    const oldVal = before[key]
    const newVal = after[key]
    // 跳过未变更的字段
    if (oldVal === newVal) continue
    // BigInt 比较
    if (typeof oldVal === 'bigint' && typeof newVal === 'bigint' && oldVal === newVal) continue

    oldVals[key] = typeof oldVal === 'bigint' ? oldVal?.toString() : oldVal
    newVals[key] = typeof newVal === 'bigint' ? newVal?.toString() : newVal
  }

  return { oldVals, newVals }
}
```

- [ ] **Step 2: Commit**

```bash
git add express-backend/src/services/activity-log.ts
git commit -m "feat: add activity log service with diffFields helper"
```

---

### Task 3: Prisma middleware for auto-capturing changes

**Files:**
- Create: `express-backend/src/middlewares/activity-log.ts`

- [ ] **Step 1: Create the middleware**

```typescript
import { Prisma } from '@prisma/client'
import { logActivity, extractRecordableFields, diffFields } from '../services/activity-log'
import type { EntityType } from '../services/activity-log'

// 需要拦截的模型名 → 实体类型映射
const MODEL_ENTITY_MAP: Record<string, EntityType> = {
  Movie: 'MOVIE',
  TvShow: 'TV_SHOW',
  Game: 'GAME',
}

// 用于 update 操作前查询旧数据的 Prisma delegate 映射（在 $use 注册时注入）
type PrismaDelegates = {
  movie: { findUnique: (args: { where: { id: bigint }; select?: Record<string, boolean> }) => Promise<Record<string, unknown> | null> }
  tvShow: { findUnique: (args: { where: { id: bigint }; select?: Record<string, boolean> }) => Promise<Record<string, unknown> | null> }
  game: { findUnique: (args: { where: { id: bigint }; select?: Record<string, boolean> }) => Promise<Record<string, unknown> | null> }
}

const TABLE_NAME_MAP: Record<string, keyof PrismaDelegates> = {
  Movie: 'movie',
  TvShow: 'tvShow',
  Game: 'game',
}

export function registerActivityLogMiddleware(delegates: PrismaDelegates) {
  Prisma.defineExtension((client) => {
    return client.$extends({
      query: {
        $allModels: {
          async create({ model, args, query }) {
            const entityType = MODEL_ENTITY_MAP[model]
            if (!entityType) return query(args)

            const result = await query(args)
            const data = extractRecordableFields(result as Record<string, unknown>)

            await logActivity({
              action: 'CREATE',
              entityType,
              entityId: (result as Record<string, unknown>).id as bigint,
              entityTitle: (result as Record<string, unknown>).title as string ?? '',
              newValues: data,
            })

            return result
          },

          async update({ model, args, query }) {
            const entityType = MODEL_ENTITY_MAP[model]
            if (!entityType) return query(args)

            // 查询旧数据
            const tableName = TABLE_NAME_MAP[model]
            const entityId = args.where?.id as bigint
            let oldRecord: Record<string, unknown> | null = null
            if (entityId && tableName) {
              oldRecord = await delegates[tableName].findUnique({
                where: { id: entityId },
              })
            }

            const result = await query(args)

            // 对比变更
            if (oldRecord && args.data) {
              const newData = extractRecordableFields(result as Record<string, unknown>)
              const oldData = extractRecordableFields(oldRecord)
              const { oldVals, newVals } = diffFields(oldData, newData)

              if (Object.keys(newVals).length > 0) {
                await logActivity({
                  action: 'UPDATE',
                  entityType,
                  entityId,
                  entityTitle: (oldRecord.title as string) ?? '',
                  oldValues: oldVals,
                  newValues: newVals,
                })
              }
            }

            return result
          },

          async delete({ model, args, query }) {
            const entityType = MODEL_ENTITY_MAP[model]
            if (!entityType) return query(args)

            // 删除前查询旧数据
            const tableName = TABLE_NAME_MAP[model]
            const entityId = args.where?.id as bigint
            let oldRecord: Record<string, unknown> | null = null
            if (entityId && tableName) {
              oldRecord = await delegates[tableName].findUnique({
                where: { id: entityId },
              })
            }

            const result = await query(args)

            if (oldRecord) {
              await logActivity({
                action: 'DELETE',
                entityType,
                entityId,
                entityTitle: (oldRecord.title as string) ?? '',
                oldValues: extractRecordableFields(oldRecord),
              })
            }

            return result
          },
        },
      },
    })
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add express-backend/src/middlewares/activity-log.ts
git commit -m "feat: add Prisma middleware for auto-capturing data changes"
```

---

### Task 4: Register middleware in Express app

**Files:**
- Modify: `express-backend/src/index.ts`

- [ ] **Step 1: Import and register middleware**

Read the current `express-backend/src/index.ts` first. Find where the Prisma client is used (after `import { prisma } from './config/db'` or similar). Add after the Prisma client is initialized:

```typescript
import { registerActivityLogMiddleware } from './middlewares/activity-log'

// 在 Prisma 客户端上注册活动日志中间件
registerActivityLogMiddleware({
  movie: prisma.movie,
  tvShow: prisma.tvShow,
  game: prisma.game,
})
```

Place this **before** `app.listen()` and **after** `prisma` is imported.

- [ ] **Step 2: Commit**

```bash
git add express-backend/src/index.ts
git commit -m "feat: register activity log Prisma middleware"
```

---

### Task 5: Add activity logging to task-manager

**Files:**
- Modify: `express-backend/src/services/task-manager.ts`

- [ ] **Step 1: Import logActivity**

Add at the top of `task-manager.ts`:

```typescript
import { logActivity } from './activity-log'
```

- [ ] **Step 2: Log TASK_START in createTask**

Find the `createTask()` function. After the task is added to the map, add:

```typescript
logActivity({
  action: 'TASK_START',
  entityType: 'TASK',
  entityTitle: label,
  metadata: { taskId, taskType: type },
})
```

- [ ] **Step 3: Log TASK_DONE in completeTask**

Find the `completeTask()` function. After the task status is updated, add:

```typescript
logActivity({
  action: 'TASK_DONE',
  entityType: 'TASK',
  entityTitle: task.label,
  metadata: { taskId, taskType: task.type, result },
})
```

- [ ] **Step 4: Log TASK_FAIL in failTask**

Find the `failTask()` function. After the task status is updated, add:

```typescript
logActivity({
  action: 'TASK_FAIL',
  entityType: 'TASK',
  entityTitle: task.label,
  metadata: { taskId, taskType: task.type, error },
})
```

- [ ] **Step 5: Commit**

```bash
git add express-backend/src/services/task-manager.ts
git commit -m "feat: log task lifecycle events (start/done/fail) to activity log"
```

---

### Task 6: Activity API routes

**Files:**
- Create: `express-backend/src/routes/activity.ts`
- Modify: `express-backend/src/routes/index.ts`

- [ ] **Step 1: Create activity route**

```typescript
import { Router, Request, Response } from 'express'
import { prisma } from '../config/db'
import { logActivity, extractRecordableFields } from '../services/activity-log'

const router = Router()

// 解析游标：{createdAt的ISO字符串}__{id}
function parseCursor(cursor: string): { createdAt: Date; id: bigint } | null {
  const parts = cursor.split('__')
  if (parts.length !== 2) return null
  const createdAt = new Date(parts[0])
  const id = BigInt(parts[1])
  if (isNaN(createdAt.getTime())) return null
  return { createdAt, id }
}

// GET /api/activity — 统一时间线（游标分页 + 筛选）
router.get('/', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100)
    const cursor = req.query.cursor ? parseCursor(req.query.cursor as string) : null
    const actionFilter = req.query.action as string | undefined
    const entityTypeFilter = req.query.entityType as string | undefined
    const entityIdFilter = req.query.entityId ? BigInt(req.query.entityId as string) : undefined
    const fromFilter = req.query.from ? new Date(req.query.from as string) : undefined
    const toFilter = req.query.to ? new Date(req.query.to as string) : undefined

    // 构建 where 条件
    const where: Record<string, unknown> = {}
    if (actionFilter) where.action = actionFilter
    if (entityTypeFilter) where.entityType = entityTypeFilter
    if (entityIdFilter) where.entityId = entityIdFilter
    if (fromFilter || toFilter) {
      where.createdAt = {}
      if (fromFilter) (where.createdAt as Record<string, unknown>).gte = fromFilter
      if (toFilter) (where.createdAt as Record<string, unknown>).lte = toFilter
    }

    // 游标条件
    if (cursor) {
      where.OR = [
        { createdAt: { lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, id: { lt: cursor.id } },
      ]
    }

    const records = await prisma.activityLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    })

    const hasMore = records.length > limit
    if (hasMore) records.pop()

    const nextCursor = hasMore
      ? `${records[records.length - 1].createdAt.toISOString()}__${records[records.length - 1].id}`
      : null

    res.json({
      records: records.map((r) => ({
        id: r.id.toString(),
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId?.toString() ?? null,
        entityTitle: r.entityTitle,
        oldValues: r.oldValues,
        newValues: r.newValues,
        metadata: r.metadata,
        createdAt: r.createdAt.toISOString(),
        undoable: ['CREATE', 'UPDATE', 'DELETE'].includes(r.action),
      })),
      nextCursor,
    })
  } catch (err: any) {
    console.error('[Activity] GET error:', err)
    res.status(400).json({ error: err.message })
  }
})

// POST /api/activity/:id/undo — 撤销操作
router.post('/:id/undo', async (req: Request, res: Response) => {
  try {
    const logId = BigInt(req.params.id)
    const logEntry = await prisma.activityLog.findUnique({ where: { id: logId } })

    if (!logEntry) {
      return res.status(404).json({ error: '操作记录不存在' })
    }

    if (!['CREATE', 'UPDATE', 'DELETE'].includes(logEntry.action)) {
      return res.status(400).json({ error: '该操作类型不支持撤销' })
    }

    const entityType = logEntry.entityType
    const entityId = logEntry.entityId

    if (!entityId) {
      return res.status(400).json({ error: '该记录没有关联条目，无法撤销' })
    }

    // 根据实体类型选择 Prisma delegate
    const delegateMap: Record<string, typeof prisma.movie> = {
      MOVIE: prisma.movie,
      TV_SHOW: prisma.tvShow,
      GAME: prisma.game,
    }
    const delegate = delegateMap[entityType]
    if (!delegate) {
      return res.status(400).json({ error: `不支持的实体类型: ${entityType}` })
    }

    // 检查条目当前状态
    const current = await (delegate as any).findUnique({ where: { id: entityId } })

    let undoAction: string
    let undoResult: unknown

    switch (logEntry.action) {
      case 'CREATE': {
        // 撤销 CREATE = 删除
        if (!current) {
          return res.status(409).json({ error: '该条目已被删除，无法撤销' })
        }
        undoResult = await (delegate as any).delete({ where: { id: entityId } })
        undoAction = 'DELETE'
        break
      }
      case 'UPDATE': {
        // 撤销 UPDATE = 恢复旧值
        if (!current) {
          return res.status(409).json({ error: '该条目已被删除，无法撤销' })
        }
        const oldValues = logEntry.oldValues as Record<string, unknown> | null
        if (!oldValues || Object.keys(oldValues).length === 0) {
          return res.status(400).json({ error: '没有旧值可恢复' })
        }
        // 将字符串类型的 BigInt 转回 BigInt
        const updateData: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(oldValues)) {
          if (key === 'id' || key === 'createdAt' || key === 'updatedAt') continue
          updateData[key] = value
        }
        undoResult = await (delegate as any).update({ where: { id: entityId }, data: updateData })
        undoAction = 'UPDATE'
        break
      }
      case 'DELETE': {
        // 撤销 DELETE = 重新创建
        if (current) {
          return res.status(409).json({ error: '该条目已存在（可能被重新创建），无法撤销' })
        }
        const oldValues = logEntry.oldValues as Record<string, unknown> | null
        if (!oldValues) {
          return res.status(400).json({ error: '没有旧值可恢复' })
        }
        const createData: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(oldValues)) {
          if (key === 'id' || key === 'createdAt' || key === 'updatedAt') continue
          if (key === 'tmdbId' || key === 'imdbId' || key === 'entityId') {
            createData[key] = value ? BigInt(value as string) : null
            continue
          }
          createData[key] = value
        }
        undoResult = await (delegate as any).create({ data: createData })
        undoAction = 'CREATE'
        break
      }
    }

    // 记录撤销操作本身
    await logActivity({
      action: 'UNDO',
      entityType: entityType as any,
      entityId,
      entityTitle: logEntry.entityTitle,
      metadata: { originalLogId: logId.toString(), originalAction: logEntry.action },
    })

    res.json({ success: true, undoAction })
  } catch (err: any) {
    console.error('[Activity] POST undo error:', err)
    res.status(400).json({ error: err.message })
  }
})

export default router
```

- [ ] **Step 2: Register route in index.ts**

In `express-backend/src/routes/index.ts`, add:

```typescript
import activityRouter from './routes/activity'
// ... 在其他 router.use 之后
router.use('/activity', activityRouter)
```

- [ ] **Step 3: Commit**

```bash
git add express-backend/src/routes/activity.ts express-backend/src/routes/index.ts
git commit -m "feat: add activity API routes (GET timeline, POST undo)"
```

---

### Task 7: Frontend types

**Files:**
- Create: `frontend/src/types/activity.ts`

- [ ] **Step 1: Create types**

```typescript
export type ActivityAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'TASK_START' | 'TASK_DONE' | 'TASK_FAIL' | 'UNDO'
export type EntityType = 'MOVIE' | 'TV_SHOW' | 'GAME' | 'TASK'

export interface ActivityRecord {
  id: string
  action: ActivityAction
  entityType: EntityType
  entityId: string | null
  entityTitle: string
  oldValues: Record<string, unknown> | null
  newValues: Record<string, unknown> | null
  metadata: Record<string, unknown> | null
  createdAt: string
  undoable: boolean
}

export interface ActivityResponse {
  records: ActivityRecord[]
  nextCursor: string | null
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/types/activity.ts
git commit -m "feat: add activity log frontend types"
```

---

### Task 8: Activity Zustand store

**Files:**
- Create: `frontend/src/stores/activityStore.ts`

- [ ] **Step 1: Create store**

```typescript
import { create } from 'zustand'
import { apiFetch } from '../api'
import type { ActivityRecord, ActivityResponse } from '../types/activity'

interface ActivityFilters {
  action?: string
  entityType?: string
  entityId?: string
  from?: string
  to?: string
}

interface ActivityState {
  records: ActivityRecord[]
  nextCursor: string | null
  loading: boolean
  loadingMore: boolean
  error: string | null
  filters: ActivityFilters

  fetchRecords: () => Promise<void>
  fetchMore: () => Promise<void>
  setFilters: (filters: ActivityFilters) => void
  undo: (id: string) => Promise<void>
}

export const useActivityStore = create<ActivityState>((set, get) => ({
  records: [],
  nextCursor: null,
  loading: false,
  loadingMore: false,
  error: null,
  filters: {},

  fetchRecords: async () => {
    set({ loading: true, error: null })
    try {
      const { filters } = get()
      const params = new URLSearchParams()
      if (filters.action) params.set('action', filters.action)
      if (filters.entityType) params.set('entityType', filters.entityType)
      if (filters.entityId) params.set('entityId', filters.entityId)
      if (filters.from) params.set('from', filters.from)
      if (filters.to) params.set('to', filters.to)
      params.set('limit', '50')

      const data = await apiFetch<ActivityResponse>(`/activity?${params.toString()}`)
      set({ records: data.records, nextCursor: data.nextCursor, loading: false })
    } catch (err: any) {
      set({ error: err.message, loading: false })
    }
  },

  fetchMore: async () => {
    const { nextCursor, loadingMore, filters } = get()
    if (!nextCursor || loadingMore) return

    set({ loadingMore: true })
    try {
      const params = new URLSearchParams()
      params.set('cursor', nextCursor)
      params.set('limit', '50')
      if (filters.action) params.set('action', filters.action)
      if (filters.entityType) params.set('entityType', filters.entityType)
      if (filters.entityId) params.set('entityId', filters.entityId)
      if (filters.from) params.set('from', filters.from)
      if (filters.to) params.set('to', filters.to)

      const data = await apiFetch<ActivityResponse>(`/activity?${params.toString()}`)
      set((state) => ({
        records: [...state.records, ...data.records],
        nextCursor: data.nextCursor,
        loadingMore: false,
      }))
    } catch (err: any) {
      set({ error: err.message, loadingMore: false })
    }
  },

  setFilters: (filters) => {
    set({ filters })
    get().fetchRecords()
  },

  undo: async (id: string) => {
    await apiFetch(`/activity/${id}/undo`, { method: 'POST' })
    // 撤销后刷新列表
    get().fetchRecords()
  },
}))
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/stores/activityStore.ts
git commit -m "feat: add activity Zustand store with cursor pagination"
```

---

### Task 9: ActivityTimeline component

**Files:**
- Create: `frontend/src/components/ActivityTimeline.tsx`

- [ ] **Step 1: Create component**

```tsx
import { useEffect, useRef, useCallback } from 'react'
import { useActivityStore } from '../stores/activityStore'
import { useToastStore } from '../stores/toastStore'
import type { ActivityRecord, ActivityAction } from '../types/activity'
import { t } from '../stores/i18nStore'

const ACTION_COLORS: Record<ActivityAction, string> = {
  CREATE: '#6f6',
  UPDATE: '#d4ff00',
  DELETE: '#f44',
  TASK_START: '#888',
  TASK_DONE: '#4af',
  TASK_FAIL: '#f44',
  UNDO: '#f80',
}

const ACTION_LABELS: Record<ActivityAction, string> = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  TASK_START: 'START',
  TASK_DONE: 'DONE',
  TASK_FAIL: 'FAIL',
  UNDO: 'UNDO',
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${mm}-${dd} ${hh}:${mi}`
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '空'
  if (typeof val === 'boolean') return val ? '是' : '否'
  if (typeof val === 'object') return JSON.stringify(val)
  return String(val)
}

function ChangeSummary({ record }: { record: ActivityRecord }) {
  const { action, oldValues, newValues, metadata } = record

  if (action === 'TASK_START') {
    return <span className="text-[var(--muted)]">{(metadata as any)?.taskType ?? ''}</span>
  }

  if (action === 'TASK_DONE') {
    const m = metadata as Record<string, unknown> | null
    if (!m) return null
    const parts: string[] = []
    if (m.total != null) parts.push(`${m.total} 条`)
    if (m.imported != null) parts.push(`${m.imported} 成功`)
    if (m.skipped != null) parts.push(`${m.skipped} 跳过`)
    return <span className="text-[var(--muted)]">{parts.join('，')}</span>
  }

  if (action === 'TASK_FAIL') {
    return <span className="text-red-400">{(metadata as any)?.error ?? '未知错误'}</span>
  }

  if (action === 'CREATE' && newValues) {
    const status = (newValues as Record<string, unknown>).status
    const rating = (newValues as Record<string, unknown>).rating
    const parts: string[] = []
    if (status) parts.push(`状态 ${status}`)
    if (rating != null) parts.push(`评分 ${rating}★`)
    return <span className="text-[var(--muted)]">{parts.join('，')}</span>
  }

  if (action === 'DELETE' && oldValues) {
    const rating = (oldValues as Record<string, unknown>).rating
    const comment = (oldValues as Record<string, unknown>).shortReview
    const parts: string[] = []
    if (rating != null) parts.push(`评分 ${rating}★`)
    if (comment) parts.push(`短评：${comment}`)
    return <span className="text-[var(--muted)]">{parts.join('，')}</span>
  }

  if ((action === 'UPDATE' || action === 'UNDO') && oldValues && newValues) {
    const keys = Object.keys(newValues)
    return (
      <span className="text-[var(--muted)]">
        {keys.map((key, i) => (
          <span key={key}>
            {i > 0 && '，'}
            <span className="text-[var(--dim)]">{key}</span>{' '}
            <span className="text-red-400">{formatValue((oldValues as Record<string, unknown>)[key])}</span>
            <span className="text-[var(--dim)]"> → </span>
            <span className="text-[var(--accent)]">{formatValue((newValues as Record<string, unknown>)[key])}</span>
          </span>
        ))}
      </span>
    )
  }

  return null
}

interface ActivityTimelineProps {
  entityId?: string
  compact?: boolean
}

export function ActivityTimeline({ entityId, compact }: ActivityTimelineProps) {
  const { records, loading, loadingMore, nextCursor, fetchRecords, fetchMore, undo } = useActivityStore()
  const { showToast } = useToastStore()
  const observerRef = useRef<IntersectionObserver | null>(null)
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    fetchRecords()
  }, [fetchRecords])

  // 无限滚动
  const lastElementRef = useCallback(
    (node: HTMLDivElement | null) => {
      if (loadingMore) return
      if (observerRef.current) observerRef.current.disconnect()
      observerRef.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && nextCursor) {
          fetchMore()
        }
      })
      if (node) observerRef.current.observe(node)
      sentinelRef.current = node
    },
    [loadingMore, nextCursor, fetchMore],
  )

  const handleUndo = async (id: string) => {
    if (!confirm('确认撤销此操作？将恢复到变更前的状态。')) return
    try {
      await undo(id)
      showToast('操作已撤销', 'success')
    } catch (err: any) {
      if (err.message?.includes('409')) {
        showToast('该条目已被后续操作修改，无法撤销', 'error')
      } else {
        showToast(`撤销失败: ${err.message}`, 'error')
      }
    }
  }

  if (loading && records.length === 0) {
    return <div className="p-8 text-center text-[var(--muted)]">加载中...</div>
  }

  if (!loading && records.length === 0) {
    return <div className="p-8 text-center text-[var(--muted)]">暂无操作记录</div>
  }

  return (
    <div className={compact ? '' : 'border border-[var(--line)]'}>
      {records.map((record, index) => {
        const color = ACTION_COLORS[record.action] || '#888'
        const isLast = index === records.length - 1
        return (
          <div
            key={record.id}
            ref={isLast ? lastElementRef : undefined}
            className="flex gap-3 px-3 py-2 border-l-2 hover:bg-[var(--surface-hover)] transition-colors"
            style={{ borderLeftColor: color }}
          >
            {/* 时间 */}
            <span className="text-[var(--dim)] text-xs whitespace-nowrap min-w-[80px] font-mono">
              {formatTime(record.createdAt)}
            </span>

            {/* 操作标签 */}
            <span
              className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 self-start mt-0.5"
              style={{ color, backgroundColor: `${color}15`, border: `1px solid ${color}40` }}
            >
              {ACTION_LABELS[record.action]}
            </span>

            {/* 条目名 + 变更摘要 */}
            <div className="flex-1 min-w-0">
              <span className="text-white text-sm">{record.entityTitle}</span>
              <span className="text-[var(--dim)] mx-1.5">—</span>
              <ChangeSummary record={record} />
            </div>

            {/* 撤销按钮 */}
            {record.undoable && !entityId && (
              <button
                onClick={() => handleUndo(record.id)}
                className="text-[var(--dim)] text-xs hover:text-[var(--accent)] transition-colors whitespace-nowrap"
                title="撤销此操作"
              >
                ↩ UNDO
              </button>
            )}
          </div>
        )
      })}

      {loadingMore && (
        <div className="p-4 text-center text-[var(--muted)] text-xs">加载更多...</div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/ActivityTimeline.tsx
git commit -m "feat: add ActivityTimeline component with undo support"
```

---

### Task 10: ActivityFilters component

**Files:**
- Create: `frontend/src/components/ActivityFilters.tsx`

- [ ] **Step 1: Create component**

```tsx
import { useActivityStore } from '../stores/activityStore'
import type { ActivityAction, EntityType } from '../types/activity'

const ACTION_TABS: { label: string; value?: ActivityAction }[] = [
  { label: '全部' },
  { label: '数据变更', value: 'UPDATE' },
  { label: '任务', value: 'TASK_DONE' },
]

const ENTITY_TABS: { label: string; value?: EntityType }[] = [
  { label: '全部' },
  { label: '电影', value: 'MOVIE' },
  { label: '剧集', value: 'TV_SHOW' },
  { label: '游戏', value: 'GAME' },
]

const TIME_TABS: { label: string; from?: string }[] = [
  { label: '全部' },
  { label: '今天', from: new Date(new Date().setHours(0, 0, 0, 0)).toISOString() },
  { label: '7天', from: new Date(Date.now() - 7 * 86400000).toISOString() },
  { label: '30天', from: new Date(Date.now() - 30 * 86400000).toISOString() },
]

export function ActivityFilters() {
  const { filters, setFilters } = useActivityStore()

  return (
    <div className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] px-4 py-3">
      {/* 实体类型 */}
      <div className="flex gap-1">
        {ENTITY_TABS.map((tab) => (
          <button
            key={tab.label}
            onClick={() => setFilters({ ...filters, entityType: tab.value })}
            className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 border transition-colors ${
              filters.entityType === tab.value
                ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10'
                : 'border-[var(--line)] text-[var(--muted)] hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="w-px h-4 bg-[var(--line)]" />

      {/* 操作类型 */}
      <div className="flex gap-1">
        {ACTION_TABS.map((tab) => (
          <button
            key={tab.label}
            onClick={() => setFilters({ ...filters, action: tab.value })}
            className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 border transition-colors ${
              filters.action === tab.value
                ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10'
                : 'border-[var(--line)] text-[var(--muted)] hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="w-px h-4 bg-[var(--line)]" />

      {/* 时间范围 */}
      <div className="flex gap-1">
        {TIME_TABS.map((tab) => (
          <button
            key={tab.label}
            onClick={() => setFilters({ ...filters, from: tab.from })}
            className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 border transition-colors ${
              filters.from === tab.from
                ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10'
                : 'border-[var(--line)] text-[var(--muted)] hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/ActivityFilters.tsx
git commit -m "feat: add ActivityFilters component"
```

---

### Task 11: ActivityPage + routing

**Files:**
- Create: `frontend/src/pages/ActivityPage.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/AppShell.tsx`

- [ ] **Step 1: Create ActivityPage**

```tsx
import { ActivityFilters } from '../components/ActivityFilters'
import { ActivityTimeline } from '../components/ActivityTimeline'

export function ActivityPage() {
  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="font-display text-2xl tracking-wider text-white uppercase">Activity Log</h1>
        <p className="text-[var(--muted)] text-xs mt-1 uppercase tracking-widest">操作记录</p>
      </div>

      <div className="border border-[var(--line)]">
        <ActivityFilters />
        <ActivityTimeline />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add route to App.tsx**

In `frontend/src/App.tsx`, add import and route:

```typescript
import { ActivityPage } from './pages/ActivityPage'
```

Add inside the `<Routes>` (after the timeline route):

```tsx
<Route path="/activity" element={<ActivityPage />} />
```

- [ ] **Step 3: Add nav item to AppShell.tsx**

In `frontend/src/components/AppShell.tsx`, find the `NAV_ITEMS` array and add:

```typescript
{ to: '/activity', label: 'ACTIVITY' },
```

Place it after the timeline entry.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/ActivityPage.tsx frontend/src/App.tsx frontend/src/components/AppShell.tsx
git commit -m "feat: add ActivityPage with route and nav entry"
```

---

### Task 12: Item-level history in RightActionDrawer

**Files:**
- Modify: `frontend/src/components/RightActionDrawer.tsx`

- [ ] **Step 1: Import ActivityTimeline**

Add import at top:

```typescript
import { ActivityTimeline } from './ActivityTimeline'
import { useActivityStore } from '../stores/activityStore'
```

- [ ] **Step 2: Add "变更历史" section**

Find the end of the drawer content (before the closing `</div>` of the panel). Add a new section:

```tsx
{/* 04 变更历史 */}
{selectedRecordId && (
  <section className="mt-6">
    <p className="section-label">04 CHANGE HISTORY</p>
    <button
      onClick={() => setShowHistory(!showHistory)}
      className="text-xs text-[var(--accent)] border border-[var(--accent)]/30 px-3 py-1.5 hover:bg-[var(--accent)]/10 transition-colors uppercase tracking-wider"
    >
      {showHistory ? '收起历史' : '变更历史'}
    </button>
    {showHistory && (
      <div className="mt-3 border border-[var(--line)] max-h-[300px] overflow-y-auto">
        <ActivityTimeline entityId={selectedRecordId} compact />
      </div>
    )}
  </section>
)}
```

Note: You'll need to add `selectedRecordId` (the currently edited record's ID) and `showHistory` state. The exact integration depends on how the drawer currently tracks the selected record. If the drawer doesn't currently receive a record ID, you'll need to pass it as a prop or read it from a store.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/RightActionDrawer.tsx
git commit -m "feat: add change history section to RightActionDrawer"
```

---

### Task 13: Wire up entity-specific activity store for item history

**Files:**
- Modify: `frontend/src/stores/activityStore.ts`

- [ ] **Step 1: Add fetchEntityHistory action**

Add to the store interface:

```typescript
fetchEntityHistory: (entityType: string, entityId: string) => Promise<ActivityRecord[]>
```

Add implementation:

```typescript
fetchEntityHistory: async (entityType: string, entityId: string) => {
  const params = new URLSearchParams()
  params.set('entityType', entityType)
  params.set('entityId', entityId)
  params.set('limit', '50')
  const data = await apiFetch<ActivityResponse>(`/activity?${params.toString()}`)
  return data.records
},
```

This allows the RightActionDrawer to fetch history for a specific item without affecting the main timeline state.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/stores/activityStore.ts
git commit -m "feat: add fetchEntityHistory for item-level history"
```

---

### Task 14: End-to-end verification

- [ ] **Step 1: Start backend and verify Prisma middleware works**

```bash
cd express-backend && npm run dev
```

Modify a movie rating via the LibraryPage edit form. Then query:

```bash
curl http://localhost:18889/api/activity?limit=5
```

Expected: Response contains an UPDATE record with oldValues/newValues showing the rating change.

- [ ] **Step 2: Verify task logging**

Trigger a TMDB backfill task:

```bash
curl -X POST http://localhost:18889/api/import/tmdb-enrich/backfill?limit=1
```

Then check activity:

```bash
curl http://localhost:18889/api/activity?action=TASK_START&limit=5
```

Expected: TASK_START and eventually TASK_DONE records appear.

- [ ] **Step 3: Verify frontend renders**

Open `http://localhost:18888/activity`. Expected: Activity log page loads with the records from steps 1-2.

- [ ] **Step 4: Verify undo works**

Click UNDO on an UPDATE record. Confirm the dialog. Expected: Record's old values are restored, an UNDO entry appears in the timeline.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: activity log — complete implementation"
```
