import { Router, Request, Response, NextFunction } from 'express'
import { getDb } from '../config/db'
import { logActivity, EntityType } from '../services/activity-log'
import {
  parseDateParameter,
  parsePositiveBigIntParameter,
  parsePositiveIntegerParameter,
  parseStringParameter,
  RequestValidationError,
} from './request-validation'

const router = Router()

const UNDOABLE_ACTIONS = new Set(['CREATE', 'UPDATE', 'DELETE'])
const undoInProgress = new Set<string>()

export function parseActivityCursor(value: unknown): { createdAt: Date; id: bigint } | null {
  const cursor = parseStringParameter(value, 'cursor')
  if (!cursor) return null
  const parts = cursor.split('__')
  if (parts.length !== 2) throw new RequestValidationError('cursor 格式无效')
  const createdAt = new Date(parts[0])
  const id = parsePositiveBigIntParameter(parts[1], 'cursor id', true)!
  if (isNaN(createdAt.getTime())) throw new RequestValidationError('cursor 时间无效')
  return { createdAt, id }
}

export function getUndoneLogId(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null
  const undoneLogId = (metadata as Record<string, unknown>).undoneLogId
  return typeof undoneLogId === 'string' && /^\d+$/.test(undoneLogId) ? undoneLogId : null
}

export function serializeLog(entry: any, undoneLogIds = new Set<string>()) {
  return {
    id: entry.id.toString(),
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId != null ? entry.entityId.toString() : null,
    entityTitle: entry.entityTitle,
    oldValues: entry.oldValues,
    newValues: entry.newValues,
    metadata: entry.metadata,
    createdAt: entry.createdAt,
    undoable: UNDOABLE_ACTIONS.has(entry.action)
      && entry.entityId != null
      && !undoneLogIds.has(entry.id.toString()),
  }
}

function entityDelegate(entityType: string) {
  const db = getDb()
  switch (entityType) {
    case 'MOVIE': return db.movie
    case 'TV_SHOW': return db.tvShow
    case 'GAME': return db.game
    default: return null
  }
}

// GET /api/activity — 活动日志列表（游标分页）
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = parsePositiveIntegerParameter(req.query.limit, 'limit', 50, 100)
    const cursorObj = parseActivityCursor(req.query.cursor)
    const action = parseStringParameter(req.query.action, 'action')
    const entityType = parseStringParameter(req.query.entityType, 'entityType')
    const entityId = parsePositiveBigIntParameter(req.query.entityId, 'entityId')
    const from = parseDateParameter(req.query.from, 'from')
    const to = parseDateParameter(req.query.to, 'to')
    if (from && to && from > to) throw new RequestValidationError('from 不能晚于 to')

    const where: any = {}
    if (action) where.action = action
    if (entityType) where.entityType = entityType
    if (entityId) where.entityId = entityId
    if (from || to) {
      where.createdAt = {}
      if (from) where.createdAt.gte = from
      if (to) where.createdAt.lte = to
    }

    if (cursorObj) {
      where.OR = [
        { createdAt: { lt: cursorObj.createdAt } },
        { createdAt: { equals: cursorObj.createdAt }, id: { lt: cursorObj.id } },
      ]
    }

    const db = getDb()
    const rows = await db.activityLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    })

    const hasMore = rows.length > limit
    const items = rows.slice(0, limit)
    const undoableLogIds = items
      .filter(entry => UNDOABLE_ACTIONS.has(entry.action) && entry.entityId != null)
      .map(entry => entry.id.toString())
    const undoneLogIds = new Set<string>()
    if (undoableLogIds.length > 0) {
      const undoRows = await db.activityLog.findMany({
        where: {
          action: 'UNDO',
          OR: undoableLogIds.map(undoneLogId => ({
            metadata: { path: '$.undoneLogId', equals: undoneLogId },
          })),
        },
        select: { metadata: true },
      })
      for (const undoRow of undoRows) {
        const undoneLogId = getUndoneLogId(undoRow.metadata)
        if (undoneLogId) undoneLogIds.add(undoneLogId)
      }
    }
    const last = items[items.length - 1]
    const nextCursor = hasMore && last
      ? `${new Date(last.createdAt).toISOString()}__${last.id}`
      : null

    res.json({
      records: items.map(entry => serializeLog(entry, undoneLogIds)),
      nextCursor,
    })
  } catch (err) {
    next(err)
  }
})

