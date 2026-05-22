import { Router, Request, Response } from 'express';
import { listRecords, updateRecord } from '../services/LibraryService';

const router = Router();

// GET /api/library — 游标分页混合列表
router.get('/', async (req: Request, res: Response) => {
  const cursor = req.query.cursor as string | undefined;
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
  const result = await listRecords({ cursor, limit });
  res.json(result);
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