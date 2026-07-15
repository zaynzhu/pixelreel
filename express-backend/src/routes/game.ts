import { Router, Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { getDb } from '../config/db';
import {
  assertEmptyRequestBody,
  assertNoQueryParameters,
  parseGameRecordWriteBody,
  parseRequiredPositiveIntegerParameter,
} from './request-validation';
import {
  buildRecordListCursorWhere,
  createRecordListResponse,
  parseRecordListParameters,
} from './record-list';

const router = Router();

// GET /api/games - 游标分页列出游戏
router.get('/', async (req: Request, res: Response) => {
  const { cursor, limit } = parseRecordListParameters(req.query as Record<string, unknown>);
  const games = await getDb().game.findMany({
    where: buildRecordListCursorWhere(cursor),
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });
  res.json(createRecordListResponse(games, limit));
});

router.use((req, _res, next) => {
  assertNoQueryParameters(req.query);
  next();
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
  assertEmptyRequestBody(req.body);
  const id = parseRequiredPositiveIntegerParameter(req.params.id, 'id');
  await getDb().game.delete({ where: { id } });
  res.status(204).end();
});

export default router;
