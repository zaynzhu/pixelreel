import { Router, Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { getDb } from '../config/db';
import {
  parseGameRecordWriteBody,
  parseRequiredPositiveIntegerParameter,
} from './request-validation';

const router = Router();

// GET /api/games - 列出所有游戏
router.get('/', async (_req: Request, res: Response) => {
  const games = await getDb().game.findMany({ orderBy: { createdAt: 'desc' } });
  res.json(games);
});

// GET /api/games/:id - 获取单个游戏
router.get('/:id', async (req: Request, res: Response) => {
  const id = parseRequiredPositiveIntegerParameter(req.params.id, 'id');
  const game = await getDb().game.findUnique({ where: { id } });
  if (!game) {
    res.status(404).json({ error: '游戏不存在' });
    return;
  }
  res.json(game);
});

// POST /api/games - 创建游戏
router.post('/', async (req: Request, res: Response) => {
  const data = parseGameRecordWriteBody(req.body, 'create') as Prisma.GameUncheckedCreateInput;
  const game = await getDb().game.create({ data });
  res.json(game);
});

// PUT /api/games/:id - 更新游戏
router.put('/:id', async (req: Request, res: Response) => {
  const id = parseRequiredPositiveIntegerParameter(req.params.id, 'id');
  const data = parseGameRecordWriteBody(req.body, 'update') as Prisma.GameUncheckedUpdateInput;
  await getDb().game.update({ where: { id }, data });
  const game = await getDb().game.findUnique({ where: { id } });
  res.json(game);
});

// DELETE /api/games/:id - 删除游戏
router.delete('/:id', async (req: Request, res: Response) => {
  const id = parseRequiredPositiveIntegerParameter(req.params.id, 'id');
  await getDb().game.delete({ where: { id } });
  res.status(204).end();
});

export default router;
