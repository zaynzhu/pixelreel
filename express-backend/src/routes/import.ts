import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { importSteamOwnedGames, backfillSteamData } from '../services/import/SteamOwnedGamesImportService';
import {
  startPsnOwnedImportTask,
  startXboxOwnedImportTask,
} from '../services/import/PlatformGameImportTaskService';
import { importDoubanCsv } from '../services/import/DoubanCsvImportService';
import { fillMissingCovers } from '../services/import/RawgCoverFillService';
import { fillTmdbCovers } from '../services/import/TmdbCoverFillService';
import { startJsonImportTask, startFullHarvestTask, startIncrementalHarvestTask } from '../services/douban-harvester/import-service';
import { startEnrichBackfillTask } from '../services/import/TmdbEnrichBackfillService';
import { startTmdbDetailBackfillTask } from '../services/import/TmdbDetailBackfillService';
import { startImportSummaryTask } from '../services/import/ImportSummaryTaskService';
import { listTasks, cancelTask, getTask } from '../services/task-manager';
import { config } from '../config';
import { RecordStatus } from '../enums/RecordStatus';
import { runExclusiveImport } from '../services/import-operation-lock';
import {
  parseBoundedStringParameter,
  parsePositiveIntegerParameter,
  parseRecordStatusParameter,
  RequestValidationError,
} from './request-validation';

const router = Router();
const IMPORT_DEFAULT_LIMIT = 50;
const IMPORT_MAX_LIMIT = 100;
export const DOUBAN_CSV_MAX_BYTES = 5 * 1024 * 1024;
const DOUBAN_HARVEST_MODES = new Set(['json', 'full', 'incremental']);
const EXTERNAL_ACCOUNT_PATH_SEPARATOR_PATTERN = /[/?#\\]/;

export function assertKnownImportParameters(value: Record<string, unknown>, allowedKeys: string[]) {
  const unknownKey = Object.keys(value).find(key => !allowedKeys.includes(key));
  if (unknownKey) throw new RequestValidationError(`未知参数: ${unknownKey}`);
}

export function assertEmptyImportRequestBody(value: unknown) {
  if (value === undefined) return;
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value as Record<string, unknown>).length > 0) {
    throw new RequestValidationError('请求体必须为空');
  }
}

function parseExternalAccountIdentifier(value: unknown, name: string): string {
  const parsed = parseBoundedStringParameter(value, name, 100, true)!;
  if (EXTERNAL_ACCOUNT_PATH_SEPARATOR_PATTERN.test(parsed)) {
    throw new RequestValidationError(`${name} 格式无效`);
  }
  return parsed;
}

export function parseSteamOwnedImportParameters(value: Record<string, unknown>) {
  assertKnownImportParameters(value, ['steamId', 'status']);
  const steamId = parseBoundedStringParameter(value.steamId, 'steamId', 20);
  if (steamId && !/^[1-9]\d*$/.test(steamId)) {
    throw new RequestValidationError('steamId 必须是正整数');
  }
  return {
    steamId,
    status: parseRecordStatusParameter(value.status, null),
  };
}

export function parseXboxOwnedImportParameters(value: Record<string, unknown>) {
  assertKnownImportParameters(value, ['gamertag', 'status']);
  return {
    gamertag: parseExternalAccountIdentifier(value.gamertag, 'gamertag'),
    status: parseRecordStatusParameter(value.status, null),
  };
}

export function parsePsnOwnedImportParameters(value: Record<string, unknown>) {
  assertKnownImportParameters(value, ['psnId', 'status']);
  return {
    psnId: parseExternalAccountIdentifier(value.psnId, 'psnId'),
    status: parseRecordStatusParameter(value.status, null),
  };
}

export function parseImportLimitParameters(value: Record<string, unknown>): number {
  assertKnownImportParameters(value, ['limit']);
  return parsePositiveIntegerParameter(
    value.limit, 'limit', IMPORT_DEFAULT_LIMIT, IMPORT_MAX_LIMIT,
  );
}

export function parseDoubanCsvImportParameters(value: Record<string, unknown>): RecordStatus {
  assertKnownImportParameters(value, ['status']);
  return parseRecordStatusParameter(value.status, RecordStatus.WANT);
}

export function parseDoubanHarvestParameters(value: Record<string, unknown>): string {
  assertKnownImportParameters(value, ['mode']);
  const mode = parseBoundedStringParameter(value.mode, 'mode', 20) ?? 'json';
  if (!DOUBAN_HARVEST_MODES.has(mode)) {
    throw new RequestValidationError('mode 必须是 json、full、incremental 之一');
  }
  return mode;
}

export function parseImportTaskStatusParameters(value: Record<string, unknown>): string {
  assertKnownImportParameters(value, ['taskId']);
  return parseBoundedStringParameter(value.taskId, 'taskId', 100, true)!;
}

type PlatformImportStatusConfig = {
  openxblEnabled: boolean;
  openxblApiKey: string;
  psnProfilesEnabled: boolean;
};

