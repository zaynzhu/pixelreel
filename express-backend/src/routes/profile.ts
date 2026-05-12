import { Router, Request, Response } from 'express';
import { getProfileSummary } from '../services/ProfileSummaryService';

const router = Router();

// GET /api/profile/summary — 个人主页统计聚合
router.get('/summary', async (_req: Request, res: Response) => {
  const summary = await getProfileSummary();
  res.json(summary);
});

export default router;