import { Router, Request, Response, NextFunction } from 'express'
import { getAnalytics } from '../services/AnalyticsService'
import { parseYearParameter } from './request-validation'

const router = Router()

export function parseAnalyticsYear(value: unknown, defaultYear = new Date().getFullYear()) {
  return parseYearParameter(value) ?? defaultYear
}

// GET /api/analytics?year=2026 — 年度分析数据
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const year = parseAnalyticsYear(req.query.year)
    const data = await getAnalytics(year)
    res.json(data)
  } catch (err) {
    next(err)
  }
})

export default router