type ImportSourceStatusConfig = PlatformImportStatusConfig & {
  steamApiKey: string;
  steamDefaultId: string;
  traktClientId: string;
  traktAccessToken: string;
  doubanHarvestEnabled: boolean;
  doubanUserId: string;
  doubanCollectExists: boolean;
};

export function buildPlatformImportStatus(settings: PlatformImportStatusConfig) {
  const xboxReason = !settings.openxblEnabled
    ? 'disabled'
    : settings.openxblApiKey.trim() ? null : 'missing_api_key';
  const psnReason = settings.psnProfilesEnabled ? null : 'disabled';
  return {
    xbox: {
      available: xboxReason == null,
      reason: xboxReason,
    },
    psn: {
      available: psnReason == null,
      reason: psnReason,
    },
  };
}

export function buildImportSourceStatus(settings: ImportSourceStatusConfig) {
  const platforms = buildPlatformImportStatus(settings);
  const steamReason = !settings.steamApiKey.trim()
    ? 'missing_api_key'
    : settings.steamDefaultId.trim() ? null : 'missing_account';
  const traktReason = !settings.traktClientId.trim()
    ? 'missing_client_id'
    : settings.traktAccessToken.trim() ? null : 'missing_access_token';
  const doubanHarvestReason = !settings.doubanHarvestEnabled
    ? 'disabled'
    : settings.doubanUserId.trim() ? null : 'missing_account';

  return {
    steam: {
      available: steamReason == null,
      reason: steamReason,
    },
    trakt: {
      available: traktReason == null,
      reason: traktReason,
    },
    douban: {
      available: settings.doubanCollectExists || doubanHarvestReason == null,
      reason: settings.doubanCollectExists || doubanHarvestReason == null
        ? null
        : doubanHarvestReason,
      modes: {
        json: {
          available: settings.doubanCollectExists,
          reason: settings.doubanCollectExists ? null : 'missing_data',
        },
        incremental: {
          available: doubanHarvestReason == null,
          reason: doubanHarvestReason,
        },
        full: {
          available: doubanHarvestReason == null,
          reason: doubanHarvestReason,
        },
      },
    },
    xbox: platforms.xbox,
    psn: platforms.psn,
  };
}

function getCurrentPlatformImportStatus() {
  return buildPlatformImportStatus({
    openxblEnabled: config.openxbl.enabled,
    openxblApiKey: config.openxbl.apiKey,
    psnProfilesEnabled: config.psnProfiles.enabled,
  });
}

function getCurrentImportSourceStatus() {
  return buildImportSourceStatus({
    steamApiKey: config.steam.apiKey,
    steamDefaultId: config.steam.defaultSteamId,
    traktClientId: config.trakt.clientId,
    traktAccessToken: config.trakt.accessToken,
    doubanHarvestEnabled: config.douban.harvestEnabled,
    doubanUserId: config.douban.userId,
    doubanCollectExists: fs.existsSync(path.join(config.douban.dataDir, 'collect.json')),
    openxblEnabled: config.openxbl.enabled,
    openxblApiKey: config.openxbl.apiKey,
    psnProfilesEnabled: config.psnProfiles.enabled,
  });
}

function assertPlatformImportAvailable(platform: 'xbox' | 'psn') {
  const state = getCurrentPlatformImportStatus()[platform];
  if (state.available) return;
  const message = state.reason === 'missing_api_key'
    ? '缺少 OpenXBL API Key'
    : `${platform === 'xbox' ? 'OpenXBL' : 'PSNProfiles'} 未启用`;
  throw Object.assign(new Error(message), { status: state.reason === 'disabled' ? 403 : 400 });
}

// multer 内存存储，用于豆瓣 CSV 上传
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: DOUBAN_CSV_MAX_BYTES,
    files: 1,
    fields: 0,
  },
});

export function getDoubanCsvUploadError(error: unknown) {
  if (!(error instanceof multer.MulterError)) return null;
  if (error.code === 'LIMIT_FILE_SIZE') {
    return { status: 413, message: `CSV 文件不能超过 ${DOUBAN_CSV_MAX_BYTES / 1024 / 1024} MiB` };
  }
  return { status: 400, message: '仅接受一个名为 file 的 CSV 文件' };
}

function uploadDoubanCsv(req: Request, res: Response, next: NextFunction) {
  upload.single('file')(req, res, (error) => {
    if (!error) {
      next();
      return;
    }
    const uploadError = getDoubanCsvUploadError(error);
    if (uploadError) {
      res.status(uploadError.status).json({ error: uploadError.message });
      return;
    }
    next(error);
  });
}

// POST /api/import/steam/owned?steamId=xxx&status=WANT
router.post('/steam/owned', async (req: Request, res: Response) => {
  assertEmptyImportRequestBody(req.body);
  const { steamId, status } = parseSteamOwnedImportParameters(req.query);
  const result = await runExclusiveImport(
    'steam',
    'Steam 导入或回填',
    () => importSteamOwnedGames(steamId, status),
  );
  res.json(result);
});

