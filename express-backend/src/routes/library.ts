import { Router, Request, Response } from 'express';
import { listRecords, updateRecord, getRecord, getRandomRecord, getRandomRecords, normalizeCategory, parseYear, normalizeStatus } from '../services/LibraryService';
import {
  parseLibraryRecordUpdateBody,
  parseRequiredPositiveIntegerParameter,
} from './request-validation';

const router = Router();

// GET /api/library — 游标分页混合列表，支持 category/year/status 筛选
router.get('/', async (req: Request, res: Response) => {
  const cursor = req.query.cursor as string | undefined;
  const parsedLimit = parseInt(req.query.limit as string, 10);
  const limit = Math.min(Math.max(Number.isFinite(parsedLimit) ? parsedLimit : 50, 1), 200);
  const includeTotals = req.query.includeTotals !== 'false';
  const category = normalizeCategory(req.query.category as string | undefined);
  const year = parseYear(req.query.year as string | undefined);
  const status = normalizeStatus(req.query.status as string | undefined);
  const result = await listRecords({ cursor, limit, includeTotals, category, year, status });
  res.json(result);
});

// GET /api/library/random — 随机获取记录（?limit=N，默认 1）
router.get('/random', async (req: Request, res: Response) => {
  try {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    const limit = Math.min(parseInt(req.query.limit as string) || 1, 20);
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
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/library/:category/:id — 获取单条完整记录
router.get('/:category/:id', async (req: Request, res: Response) => {
  try {
    const category = req.params.category as string;
    const id = parseRequiredPositiveIntegerParameter(req.params.id, 'id');
    const result = await getRecord(category, id);
    res.json(result);
  } catch (err: any) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

// PATCH /api/library/:category/:id — 更新记录状态/评分/短评（不变）
router.patch('/:category/:id', async (req: Request, res: Response) => {
  const category = req.params.category as string;
  const id = parseRequiredPositiveIntegerParameter(req.params.id, 'id');
  const request = parseLibraryRecordUpdateBody(req.body);

  try {
    const result = await updateRecord(category, id, {
      status: request.status,
      rating: request.rating,
      shortReview: request.shortReview,
    });
    res.json(result);
  } catch (err: any) {
    const status = err.status || 400;
    res.status(status).json({ error: err.message });
  }
});

export default router;
