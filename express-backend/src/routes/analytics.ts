import { Router, Request, Response, NextFunction } from 'express'
import { getAnalytics } from '../services/AnalyticsService'
import { parseYearParameter, RequestValidationError } from './request-validation'

const router = Router()
const ANALYTICS_PARAMETER_KEYS = new Set(['year'])

export function parseAnalyticsYear(value: unknown, defaultYear = new Date().getFullYear()) {
  return parseYearParameter(value) ?? defaultYear
}

export function parseAnalyticsParameters(
  query: Record<string, unknown>,
  defaultYear = new Date().getFullYear(),
) {
  const unknownKey = Object.keys(query).find(key => !ANALYTICS_PARAMETER_KEYS.has(key))
  if (unknownKey) throw new RequestValidationError(`未知参数: ${unknownKey}`)
  return parseAnalyticsYear(query.year, defaultYear)
}

// GET /api/analytics?year=2026 — 年度分析数据
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const year = parseAnalyticsParameters(req.query)
    const data = await getAnalytics(year)
    res.json(data)
  } catch (err) {
    next(err)
  }
})

export default router
