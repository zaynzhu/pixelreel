import { Router, Request, Response } from 'express';
import { listRecords, updateRecord } from '../services/LibraryService';

const router = Router();

// GET /api/library — 混合列表（movie + game）
router.get('/', async (_req: Request, res: Response) => {
  const records = await listRecords();
  res.json(records);
});

// PATCH /api/library/:category/:id — 更新记录状态/评分/短评
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