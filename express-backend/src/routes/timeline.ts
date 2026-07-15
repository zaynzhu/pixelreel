import { Router, Request, Response } from 'express';
import { listTimelineRecords, listTimelineYears } from '../services/TimelineService';
import {
  parseBooleanParameter,
  parseEnumParameter,
  parsePaginationCursorParameter,
  parsePositiveIntegerParameter,
  parseRecordStatusParameter,
  parseYearParameter,
} from './request-validation';

const router = Router();
const TIMELINE_CATEGORIES = ['all', 'media', 'movie', 'tv_show', 'game'] as const;

export function parseTimelineCategory(value: unknown) {
  return parseEnumParameter(value, 'category', TIMELINE_CATEGORIES) ?? 'all';
}

export function parseTimelineListParameters(query: Record<string, unknown>) {
  return {
    cursor: parsePaginationCursorParameter(query.cursor) ?? undefined,
    limit: parsePositiveIntegerParameter(query.limit, 'limit', 96, 200),
    includeTotals: parseBooleanParameter(query.includeTotals, 'includeTotals', true),
    category: parseTimelineCategory(query.category),
    year: parseYearParameter(query.year) ?? undefined,
    status: parseRecordStatusParameter(query.status, null) ?? undefined,
  };
}

router.get('/years', async (req: Request, res: Response) => {
  const category = parseTimelineCategory(req.query.category);
  const years = await listTimelineYears(category);
  res.json({ years });
});

router.get('/', async (req: Request, res: Response) => {
  const parameters = parseTimelineListParameters(req.query as Record<string, unknown>);
  const result = await listTimelineRecords(parameters);

  res.json(result);
});

export default router;
