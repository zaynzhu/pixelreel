import { Router, Request, Response } from 'express';
import { listTimelineRecords, listTimelineYears } from '../services/TimelineService';
import {
  parseBooleanParameter,
  parseEnumParameter,
  parsePaginationCursorParameter,
  parsePositiveIntegerParameter,
  parseRecordStatusParameter,
  parseYearParameter,
  RequestValidationError,
} from './request-validation';

const router = Router();
const TIMELINE_CATEGORIES = ['all', 'media', 'movie', 'tv_show', 'game'] as const;
const TIMELINE_LIST_PARAMETER_KEYS = new Set([
  'cursor', 'limit', 'includeTotals', 'category', 'year', 'status',
]);
const TIMELINE_YEARS_PARAMETER_KEYS = new Set(['category']);

function assertKnownTimelineParameters(query: Record<string, unknown>, allowedKeys: ReadonlySet<string>) {
  const unknownKey = Object.keys(query).find(key => !allowedKeys.has(key));
  if (unknownKey) throw new RequestValidationError(`未知参数: ${unknownKey}`);
}

export function parseTimelineCategory(value: unknown) {
  return parseEnumParameter(value, 'category', TIMELINE_CATEGORIES) ?? 'all';
}

export function parseTimelineListParameters(query: Record<string, unknown>) {
  assertKnownTimelineParameters(query, TIMELINE_LIST_PARAMETER_KEYS);
  return {
    cursor: parsePaginationCursorParameter(query.cursor) ?? undefined,
    limit: parsePositiveIntegerParameter(query.limit, 'limit', 96, 200),
    includeTotals: parseBooleanParameter(query.includeTotals, 'includeTotals', true),
    category: parseTimelineCategory(query.category),
    year: parseYearParameter(query.year) ?? undefined,
    status: parseRecordStatusParameter(query.status, null) ?? undefined,
  };
}

export function parseTimelineYearsParameters(query: Record<string, unknown>) {
  assertKnownTimelineParameters(query, TIMELINE_YEARS_PARAMETER_KEYS);
  return parseTimelineCategory(query.category);
}

router.get('/years', async (req: Request, res: Response) => {
  const category = parseTimelineYearsParameters(req.query);
  const years = await listTimelineYears(category);
  res.json({ years });
});

router.get('/', async (req: Request, res: Response) => {
  const parameters = parseTimelineListParameters(req.query as Record<string, unknown>);
  const result = await listTimelineRecords(parameters);

  res.json(result);
});

export default router;
