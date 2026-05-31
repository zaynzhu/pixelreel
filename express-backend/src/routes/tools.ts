import { Router, Request, Response } from 'express'
import { getDb } from '../config/db'
import fs from 'fs'
import path from 'path'

const router = Router()

// 搜索电影和电视剧记录
router.get('/search', async (req: Request, res: Response) => {
  const query = (req.query.query as string || '').trim()
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
  ].sort((a, b) => (b.doubanDate || '').localeCompare(a.doubanDate || ''))

  res.json({ results })
})

// 转换记录类型（movie ↔ tv_show）
router.post('/convert-category', async (req: Request, res: Response) => {
  const { id, from, to } = req.body

  // 参数验证
  if (!id || !from || !to) {
    return res.status(400).json({ error: '缺少必填参数 id / from / to' })
  }
  if (from !== 'movie' && from !== 'tv_show') {
    return res.status(400).json({ error: 'from 必须是 movie 或 tv_show' })
  }
  if (to !== 'movie' && to !== 'tv_show') {
    return res.status(400).json({ error: 'to 必须是 movie 或 tv_show' })
  }
  if (from === to) {
    return res.status(400).json({ error: 'from 和 to 不能相同' })
  }

  const db = getDb()
  const numericId = BigInt(id)

  // 从源表读取完整记录
  let sourceRecord: any
  if (from === 'movie') {
    sourceRecord = await db.movie.findUnique({ where: { id: numericId } })
  } else {
    sourceRecord = await db.tvShow.findUnique({ where: { id: numericId } })
  }

  if (!sourceRecord) {
    return res.status(404).json({ error: `${from} 记录 ${id} 不存在` })
  }

  // 备份原始数据
  const timestamp = Date.now()
  const backupPath = path.join('temp', `convert_${id}_${timestamp}.json`)
  const absBackupPath = path.resolve(__dirname, '../../', backupPath)

  fs.mkdirSync(path.dirname(absBackupPath), { recursive: true })
  fs.writeFileSync(absBackupPath, JSON.stringify(sourceRecord, (_key, value) =>
    typeof value === 'bigint' ? value.toString() : value
  , 2))

  // 字段映射：构造目标记录
  const { id: _id, createdAt: _ca, updatedAt: _ua, releaseDate, firstAirDate, ...rest } = sourceRecord

  const targetData: any = { ...rest }
  if (from === 'movie' && to === 'tv_show') {
    targetData.firstAirDate = releaseDate
  } else {
    targetData.releaseDate = firstAirDate
  }

  // 在目标表创建新记录
  let newRecord: any
  if (to === 'movie') {
    newRecord = await db.movie.create({ data: targetData })
  } else {
    newRecord = await db.tvShow.create({ data: targetData })
  }

  // 删除源表记录
  if (from === 'movie') {
    await db.movie.delete({ where: { id: numericId } })
  } else {
    await db.tvShow.delete({ where: { id: numericId } })
  }

  // 删除备份文件
  try {
    fs.unlinkSync(absBackupPath)
  } catch {
    // 备份删除失败不影响主流程
  }

  res.json({
    success: true,
    newId: Number(newRecord.id),
    backupPath,
  })
})

export default router
