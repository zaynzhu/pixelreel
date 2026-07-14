import { Prisma } from '@prisma/client'
import { logActivity, extractRecordableFields, diffFields } from '../services/activity-log'
import type { EntityType } from '../services/activity-log'

// Prisma 模型名 → 实体类型映射
const MODEL_ENTITY_MAP: Record<string, EntityType> = {
  Movie: 'MOVIE',
  TvShow: 'TV_SHOW',
  Game: 'GAME',
}

const MODEL_DELEGATE_MAP: Record<string, string> = {
  Movie: 'movie',
  TvShow: 'tvShow',
  Game: 'game',
}

const PROTECTED_DOUBAN_MODELS = new Set(['Movie', 'TvShow'])
const PROTECTED_DOUBAN_FIELDS = new Set([
  'doubanId',
  'doubanTitle',
  'doubanAltTitle',
  'doubanIntro',
  'doubanRating',
  'doubanDate',
  'doubanComment',
  'doubanLink',
  'doubanAvgRating',
])

export class ProtectedDoubanDataError extends Error {
  readonly status = 403

  constructor(message = '豆瓣来源影视数据受保护，禁止删除') {
    super(message)
    this.name = 'ProtectedDoubanDataError'
  }
}

export function assertRecordDeletionAllowed(model: string, record: Record<string, unknown> | null) {
  if (PROTECTED_DOUBAN_MODELS.has(model) && record?.doubanId != null) {
    throw new ProtectedDoubanDataError()
  }
}

function hasProtectedDoubanField(data: Record<string, unknown> | null | undefined): boolean {
  if (!data) return false
  return Object.keys(data).some((key) => PROTECTED_DOUBAN_FIELDS.has(key) && data[key] !== undefined)
}

function unwrapUpdateValue(value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value) && 'set' in value) {
    return (value as { set: unknown }).set
  }
  return value
}

function valuesEqual(currentValue: unknown, nextValue: unknown): boolean {
  if (currentValue === nextValue) return true
  if (currentValue == null || nextValue == null) return false
  return String(currentValue) === String(nextValue)
}

export function assertProtectedDoubanFieldsUnchanged(
  model: string,
  record: Record<string, unknown> | null,
  data: Record<string, unknown> | null | undefined,
) {
  if (!PROTECTED_DOUBAN_MODELS.has(model) || record?.doubanId == null || !data) return

  for (const field of PROTECTED_DOUBAN_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(data, field) || data[field] === undefined) continue
    const nextValue = unwrapUpdateValue(data[field])
    if (!valuesEqual(record[field], nextValue)) {
      throw new ProtectedDoubanDataError('豆瓣来源原始字段受保护，禁止修改')
    }
  }
}

// 支持日志记录的模型列表
const TRACKED_MODELS = new Set(Object.keys(MODEL_ENTITY_MAP))

// 提取记录标题（按优先级尝试常见标题字段）
function extractTitle(data: Record<string, unknown>): string {
  return (data.title as string) ?? (data.doubanTitle as string) ?? (data.tmdbTitle as string) ?? '未知'
}

/**
 * 创建活动日志 Prisma 扩展。
 * 返回扩展定义，由 registerExtensions() 统一注册。
 * 内部查询通过 getDb() 获取扩展后的客户端。
 */
export function createActivityLogExtension() {
  return Prisma.defineExtension({
    name: 'activity-log',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }: any) {
            // 仅追踪目标模型的增删改操作
            if (!model || !TRACKED_MODELS.has(model)) {
              return query(args)
            }

            const entityType = MODEL_ENTITY_MAP[model]
            const delegateName = MODEL_DELEGATE_MAP[model]

            switch (operation) {
              // ── 创建：执行后记录完整快照 ──
              case 'create': {
                const result = await query(args)
                try {
                  const newValues = extractRecordableFields(result)
                  await logActivity({
                    action: 'CREATE',
                    entityType,
                    entityId: result.id,
                    entityTitle: extractTitle(result),
                    newValues,
                  })
                } catch {
                  // 日志写入不阻断业务
                }
                return result
              }

              // ── 更新：先查旧记录，执行后对比差异 ──
              case 'update': {
                const entityId = args.where?.id
                const touchesProtectedField = hasProtectedDoubanField(args.data)
                let oldRecord: Record<string, unknown> | null = null

                if (entityId != null) {
                  try {
                    // 用延迟 import 避免循环依赖
                    const { getDb } = await import('../config/db')
                    const db = getDb()
                    oldRecord = await (db as any)[delegateName].findUnique({
                      where: { id: entityId },
                    })
                  } catch (error) {
                    if (touchesProtectedField && PROTECTED_DOUBAN_MODELS.has(model)) throw error
                    // 查询旧记录失败不阻断业务
                  }
                }

                assertProtectedDoubanFieldsUnchanged(model, oldRecord, args.data)
                const result = await query(args)

                try {
                  const newValues = extractRecordableFields(result)
                  if (oldRecord) {
                    const oldFields = extractRecordableFields(oldRecord)
                    const { oldVals, newVals } = diffFields(oldFields, newValues)
                    // 仅在有实际变更时记录
                    if (Object.keys(newVals).length > 0) {
                      await logActivity({
                        action: 'UPDATE',
                        entityType,
                        entityId: result.id,
                        entityTitle: extractTitle(result),
                        oldValues: oldVals,
                        newValues: newVals,
                      })
                    }
                  } else {
                    // 无法获取旧记录时，只记录新值
                    await logActivity({
                      action: 'UPDATE',
                      entityType,
                      entityId: result.id,
                      entityTitle: extractTitle(result),
                      newValues,
                    })
                  }
                } catch {
                  // 日志写入不阻断业务
                }
                return result
              }

              // ── 删除：先查旧记录，执行后记录完整旧快照 ──
              case 'delete': {
                const entityId = args.where?.id
                let oldRecord: Record<string, unknown> | null = null

                if (entityId != null) {
                  try {
                    const { getDb } = await import('../config/db')
                    const db = getDb()
                    oldRecord = await (db as any)[delegateName].findUnique({
                      where: { id: entityId },
                    })
                  } catch (error) {
                    if (PROTECTED_DOUBAN_MODELS.has(model)) throw error
                  }
                }

                assertRecordDeletionAllowed(model, oldRecord)
                const result = await query(args)

                try {
                  if (oldRecord) {
                    await logActivity({
                      action: 'DELETE',
                      entityType,
                      entityId: oldRecord.id as bigint,
                      entityTitle: extractTitle(oldRecord),
                      oldValues: extractRecordableFields(oldRecord),
                    })
                  } else {
                    await logActivity({
                      action: 'DELETE',
                      entityType,
                      entityId: entityId,
                      entityTitle: '未知',
                    })
                  }
                } catch {
                  // 日志写入不阻断业务
                }
                return result
              }

              // ── 批量删除：命中任意豆瓣影视记录时整体拒绝 ──
              case 'deleteMany': {
                if (PROTECTED_DOUBAN_MODELS.has(model)) {
                  const { getDb } = await import('../config/db')
                  const db = getDb()
                  const protectedRecord = await (db as any)[delegateName].findFirst({
                    where: {
                      AND: [args.where ?? {}, { doubanId: { not: null } }],
                    },
                    select: { doubanId: true },
                  })
                  assertRecordDeletionAllowed(model, protectedRecord)
                }
                return query(args)
              }

              default:
                return query(args)
            }
          },
      },
    },
  })
}