// POST /api/activity/:id/undo — 撤销操作
router.post('/:id/undo', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parsePositiveBigIntParameter(req.params.id, 'id', true)!
    const undoKey = id.toString()
    if (undoInProgress.has(undoKey)) {
      res.status(409).json({ error: '该操作正在撤销' })
      return
    }
    undoInProgress.add(undoKey)
    const releaseUndoLock = () => undoInProgress.delete(undoKey)
    res.once('finish', releaseUndoLock)
    res.once('close', releaseUndoLock)

    const entry = await getDb().activityLog.findUnique({ where: { id } })
    if (!entry) {
      res.status(404).json({ error: '活动日志不存在' })
      return
    }

    if (!UNDOABLE_ACTIONS.has(entry.action)) {
      res.status(400).json({ error: `操作 ${entry.action} 不支持撤销` })
      return
    }

    if (entry.entityId == null) {
      res.status(400).json({ error: '缺少 entityId，无法撤销' })
      return
    }

    const existingUndo = await getDb().activityLog.findFirst({
      where: {
        action: 'UNDO',
        metadata: { path: '$.undoneLogId', equals: undoKey },
      },
      select: { id: true },
    })
    if (existingUndo) {
      res.status(409).json({ error: '该操作已撤销' })
      return
    }

    const delegate = entityDelegate(entry.entityType)
    if (!delegate) {
      res.status(400).json({ error: `未知实体类型: ${entry.entityType}` })
      return
    }

    const entityId = entry.entityId
    const oldValues = (entry.oldValues as Record<string, unknown>) || {}
    const newValues = (entry.newValues as Record<string, unknown>) || {}
    const entityTitle = entry.entityTitle

    if (entry.action === 'CREATE') {
      // 撤销创建 = 删除实体
      const existing = await (delegate as any).findUnique({ where: { id: entityId } })
      if (!existing) {
        res.status(409).json({ error: '实体已被删除，无法撤销' })
        return
      }

      await (delegate as any).delete({ where: { id: entityId } })

      await logActivity({
        action: 'UNDO',
        entityType: entry.entityType as EntityType,
        entityId,
        entityTitle,
        oldValues: newValues,
        newValues: null,
        metadata: { undoneLogId: entry.id.toString() },
      })
    } else if (entry.action === 'UPDATE') {
      // 撤销更新 = 恢复 oldValues
      const existing = await (delegate as any).findUnique({ where: { id: entityId } })
      if (!existing) {
        res.status(409).json({ error: '实体不存在，无法撤销' })
        return
      }

      // 构建恢复数据：将 oldValues 中的字段名映射回 Prisma 字段名
      const restoreData: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(oldValues)) {
        if (value !== undefined) restoreData[key] = value
      }

      await (delegate as any).update({
        where: { id: entityId },
        data: restoreData,
      })

      await logActivity({
        action: 'UNDO',
        entityType: entry.entityType as EntityType,
        entityId,
        entityTitle,
        oldValues: newValues,
        newValues: oldValues,
        metadata: { undoneLogId: entry.id.toString() },
      })
    } else if (entry.action === 'DELETE') {
      // 撤销删除 = 用 oldValues 重建实体
      const existing = await (delegate as any).findUnique({ where: { id: entityId } })
      if (existing) {
        res.status(409).json({ error: '实体已存在，无法撤销删除' })
        return
      }

      const createData: Record<string, unknown> = { id: entityId }
      for (const [key, value] of Object.entries(oldValues)) {
        if (value !== undefined && key !== 'id') createData[key] = value
      }

      // 处理 BigInt 类型的字段
      if (createData.doubanId && typeof createData.doubanId === 'string') {
        createData.doubanId = BigInt(createData.doubanId as string)
      }
      if (createData.tmdbId && typeof createData.tmdbId === 'string') {
        createData.tmdbId = BigInt(createData.tmdbId as string)
      }

      await (delegate as any).create({ data: createData })

      await logActivity({
        action: 'UNDO',
        entityType: entry.entityType as EntityType,
        entityId,
        entityTitle,
        oldValues: null,
        newValues: oldValues,
        metadata: { undoneLogId: entry.id.toString() },
      })
    }

    res.json({ success: true, message: '撤销成功' })
  } catch (err) {
    next(err)
  }
})

export default router
