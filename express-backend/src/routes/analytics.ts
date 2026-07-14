import { Router, Request, Response, NextFunction } from 'express'
import { getAnalytics } from '../services/AnalyticsService'

const router = Router()

// GET /api/analytics?year=2026 — 年度分析数据
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const year = parseInt(req.query.year as string) || new Date().getFullYear()
    const data = await getAnalytics(year)
    res.json(data)
  } catch (err) {
    next(err)
  }
})

export default router
