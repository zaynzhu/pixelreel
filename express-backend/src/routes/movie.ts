import { Router, Request, Response } from 'express';
import { getDb } from '../config/db';

const router = Router();

// GET /api/movies - 列出所有电影
router.get('/', async (_req: Request, res: Response) => {
  const movies = await getDb().movie.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(movies);
});

// GET /api/movies/:id - 获取单部电影
router.get('/:id', async (req: Request, res: Response) => {
  const movie = await getDb().movie.findUnique({ where: { id: Number(req.params.id) } });
  if (!movie) {
    res.status(404).json({ error: '电影不存在' });
    return;
  }
  res.json(movie);
});

// POST /api/movies - 创建电影
router.post('/', async (req: Request, res: Response) => {
  const { id, createdAt, updatedAt, ...data } = req.body;
  const movie = await getDb().movie.create({ data });
  res.json(movie);
});

// PUT /api/movies/:id - 更新电影
router.put('/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { id: _id, createdAt, updatedAt, ...data } = req.body;
  await getDb().movie.update({ where: { id }, data });
  const movie = await getDb().movie.findUnique({ where: { id } });
  res.json(movie);
});

// DELETE /api/movies/:id - 删除电影
router.delete('/:id', async (req: Request, res: Response) => {
  await getDb().movie.delete({ where: { id: Number(req.params.id) } });
  res.status(204).end();
});

export default router;