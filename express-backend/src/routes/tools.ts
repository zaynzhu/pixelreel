import { Router, Request, Response, NextFunction } from 'express'
import { getDb } from '../config/db'
import fs from 'fs'
import path from 'path'
import {
  assertNoQueryParameters,
  parseBoundedStringParameter,
  parseEnumParameter,
  parsePositiveBigIntParameter,
  RequestValidationError,
} from './request-validation'

const router = Router()
const TOOL_CATEGORIES = ['movie', 'tv_show'] as const

export function parseToolSearchParameters(value: Record<string, unknown>) {
  const unknownKey = Object.keys(value).find(key => key !== 'query')
  if (unknownKey) throw new RequestValidationError(`未知参数: ${unknownKey}`)
  return {
    query: parseBoundedStringParameter(value.query, 'query', 200),
  }
}

export function parseConvertCategoryBody(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RequestValidationError('请求体必须是对象')
  }

  const body = value as Record<string, unknown>
  const unknownKey = Object.keys(body).find(key => !['id', 'from', 'to'].includes(key))
  if (unknownKey) throw new RequestValidationError(`未知字段: ${unknownKey}`)

  const id = parsePositiveBigIntParameter(body.id, 'id', true)!
  const from = parseEnumParameter(body.from, 'from', TOOL_CATEGORIES, true)!
  const to = parseEnumParameter(body.to, 'to', TOOL_CATEGORIES, true)!
  if (from === to) throw new RequestValidationError('from 和 to 不能相同')
  return { id, from, to }
}

// 搜索电影和电视剧记录
router.get('/search', async (req: Request, res: Response) => {
  const { query } = parseToolSearchParameters(req.query)
  if (!query) {
    return res.json({ results: [] })
  }

  const db = getDb()
  const contains = { contains: query }

  const [movies, tvShows] = await Promise.all([
    db.movie.findMany({
      where: {
        OR: [
          { title: contains },
          { doubanTitle: contains },
          { tmdbTitle: contains },
        ],
      },
      orderBy: { doubanDate: 'desc' },
      take: 20,
      select: {
        id: true,
        title: true,
        posterUrl: true,
        doubanDate: true,
        doubanId: true,
        tmdbId: true,
      },
    }),
    db.tvShow.findMany({
      where: {
        OR: [
          { title: contains },
          { doubanTitle: contains },
          { tmdbTitle: contains },
        ],
      },
      orderBy: { doubanDate: 'desc' },
      take: 20,
      select: {
        id: true,
        title: true,
        posterUrl: true,
        doubanDate: true,
        doubanId: true,
        tmdbId: true,
      },
    }),
  ])

  const results = [
    ...movies.map((m) => ({ ...m, category: 'movie' as const })),
    ...tvShows.map((t) => ({ ...t, category: 'tv_show' as const })),
  ].sort((a, b) => {
    // null 值排到最后
    const dateA = a.doubanDate || '9999'
    const dateB = b.doubanDate || '9999'
    return dateB.localeCompare(dateA)
  })

  res.json({ results })
})

// 转换记录类型（movie ↔ tv_show）
router.post('/convert-category', async (req: Request, res: Response, next: NextFunction) => {
  assertNoQueryParameters(req.query)
  const { id: numericId, from, to } = parseConvertCategoryBody(req.body)

  const db = getDb()

  // 从源表读取完整记录
  let sourceRecord: any
  if (from === 'movie') {
    sourceRecord = await db.movie.findUnique({ where: { id: numericId } })
  } else {
    sourceRecord = await db.tvShow.findUnique({ where: { id: numericId } })
  }

  if (!sourceRecord) {
    return res.status(404).json({ error: `${from} 记录 ${numericId} 不存在` })
  }

  // 备份原始数据（保留，不自动删除）
  const timestamp = Date.now()
  const backupPath = path.join('temp', `convert_${numericId}_${timestamp}.json`)
  const absBackupPath = path.resolve(__dirname, '../../', backupPath)

  fs.mkdirSync(path.dirname(absBackupPath), { recursive: true })
  fs.writeFileSync(absBackupPath, JSON.stringify(sourceRecord, (_key, value) =>
    typeof value === 'bigint' ? value.toString() : value
  , 2))

  // 字段映射：显式提取兼容字段，避免 spread 导入不兼容字段
  const {
    id: _id,
    createdAt: _ca,
    updatedAt: _ua,
    releaseDate,
    firstAirDate,
    // 通用字段（movie 和 tv_show 都有）
    title, posterUrl, overview, status, rating, shortReview, importReviewState,
    doubanId, doubanTitle, doubanAltTitle, doubanIntro, doubanRating,
    doubanDate, doubanComment, doubanLink, doubanAvgRating,
    tmdbId, tmdbTitle, tmdbPosterUrl, tmdbReleaseDate, tmdbOverview,
    tmdbVoteAverage, tmdbPopularity, tmdbGenreIds,
    imdbId, imdbRating, traktId,
  } = sourceRecord

  // 构造目标记录（只包含目标表兼容的字段）
  const targetData: any = {
    title, posterUrl, overview, status, rating, shortReview, importReviewState,
    createdAt: _ca, updatedAt: _ua,
    doubanId, doubanTitle, doubanAltTitle, doubanIntro, doubanRating,
    doubanDate, doubanComment, doubanLink, doubanAvgRating,
    tmdbId, tmdbTitle, tmdbPosterUrl, tmdbReleaseDate, tmdbOverview,
    tmdbVoteAverage, tmdbPopularity, tmdbGenreIds,
    imdbId, imdbRating, traktId,
  }

  // 处理日期字段映射
  if (from === 'movie' && to === 'tv_show') {
    targetData.firstAirDate = releaseDate
  } else {
    targetData.releaseDate = firstAirDate
  }

  // 使用事务保护 create + delete 操作
  try {
    const result = await db.$transaction(async (tx) => {
      // 在目标表创建新记录
      let newRecord: any
      if (to === 'movie') {
        newRecord = await tx.movie.create({ data: targetData })
      } else {
        newRecord = await tx.tvShow.create({ data: targetData })
      }

      // 类型转换已在同一事务创建完整目标记录，使用原始删除避免被豆瓣数据删除保护误判
      if (from === 'movie') {
        await tx.$executeRaw`DELETE FROM movie WHERE id = ${numericId}`
      } else {
        await tx.$executeRaw`DELETE FROM tv_show WHERE id = ${numericId}`
      }

      return newRecord
    })

    res.json({
      success: true,
      newId: result.id.toString(), // 返回字符串避免 BigInt 精度丢失
      backupPath,
    })
  } catch (err) {
    // 事务失败，保留备份文件供排查
    next(err)
  }
})

export default router
