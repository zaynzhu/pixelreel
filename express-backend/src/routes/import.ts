import { Router, Request, Response } from 'express';
import multer from 'multer';
import { importSteamOwnedGames, backfillSteamData } from '../services/import/SteamOwnedGamesImportService';
import { importXboxOwnedGames } from '../services/import/OpenXblImportService';
import { importPsnOwnedGames } from '../services/import/PsnProfilesImportService';
import { importDoubanCsv } from '../services/import/DoubanCsvImportService';
import { fillMissingCovers } from '../services/import/RawgCoverFillService';
import { fillTmdbCovers } from '../services/import/TmdbCoverFillService';
import { startJsonImportTask, startFullHarvestTask, startIncrementalHarvestTask } from '../services/douban-harvester/import-service';
import { startEnrichBackfillTask } from '../services/import/TmdbEnrichBackfillService';
import { startTmdbDetailBackfillTask } from '../services/import/TmdbDetailBackfillService';
import { listTasks, cancelTask, getTask } from '../services/task-manager';
import { config } from '../config';
import { RecordStatus } from '../enums/RecordStatus';
import {
  parsePositiveIntegerParameter,
  parseRecordStatusParameter,
  parseStringParameter,
  RequestValidationError,
} from './request-validation';

const router = Router();
const IMPORT_DEFAULT_LIMIT = 50;
const IMPORT_MAX_LIMIT = 100;
const DOUBAN_HARVEST_MODES = new Set(['json', 'full', 'incremental']);

// multer 内存存储，用于豆瓣 CSV 上传
const upload = multer({ storage: multer.memoryStorage() });

// POST /api/import/steam/owned?steamId=xxx&status=WANT
router.post('/steam/owned', async (req: Request, res: Response) => {
  const steamId = parseStringParameter(req.query.steamId, 'steamId');
  const status = parseRecordStatusParameter(req.query.status, null);
  const result = await importSteamOwnedGames(steamId, status);
  res.json(result);
});

// POST /api/import/steam/backfill — 回填已有 Steam 游戏的海报和游玩时间
router.post('/steam/backfill', async (_req: Request, res: Response) => {
  const result = await backfillSteamData();
  res.json(result);
});

// POST /api/import/xbox/owned?gamertag=xxx&status=UNSET
router.post('/xbox/owned', async (req: Request, res: Response) => {
  const gamertag = parseStringParameter(req.query.gamertag, 'gamertag', true)!;
  const status = parseRecordStatusParameter(req.query.status, null);
  const result = await importXboxOwnedGames(gamertag, status);
  res.json(result);
});

// POST /api/import/psn/owned?psnId=xxx&status=UNSET
router.post('/psn/owned', async (req: Request, res: Response) => {
  const psnId = parseStringParameter(req.query.psnId, 'psnId', true)!;
  const status = parseRecordStatusParameter(req.query.status, null);
  const result = await importPsnOwnedGames(psnId, status);
  res.json(result);
});

// POST /api/import/douban — multipart 文件上传
router.post('/douban', upload.single('file'), async (req: Request, res: Response) => {
  const defaultStatus = parseRecordStatusParameter(req.query.status, RecordStatus.WANT);
  const file = req.file;
  const result = await importDoubanCsv(file, defaultStatus);
  res.json(result);
});

// POST /api/import/covers/fill?limit=50
router.post('/covers/fill', async (req: Request, res: Response) => {
  const limit = parsePositiveIntegerParameter(
    req.query.limit, 'limit', IMPORT_DEFAULT_LIMIT, IMPORT_MAX_LIMIT,
  );
  const result = await fillMissingCovers(limit);
  res.json(result);
});

// POST /api/import/tmdb-covers/fill?limit=50
router.post('/tmdb-covers/fill', async (req: Request, res: Response) => {
  const limit = parsePositiveIntegerParameter(
    req.query.limit, 'limit', IMPORT_DEFAULT_LIMIT, IMPORT_MAX_LIMIT,
  );
  const result = await fillTmdbCovers(limit);
  res.json(result);
});

// POST /api/import/tmdb-enrich/backfill?limit=50 — 为已有记录补充 TMDB 数据
router.post('/tmdb-enrich/backfill', (req: Request, res: Response) => {
  const limit = parsePositiveIntegerParameter(
    req.query.limit, 'limit', IMPORT_DEFAULT_LIMIT, IMPORT_MAX_LIMIT,
  );
  const task = startEnrichBackfillTask(limit);
  res.json({
    taskId: task.taskId,
    status: task.status,
    type: task.type,
    label: task.label,
  });
});

// POST /api/import/tmdb-detail/backfill?limit=50
router.post('/tmdb-detail/backfill', (req: Request, res: Response) => {
  const limit = parsePositiveIntegerParameter(
    req.query.limit, 'limit', IMPORT_DEFAULT_LIMIT, IMPORT_MAX_LIMIT,
  );
  const task = startTmdbDetailBackfillTask(limit);
  res.json({
    taskId: task.taskId,
    status: task.status,
    type: task.type,
    label: task.label,
  });
});

// POST /api/import/douban-harvest?mode=json|full|incremental
router.post('/douban-harvest', async (req: Request, res: Response) => {
  const mode = parseStringParameter(req.query.mode, 'mode') ?? 'json';
  if (!DOUBAN_HARVEST_MODES.has(mode)) {
    throw new RequestValidationError('mode 必须是 json、full、incremental 之一');
  }

  let task;
  switch (mode) {
    case 'full':
      if (!config.douban.harvestEnabled) {
        res.status(403).json({ error: '豆瓣浏览器收割已关闭，可使用 mode=json 导入已有数据' });
        return;
      }
      if (!config.douban.userId) {
        res.status(400).json({ error: '缺少 DOUBAN_USER_ID 配置' });
        return;
      }
      task = startFullHarvestTask();
      break;
    case 'incremental':
      if (!config.douban.harvestEnabled) {
        res.status(403).json({ error: '豆瓣浏览器收割已关闭，可使用 mode=json 导入已有数据' });
        return;
      }
      if (!config.douban.userId) {
        res.status(400).json({ error: '缺少 DOUBAN_USER_ID 配置' });
        return;
      }
      task = startIncrementalHarvestTask();
      break;
    case 'json':
    default:
      task = startJsonImportTask();
      break;
  }

  res.json({
    taskId: task.taskId,
    status: task.status,
    type: task.type,
    label: task.label,
  });
});

// GET /api/import/tasks — 所有任务列表
router.get('/tasks', (_req: Request, res: Response) => {
  res.json(listTasks());
});

// DELETE /api/import/tasks/:taskId — 取消任务
router.delete('/tasks/:taskId', (req: Request<{ taskId: string }>, res: Response) => {
  const result = cancelTask(req.params.taskId);
  if (!result.ok) {
    res.status(result.error === '任务不存在' ? 404 : 400).json({ error: result.error });
    return;
  }
  res.json({ ok: true });
});

// GET /api/import/douban-harvest/status?taskId=xxx
router.get('/douban-harvest/status', (req: Request, res: Response) => {
  const taskId = parseStringParameter(req.query.taskId, 'taskId', true)!;
  const task = getTask(taskId);
  if (!task) {
    res.status(404).json({ error: '任务不存在' });
    return;
  }
  res.json({
    taskId: task.taskId,
    status: task.status,
    type: task.type,
    label: task.label,
    progress: task.progress,
    result: task.result,
    error: task.error,
  });
});

export default router;
