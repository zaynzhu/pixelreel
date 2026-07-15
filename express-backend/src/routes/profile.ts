import { Router, Request, Response } from 'express';
import { getProfileSummary } from '../services/ProfileSummaryService';
import { assertNoQueryParameters } from './request-validation';

const router = Router();

// GET /api/profile/summary — 个人主页统计聚合
router.get('/summary', async (req: Request, res: Response) => {
  assertNoQueryParameters(req.query);
  const summary = await getProfileSummary();
  res.json(summary);
});

export default router;
