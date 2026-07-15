import { Router, Request, Response, NextFunction } from 'express';
import {
  getRandomRecord,
  getRandomRecords,
  getRecord,
  listRecords,
  parseLibraryCursor,
  updateRecord,
} from '../services/LibraryService';
import {
  applyImportReviewDecision,
  ImportReviewDecision,
  ImportReviewRecordRef,
} from '../services/ImportReviewService';
import {
  assertNoQueryParameters,
  parseBooleanParameter,
  parseBoundedStringParameter,
  parseEnumParameter,
  parseLibraryRecordUpdateBody,
  parsePositiveIntegerParameter,
  parseRecordStatusParameter,
  parseRequiredPositiveIntegerParameter,
  parseStringParameter,
  parseYearParameter,
  RequestValidationError,
} from './request-validation';

const router = Router();
const LIBRARY_CATEGORIES = ['all', 'media', 'movie', 'tv_show', 'game'] as const;
const LIBRARY_SOURCES = [
  'all', 'douban', 'tmdb', 'imdb', 'trakt',
  'steam', 'rawg', 'xbox', 'psn', 'manual',
] as const;
const LIBRARY_REVIEW_FILTERS = ['all', 'reviewed', 'unreviewed'] as const;
const LIBRARY_IMPORT_REVIEW_FILTERS = ['all', 'pending', 'accepted', 'ignored'] as const;
const LIBRARY_SORTS = ['recent', 'rating'] as const;
const RECORD_CATEGORIES = ['movie', 'tv_show', 'tvshow', 'game'] as const;
const LIBRARY_LIST_PARAMETER_KEYS = new Set([
  'cursor', 'limit', 'includeTotals', 'category', 'year', 'status',
  'query', 'source', 'review', 'importReview', 'sort',
]);
const LIBRARY_RANDOM_PARAMETER_KEYS = new Set(['limit', 't']);

function assertKnownLibraryParameters(query: Record<string, unknown>, allowedKeys: ReadonlySet<string>) {
  const unknownKey = Object.keys(query).find(key => !allowedKeys.has(key));
  if (unknownKey) throw new RequestValidationError(`未知参数: ${unknownKey}`);
}

export function parseLibraryListParameters(query: Record<string, unknown>) {
  assertKnownLibraryParameters(query, LIBRARY_LIST_PARAMETER_KEYS);
  const sort = parseEnumParameter(query.sort, 'sort', LIBRARY_SORTS) ?? 'recent';
  const cursor = parseBoundedStringParameter(query.cursor, 'cursor', 1000) ?? undefined;
  if (cursor && !parseLibraryCursor(cursor, sort)) {
    throw new RequestValidationError('cursor 与排序方式不匹配或格式无效');
  }
  return {
    cursor,
    limit: parsePositiveIntegerParameter(query.limit, 'limit', 50, 200),
    includeTotals: parseBooleanParameter(query.includeTotals, 'includeTotals', true),
    category: parseEnumParameter(query.category, 'category', LIBRARY_CATEGORIES) ?? 'all',
    year: parseYearParameter(query.year) ?? undefined,
    status: parseRecordStatusParameter(query.status, null) ?? undefined,
    query: parseBoundedStringParameter(query.query, 'query', 200) ?? undefined,
    source: parseEnumParameter(query.source, 'source', LIBRARY_SOURCES) ?? 'all',
    review: parseEnumParameter(query.review, 'review', LIBRARY_REVIEW_FILTERS) ?? 'all',
    importReview: parseEnumParameter(
      query.importReview, 'importReview', LIBRARY_IMPORT_REVIEW_FILTERS,
    ) ?? 'all',
    sort,
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

export function parseImportReviewDecisionBody(value: unknown): {
  decision: ImportReviewDecision;
  records: ImportReviewRecordRef[];
} {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RequestValidationError('请求体必须是对象');
  }
  const body = value as Record<string, unknown>;
  const unknownKey = Object.keys(body).find(key => !['decision', 'records'].includes(key));
  if (unknownKey) throw new RequestValidationError(`未知字段: ${unknownKey}`);

  const decision = parseEnumParameter(
    body.decision, 'decision', ['ACCEPTED', 'IGNORED'] as const, true,
  )!;
  if (!Array.isArray(body.records) || body.records.length < 1 || body.records.length > 100) {
    throw new RequestValidationError('records 必须包含 1 到 100 条记录');
  }

  const seen = new Set<string>();
  const records = body.records.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new RequestValidationError(`records[${index}] 必须是对象`);
    }
    const record = value as Record<string, unknown>;
    const unknownRecordKey = Object.keys(record).find(key => !['category', 'id'].includes(key));
    if (unknownRecordKey) {
      throw new RequestValidationError(`records[${index}] 包含未知字段: ${unknownRecordKey}`);
    }
    const category = parseEnumParameter(
      record.category, `records[${index}].category`, ['movie', 'tv_show', 'game'] as const, true,
    )!;
    const id = typeof record.id === 'number'
      ? record.id
      : parseRequiredPositiveIntegerParameter(record.id, `records[${index}].id`);
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new RequestValidationError(`records[${index}].id 必须是正整数`);
    }
    const key = `${category}:${id}`;
    if (seen.has(key)) throw new RequestValidationError(`records[${index}] 与前项重复`);
    seen.add(key);
    return { category, id };
  });

  return { decision, records };
}

// GET /api/library — 游标分页混合列表，支持类别、状态、来源、日志和关键词筛选
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

// POST /api/library/import-review — 批量接受或忽略导入记录，不删除数据
router.post('/import-review', async (req: Request, res: Response) => {
  assertNoQueryParameters(req.query);
  const request = parseImportReviewDecisionBody(req.body);
  res.json(await applyImportReviewDecision(request.records, request.decision));
});

// GET /api/library/:category/:id — 获取单条完整记录
router.get('/:category/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    assertNoQueryParameters(req.query);
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
  assertNoQueryParameters(req.query);
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
