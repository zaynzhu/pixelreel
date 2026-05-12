import { Router, Request, Response } from 'express';
import { prisma } from '../config/db';

const router = Router();

// GET /api/tv-shows
router.get('/', async (_req: Request, res: Response) => {
  const shows = await prisma.tvShow.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(shows);
});

// GET /api/tv-shows/:id
router.get('/:id', async (req: Request, res: Response) => {
  const show = await prisma.tvShow.findUnique({ where: { id: Number(req.params.id) } });
  if (!show) {
    res.status(404).json({ error: '电视剧不存在' });
    return;
  }
  res.json(show);
});

// POST /api/tv-shows
router.post('/', async (req: Request, res: Response) => {
  const { id, createdAt, updatedAt, ...data } = req.body;
  const show = await prisma.tvShow.create({ data });
  res.json(show);
});

// PUT /api/tv-shows/:id
router.put('/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { id: _id, createdAt, updatedAt, ...data } = req.body;
  await prisma.tvShow.update({ where: { id }, data });
  const show = await prisma.tvShow.findUnique({ where: { id } });
  res.json(show);
});

// DELETE /api/tv-shows/:id
router.delete('/:id', async (req: Request, res: Response) => {
  await prisma.tvShow.delete({ where: { id: Number(req.params.id) } });
  res.status(204).end();
});

export default router;