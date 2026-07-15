import { Router, Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { getDb } from '../config/db';
import {
  assertEmptyRequestBody,
  assertNoQueryParameters,
  parseRequiredPositiveIntegerParameter,
  parseTvShowRecordWriteBody,
} from './request-validation';

const router = Router();

router.use((req, _res, next) => {
  assertNoQueryParameters(req.query);
  next();
});

// GET /api/tv-shows
router.get('/', async (_req: Request, res: Response) => {
  const shows = await getDb().tvShow.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(shows);
});

// GET /api/tv-shows/:id
router.get('/:id', async (req: Request, res: Response) => {
  const id = parseRequiredPositiveIntegerParameter(req.params.id, 'id');
  const show = await getDb().tvShow.findUnique({ where: { id } });
  if (!show) {
    res.status(404).json({ error: '电视剧不存在' });
    return;
  }
  res.json(show);
});

// POST /api/tv-shows
router.post('/', async (req: Request, res: Response) => {
  const data = parseTvShowRecordWriteBody(req.body, 'create') as Prisma.TvShowUncheckedCreateInput;
  const show = await getDb().tvShow.create({ data });
  res.json(show);
});

// PUT /api/tv-shows/:id
router.put('/:id', async (req: Request, res: Response) => {
  const id = parseRequiredPositiveIntegerParameter(req.params.id, 'id');
  const data = parseTvShowRecordWriteBody(req.body, 'update') as Prisma.TvShowUncheckedUpdateInput;
  await getDb().tvShow.update({ where: { id }, data });
  const show = await getDb().tvShow.findUnique({ where: { id } });
  res.json(show);
});

// DELETE /api/tv-shows/:id
router.delete('/:id', async (req: Request, res: Response) => {
  assertEmptyRequestBody(req.body);
  const id = parseRequiredPositiveIntegerParameter(req.params.id, 'id');
  await getDb().tvShow.delete({ where: { id } });
  res.status(204).end();
});

export default router;
