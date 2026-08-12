import { getDb } from '../config/db'
import { Prisma } from '@prisma/client'

// 排除的系统字段，不记录到变更详情
const SYSTEM_FIELDS = new Set(['id', 'createdAt', 'updatedAt'])

export type ActivityAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'MERGE' | 'RESTORE' | 'TASK_START' | 'TASK_DONE' | 'TASK_FAIL' | 'TASK_CANCEL' | 'UNDO'
export type EntityType = 'MOVIE' | 'TV_SHOW' | 'GAME' | 'LIBRARY' | 'TASK'

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
    await getDb().activityLog.create({
      data: {
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId != null ? BigInt(params.entityId) : null,
        entityTitle: params.entityTitle,
        oldValues: (params.oldValues ?? undefined) as Prisma.InputJsonValue | undefined,
        newValues: (params.newValues ?? undefined) as Prisma.InputJsonValue | undefined,
        metadata: (params.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
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
