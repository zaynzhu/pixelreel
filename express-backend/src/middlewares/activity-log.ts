import { Prisma } from '@prisma/client'
import { logActivity, extractRecordableFields, diffFields } from '../services/activity-log'
import type { EntityType } from '../services/activity-log'

// Prisma 模型名 → 实体类型映射
const MODEL_ENTITY_MAP: Record<string, EntityType> = {
  Movie: 'MOVIE',
  TvShow: 'TV_SHOW',
  Game: 'GAME',
}

// 支持日志记录的模型列表
const TRACKED_MODELS = new Set(Object.keys(MODEL_ENTITY_MAP))

// 提取记录标题（按优先级尝试常见标题字段）
function extractTitle(data: Record<string, unknown>): string {
  return (data.title as string) ?? (data.doubanTitle as string) ?? (data.tmdbTitle as string) ?? '未知'
}

/**
 * 注册 Prisma 客户端扩展，自动捕获 Movie/TvShow/Game 的增删改操作并写入 activity_log。
 *
 * @param prismaInstance - 原始 PrismaClient 实例，用于在 update/delete 前查询旧记录
 */
export function registerActivityLogMiddleware(prismaInstance: any) {
  return prismaInstance.$extends(
    Prisma.defineExtension({
      name: 'activity-log',
      query: {
        $allModels: {
          async $allOperations({ model, operation, args, query }: any) {
            // 仅追踪目标模型的增删改操作
            if (!model || !TRACKED_MODELS.has(model)) {
              return query(args)
            }

            const entityType = MODEL_ENTITY_MAP[model]

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
                let oldRecord: Record<string, unknown> | null = null

                if (entityId != null) {
                  try {
                    oldRecord = await prismaInstance[model].findUnique({
                      where: { id: entityId },
                    })
                  } catch {
                    // 查询旧记录失败不阻断业务
                  }
                }

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
                    oldRecord = await prismaInstance[model].findUnique({
                      where: { id: entityId },
                    })
                  } catch {
                    // 查询旧记录失败不阻断业务
                  }
                }

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

              default:
                return query(args)
            }
          },
        },
      },
    }),
  )
}
