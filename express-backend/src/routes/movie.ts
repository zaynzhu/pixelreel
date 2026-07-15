import { Router, Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import { getDb } from '../config/db';
import {
  assertEmptyRequestBody,
  assertNoQueryParameters,
  parseMovieRecordWriteBody,
  parseRequiredPositiveIntegerParameter,
} from './request-validation';
import {
  buildRecordListCursorWhere,
  createRecordListResponse,
  parseRecordListParameters,
} from './record-list';

const router = Router();

// GET /api/movies - 游标分页列出电影
router.get('/', async (req: Request, res: Response) => {
  const { cursor, limit } = parseRecordListParameters(req.query as Record<string, unknown>);
  const movies = await getDb().movie.findMany({
    where: buildRecordListCursorWhere(cursor),
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
  });
  res.json(createRecordListResponse(movies, limit));
});

router.use((req, _res, next) => {
  assertNoQueryParameters(req.query);
  next();
});

// GET /api/movies/:id - 获取单部电影
router.get('/:id', async (req: Request, res: Response) => {
  const id = parseRequiredPositiveIntegerParameter(req.params.id, 'id');
  const movie = await getDb().movie.findUnique({ where: { id } });
  if (!movie) {
    res.status(404).json({ error: '电影不存在' });
    return;
  }
  res.json(movie);
});

// POST /api/movies - 创建电影
router.post('/', async (req: Request, res: Response) => {
  const data = parseMovieRecordWriteBody(req.body, 'create') as Prisma.MovieUncheckedCreateInput;
  const movie = await getDb().movie.create({ data });
  res.json(movie);
});

// PUT /api/movies/:id - 更新电影
router.put('/:id', async (req: Request, res: Response) => {
  const id = parseRequiredPositiveIntegerParameter(req.params.id, 'id');
  const data = parseMovieRecordWriteBody(req.body, 'update') as Prisma.MovieUncheckedUpdateInput;
  await getDb().movie.update({ where: { id }, data });
  const movie = await getDb().movie.findUnique({ where: { id } });
  res.json(movie);
});

// DELETE /api/movies/:id - 删除电影
router.delete('/:id', async (req: Request, res: Response) => {
  assertEmptyRequestBody(req.body);
  const id = parseRequiredPositiveIntegerParameter(req.params.id, 'id');
  await getDb().movie.delete({ where: { id } });
  res.status(204).end();
});

export default router;
