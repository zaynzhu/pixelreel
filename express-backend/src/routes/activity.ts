import { Router, Request, Response } from 'express'
import { getDb } from '../config/db'
import { logActivity, EntityType } from '../services/activity-log'

const router = Router()

const UNDOABLE_ACTIONS = new Set(['CREATE', 'UPDATE', 'DELETE'])

function parseCursor(cursor: string): { createdAt: Date; id: bigint } | null {
  const parts = cursor.split('__')
  if (parts.length !== 2) return null
  const createdAt = new Date(parts[0])
  const id = BigInt(parts[1])
  if (isNaN(createdAt.getTime())) return null
  return { createdAt, id }
}

function serializeLog(entry: any) {
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
    undoable: UNDOABLE_ACTIONS.has(entry.action) && entry.entityId != null,
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
router.get('/', async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100)
    const cursorStr = req.query.cursor as string | undefined
    const action = req.query.action as string | undefined
    const entityType = req.query.entityType as string | undefined
    const entityId = req.query.entityId as string | undefined
    const from = req.query.from as string | undefined
    const to = req.query.to as string | undefined

    const where: any = {}
    if (action) where.action = action
    if (entityType) where.entityType = entityType
    if (entityId && typeof entityId === 'string') where.entityId = BigInt(entityId)
    if (from || to) {
      where.createdAt = {}
      if (from) where.createdAt.gte = new Date(from)
      if (to) where.createdAt.lte = new Date(to)
    }

    const cursorObj = cursorStr ? parseCursor(cursorStr) : undefined
    if (cursorObj) {
      where.OR = [
        { createdAt: { lt: cursorObj.createdAt } },
        { createdAt: { equals: cursorObj.createdAt }, id: { lt: cursorObj.id } },
      ]
    }

    const rows = await getDb().activityLog.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    })

    const hasMore = rows.length > limit
    const items = rows.slice(0, limit)
    const last = items[items.length - 1]
    const nextCursor = hasMore && last
      ? `${new Date(last.createdAt).toISOString()}__${last.id}`
      : null

    res.json({
      records: items.map(serializeLog),
      nextCursor,
    })
  } catch (err: any) {
    console.error('[Activity] 查询失败:', err)
    res.status(500).json({ error: err.message })
  }
})

// POST /api/activity/:id/undo — 撤销操作
router.post('/:id/undo', async (req: Request, res: Response) => {
  try {
    const id = BigInt(req.params.id as string)

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

      const updated = await (delegate as any).update({
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
  } catch (err: any) {
    console.error('[Activity] 撤销失败:', err)
    res.status(err.status || 500).json({ error: err.message })
  }
})

export default router