// POST /api/import/steam/owned/task — 同步中心使用的可取消持久化任务
router.post('/steam/owned/task', (req: Request, res: Response) => {
  assertEmptyImportRequestBody(req.body);
  const { steamId, status } = parseSteamOwnedImportParameters(req.query);
  const task = startImportSummaryTask(
    'steam-owned',
    'Steam 导入',
    (onProgress, signal) => runExclusiveImport(
      'steam',
      'Steam 导入或回填',
      () => importSteamOwnedGames(steamId, status, onProgress, signal),
    ),
  );
  res.json({ taskId: task.taskId, status: task.status, type: task.type, label: task.label });
});

// POST /api/import/steam/backfill — 回填已有 Steam 游戏的海报和游玩时间
router.post('/steam/backfill', async (req: Request, res: Response) => {
  assertEmptyImportRequestBody(req.body);
  assertKnownImportParameters(req.query, []);
  const result = await runExclusiveImport('steam', 'Steam 导入或回填', backfillSteamData);
  res.json(result);
});

// POST /api/import/xbox/owned?gamertag=xxx&status=UNSET
router.post('/xbox/owned', async (req: Request, res: Response) => {
  assertEmptyImportRequestBody(req.body);
  const { gamertag, status } = parseXboxOwnedImportParameters(req.query);
  assertPlatformImportAvailable('xbox');
  const task = startXboxOwnedImportTask(gamertag, status);
  res.json({ taskId: task.taskId, status: task.status, type: task.type, label: task.label });
});

// POST /api/import/psn/owned?psnId=xxx&status=UNSET
router.post('/psn/owned', async (req: Request, res: Response) => {
  assertEmptyImportRequestBody(req.body);
  const { psnId, status } = parsePsnOwnedImportParameters(req.query);
  assertPlatformImportAvailable('psn');
  const task = startPsnOwnedImportTask(psnId, status);
  res.json({ taskId: task.taskId, status: task.status, type: task.type, label: task.label });
});

// POST /api/import/douban — multipart 文件上传
router.post('/douban', uploadDoubanCsv, async (req: Request, res: Response) => {
  const defaultStatus = parseDoubanCsvImportParameters(req.query);
  const file = req.file;
  if (!file || file.size === 0) {
    res.status(400).json({ error: 'CSV 文件为空' });
    return;
  }
  const result = await runExclusiveImport(
    'douban-csv',
    '豆瓣 CSV 导入',
    () => importDoubanCsv(file, defaultStatus),
  );
  res.json(result);
});

// POST /api/import/covers/fill?limit=50
router.post('/covers/fill', async (req: Request, res: Response) => {
  assertEmptyImportRequestBody(req.body);
  const limit = parseImportLimitParameters(req.query);
  const result = await runExclusiveImport(
    'rawg-covers',
    'RAWG 封面回填',
    () => fillMissingCovers(limit),
  );
  res.json(result);
});

// POST /api/import/tmdb-covers/fill?limit=50
router.post('/tmdb-covers/fill', async (req: Request, res: Response) => {
  assertEmptyImportRequestBody(req.body);
  const limit = parseImportLimitParameters(req.query);
  const result = await runExclusiveImport(
    'tmdb-covers',
    'TMDB 封面回填',
    () => fillTmdbCovers(limit),
  );
  res.json(result);
});

// POST /api/import/tmdb-enrich/backfill?limit=50 — 为已有记录补充 TMDB 数据
router.post('/tmdb-enrich/backfill', (req: Request, res: Response) => {
  assertEmptyImportRequestBody(req.body);
  const limit = parseImportLimitParameters(req.query);
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
  assertEmptyImportRequestBody(req.body);
  const limit = parseImportLimitParameters(req.query);
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
  assertEmptyImportRequestBody(req.body);
  const mode = parseDoubanHarvestParameters(req.query);

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
router.get('/tasks', (req: Request, res: Response) => {
  assertKnownImportParameters(req.query, []);
  res.json(listTasks());
});

// GET /api/import/platforms/status — 主机平台导入可用性，不返回密钥或 Cookie
router.get('/platforms/status', (req: Request, res: Response) => {
  assertKnownImportParameters(req.query, []);
  res.json(getCurrentPlatformImportStatus());
});

// GET /api/import/sources/status — 同步中心来源可用性，不返回任何凭据
router.get('/sources/status', (req: Request, res: Response) => {
  assertKnownImportParameters(req.query, []);
  res.json(getCurrentImportSourceStatus());
});

// DELETE /api/import/tasks/:taskId — 取消任务
router.delete('/tasks/:taskId', (req: Request<{ taskId: string }>, res: Response) => {
  assertEmptyImportRequestBody(req.body);
  assertKnownImportParameters(req.query, []);
  const taskId = parseBoundedStringParameter(req.params.taskId, 'taskId', 100, true)!;
  const result = cancelTask(taskId);
  if (!result.ok) {
    res.status(result.error === '任务不存在' ? 404 : 400).json({ error: result.error });
    return;
  }
  res.json({ ok: true });
});

// GET /api/import/douban-harvest/status?taskId=xxx
router.get('/douban-harvest/status', (req: Request, res: Response) => {
  const taskId = parseImportTaskStatusParameters(req.query);
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
