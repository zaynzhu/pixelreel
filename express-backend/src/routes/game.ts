import { Router, Request, Response } from 'express';
import { prisma } from '../config/db';

const router = Router();

// GET /api/games - 列出所有游戏
router.get('/', async (_req: Request, res: Response) => {
  const games = await prisma.game.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(games);
});

// GET /api/games/:id - 获取单个游戏
router.get('/:id', async (req: Request, res: Response) => {
  const game = await prisma.game.findUnique({ where: { id: Number(req.params.id) } });
  if (!game) {
    res.status(404).json({ error: '游戏不存在' });
    return;
  }
  res.json(game);
});

// POST /api/games - 创建游戏
router.post('/', async (req: Request, res: Response) => {
  const { id, createdAt, updatedAt, ...data } = req.body;
  const game = await prisma.game.create({ data });
  res.json(game);
});

// PUT /api/games/:id - 更新游戏
router.put('/:id', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { id: _id, createdAt, updatedAt, ...data } = req.body;
  await prisma.game.update({ where: { id }, data });
  const game = await prisma.game.findUnique({ where: { id } });
  res.json(game);
});

// DELETE /api/games/:id - 删除游戏
router.delete('/:id', async (req: Request, res: Response) => {
  await prisma.game.delete({ where: { id: Number(req.params.id) } });
  res.status(204).end();
});

export default router;