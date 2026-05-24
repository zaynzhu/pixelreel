import { Router, Request, Response } from 'express'
import { getAnalytics } from '../services/AnalyticsService'

const router = Router()

// GET /api/analytics?year=2026 — 年度分析数据
router.get('/', async (req: Request, res: Response) => {
  try {
    const year = parseInt(req.query.year as string) || new Date().getFullYear()
    const data = await getAnalytics(year)
    res.json(data)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
