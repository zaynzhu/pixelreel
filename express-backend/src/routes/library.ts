import { Router, Request, Response } from 'express';
import { listRecords, updateRecord, getRandomRecord, getRandomRecords } from '../services/LibraryService';

const router = Router();

// GET /api/library — 游标分页混合列表
router.get('/', async (req: Request, res: Response) => {
  const cursor = req.query.cursor as string | undefined;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const result = await listRecords({ cursor, limit });
  res.json(result);
});

// GET /api/library/random — 随机获取记录（?limit=N，默认 1）
router.get('/random', async (req: Request, res: Response) => {
  try {
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

// PATCH /api/library/:category/:id — 更新记录状态/评分/短评（不变）
router.patch('/:category/:id', async (req: Request, res: Response) => {
  const category = req.params.category as string;
  const id = Number(req.params.id);
  const request = req.body;

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