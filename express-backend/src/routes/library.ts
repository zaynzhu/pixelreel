import { Router, Request, Response, NextFunction } from 'express';
import { listRecords, updateRecord, getRecord, getRandomRecord, getRandomRecords } from '../services/LibraryService';
import {
  parseBooleanParameter,
  parseEnumParameter,
  parseLibraryRecordUpdateBody,
  parsePaginationCursorParameter,
  parsePositiveIntegerParameter,
  parseRecordStatusParameter,
  parseRequiredPositiveIntegerParameter,
  parseStringParameter,
  parseYearParameter,
  RequestValidationError,
} from './request-validation';

const router = Router();
const LIBRARY_CATEGORIES = ['all', 'media', 'movie', 'tv_show', 'game'] as const;
const RECORD_CATEGORIES = ['movie', 'tv_show', 'tvshow', 'game'] as const;
const LIBRARY_LIST_PARAMETER_KEYS = new Set([
  'cursor', 'limit', 'includeTotals', 'category', 'year', 'status',
]);
const LIBRARY_RANDOM_PARAMETER_KEYS = new Set(['limit', 't']);

function assertKnownLibraryParameters(query: Record<string, unknown>, allowedKeys: ReadonlySet<string>) {
  const unknownKey = Object.keys(query).find(key => !allowedKeys.has(key));
  if (unknownKey) throw new RequestValidationError(`未知参数: ${unknownKey}`);
}

export function parseLibraryListParameters(query: Record<string, unknown>) {
  assertKnownLibraryParameters(query, LIBRARY_LIST_PARAMETER_KEYS);
  return {
    cursor: parsePaginationCursorParameter(query.cursor) ?? undefined,
    limit: parsePositiveIntegerParameter(query.limit, 'limit', 50, 200),
    includeTotals: parseBooleanParameter(query.includeTotals, 'includeTotals', true),
    category: parseEnumParameter(query.category, 'category', LIBRARY_CATEGORIES) ?? 'all',
    year: parseYearParameter(query.year) ?? undefined,
    status: parseRecordStatusParameter(query.status, null) ?? undefined,
  };
}

export function parseLibraryRandomParameters(query: Record<string, unknown>) {
  assertKnownLibraryParameters(query, LIBRARY_RANDOM_PARAMETER_KEYS);
  if (query.t != null) parseRequiredPositiveIntegerParameter(query.t, 't');
  return parsePositiveIntegerParameter(query.limit, 'limit', 1, 20);
}

export function parseLibraryRecordCategory(value: unknown) {
  const normalized = parseStringParameter(value, 'category', true)!.toLowerCase();
  return parseEnumParameter(normalized, 'category', RECORD_CATEGORIES, true)!;
}

// GET /api/library — 游标分页混合列表，支持 category/year/status 筛选
router.get('/', async (req: Request, res: Response) => {
  const parameters = parseLibraryListParameters(req.query as Record<string, unknown>);
  const result = await listRecords(parameters);
  res.json(result);
});

// GET /api/library/random — 随机获取记录（?limit=N，默认 1）
router.get('/random', async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    const limit = parseLibraryRandomParameters(req.query);
    if (limit === 1) {
      const record = await getRandomRecord();
      if (!record) {
        res.status(404).json({ error: 'No records found' });
        return;
      }
      res.json(record);
    } else {
      const records = await getRandomRecords(limit);
      if (records.length === 0) {
        res.status(404).json({ error: 'No records found' });
        return;
      }
      res.json(records);
    }
  } catch (err) {
    next(err);
  }
});

// GET /api/library/:category/:id — 获取单条完整记录
router.get('/:category/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const category = parseLibraryRecordCategory(req.params.category);
    const id = parseRequiredPositiveIntegerParameter(req.params.id, 'id');
    const result = await getRecord(category, id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/library/:category/:id — 更新记录状态/评分/短评（不变）
router.patch('/:category/:id', async (req: Request, res: Response, next: NextFunction) => {
  const category = parseLibraryRecordCategory(req.params.category);
  const id = parseRequiredPositiveIntegerParameter(req.params.id, 'id');
  const request = parseLibraryRecordUpdateBody(req.body);

  try {
    const result = await updateRecord(category, id, {
      status: request.status,
      rating: request.rating,
      shortReview: request.shortReview,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
