import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { importSteamOwnedGames, backfillSteamData } from '../services/import/SteamOwnedGamesImportService';
import { importDoubanCsv } from '../services/import/DoubanCsvImportService';
import { fillMissingCovers } from '../services/import/RawgCoverFillService';
import { fillTmdbCovers } from '../services/import/TmdbCoverFillService';
import { startJsonImportTask, startFullHarvestTask, startIncrementalHarvestTask } from '../services/douban-harvester/import-service';
import { startEnrichBackfillTask } from '../services/import/TmdbEnrichBackfillService';
import { startTmdbDetailBackfillTask } from '../services/import/TmdbDetailBackfillService';
import { startImportSummaryTask } from '../services/import/ImportSummaryTaskService';
import {
  startPsnOwnedImportTask,
  startXboxOwnedImportTask,
} from '../services/import/PlatformGameImportTaskService';
import { verifyOpenXblConnection } from '../services/import/OpenXblImportService';
import { verifyMicrosoftXboxConnection } from '../services/xbox/MicrosoftXboxService';
import { microsoftXboxAuthStore } from '../services/xbox/MicrosoftXboxAuthStore';
import { verifyPsnProfilesConnection } from '../services/import/PsnProfilesImportService';
import { listTasks, cancelTask, getTask } from '../services/task-manager';
import { getSyncHistory } from '../services/SyncHistoryService';
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
const XBOX_GAMERTAG_PATH_SEPARATOR_PATTERN = /[/?\\]/;
const PSN_ACCOUNT_PATH_SEPARATOR_PATTERN = /[/?#\\]/;

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

function parseExternalAccountIdentifier(value: unknown, name: string, invalidPattern: RegExp): string | null {
  const parsed = parseBoundedStringParameter(value, name, 100);
  if (!parsed) return null;
  if (invalidPattern.test(parsed)) {
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
  assertKnownImportParameters(value, ['gamertag', 'status', 'provider']);
  return {
    gamertag: parseExternalAccountIdentifier(
      value.gamertag, 'gamertag', XBOX_GAMERTAG_PATH_SEPARATOR_PATTERN,
    ),
    status: parseRecordStatusParameter(value.status, null),
    provider: parseXboxProvider(value.provider),
  };
}

export function parseXboxConnectionParameters(value: Record<string, unknown>) {
  assertKnownImportParameters(value, ['gamertag', 'provider']);
  return {
    gamertag: parseExternalAccountIdentifier(
      value.gamertag, 'gamertag', XBOX_GAMERTAG_PATH_SEPARATOR_PATTERN,
    ),
    provider: parseXboxProvider(value.provider),
  };
}

function parseXboxProvider(value: unknown): 'openxbl' | 'microsoft' {
  const provider = parseBoundedStringParameter(value, 'provider', 20) ?? 'openxbl';
  if (provider !== 'openxbl' && provider !== 'microsoft') {
    throw new RequestValidationError('provider 必须是 openxbl 或 microsoft');
  }
  return provider;
}

export function parsePsnOwnedImportParameters(value: Record<string, unknown>) {
  assertKnownImportParameters(value, ['psnId', 'status']);
  return {
    psnId: parseExternalAccountIdentifier(
      value.psnId, 'psnId', PSN_ACCOUNT_PATH_SEPARATOR_PATTERN,
    ),
    status: parseRecordStatusParameter(value.status, null),
  };
}

export function parsePsnConnectionParameters(value: Record<string, unknown>) {
  assertKnownImportParameters(value, ['psnId']);
  return {
    psnId: parseExternalAccountIdentifier(
      value.psnId, 'psnId', PSN_ACCOUNT_PATH_SEPARATOR_PATTERN,
    ),
  };
}

export function resolvePlatformImportAccount(requestAccount: string | null, defaultAccount: string): string {
  return requestAccount ?? defaultAccount.trim();
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

type ImportSourceStatusConfig = {
  steamApiKey: string;
  steamDefaultId: string;
  traktClientId: string;
  traktAccessToken: string;
  doubanHarvestEnabled: boolean;
  doubanUserId: string;
  doubanCollectExists: boolean;
  openxblEnabled: boolean;
  openxblApiKey: string;
  openxblGamertag: string;
  microsoftXboxEnabled: boolean;
  microsoftXboxClientId: string;
  microsoftXboxClientSecret: string;
  microsoftXboxAuthorized: boolean;
  psnProfilesEnabled: boolean;
  psnProfilesAccountId: string;
};

type PlatformImportStatusConfig = Pick<
  ImportSourceStatusConfig,
  'openxblEnabled' | 'openxblApiKey' | 'openxblGamertag'
  | 'microsoftXboxEnabled' | 'microsoftXboxClientId' | 'microsoftXboxClientSecret'
  | 'microsoftXboxAuthorized'
  | 'psnProfilesEnabled' | 'psnProfilesAccountId'
>;

export function buildPlatformImportStatus(settings: PlatformImportStatusConfig) {
  const xboxReason = !settings.openxblEnabled
    ? 'disabled'
    : !settings.openxblApiKey.trim()
      ? 'missing_api_key'
      : settings.openxblGamertag.trim() ? null : 'missing_account';
  const psnReason = !settings.psnProfilesEnabled
    ? 'disabled'
    : settings.psnProfilesAccountId.trim() ? null : 'missing_account';
  const microsoftReason = settings.microsoftXboxAuthorized ? null : 'missing_authorization';
  const xboxAvailable = xboxReason == null || microsoftReason == null;

  return {
    xbox: {
      available: xboxAvailable,
      reason: xboxAvailable ? null : microsoftReason,
      providers: {
        openxbl: { available: xboxReason == null, reason: xboxReason },
        microsoft: { available: microsoftReason == null, reason: microsoftReason },
      },
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

function getCurrentPlatformImportStatus(accounts?: { gamertag?: string | null; psnId?: string | null }) {
  return buildPlatformImportStatus({
    openxblEnabled: config.openxbl.enabled,
    openxblApiKey: config.openxbl.apiKey,
    openxblGamertag: accounts?.gamertag ?? config.openxbl.gamertag,
    microsoftXboxEnabled: config.microsoftXbox.enabled,
    microsoftXboxClientId: config.microsoftXbox.clientId,
    microsoftXboxClientSecret: config.microsoftXbox.clientSecret,
    microsoftXboxAuthorized: microsoftXboxAuthStore.hasRefreshToken(),
    psnProfilesEnabled: config.psnProfiles.enabled,
    psnProfilesAccountId: accounts?.psnId ?? config.psnProfiles.accountId,
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
    openxblGamertag: config.openxbl.gamertag,
    microsoftXboxEnabled: config.microsoftXbox.enabled,
    microsoftXboxClientId: config.microsoftXbox.clientId,
    microsoftXboxClientSecret: config.microsoftXbox.clientSecret,
    microsoftXboxAuthorized: microsoftXboxAuthStore.hasRefreshToken(),
    psnProfilesEnabled: config.psnProfiles.enabled,
    psnProfilesAccountId: config.psnProfiles.accountId,
  });
}

class PlatformConnectionError extends Error {
  readonly status = 424;

  constructor(message: string) {
    super(message);
    this.name = 'PlatformConnectionError';
  }
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

// POST /api/import/xbox/owned/task?gamertag=xxx&status=WANT
router.post('/xbox/owned/task', (req: Request, res: Response) => {
  assertEmptyImportRequestBody(req.body);
  const { gamertag, status, provider } = parseXboxOwnedImportParameters(req.query);
  const account = resolvePlatformImportAccount(gamertag, config.openxbl.gamertag);
  const availability = getCurrentPlatformImportStatus({ gamertag: account }).xbox.providers[provider];
  if (!availability.available) {
    res.status(403).json({ error: getXboxUnavailableMessage(provider, availability.reason) });
    return;
  }
  const task = startXboxOwnedImportTask(provider, account, status);
  res.json({ taskId: task.taskId, status: task.status, type: task.type, label: task.label });
});

// POST /api/import/xbox/verify?gamertag=xxx — 只读验证账号和 title history
router.post('/xbox/verify', async (req: Request, res: Response) => {
  assertEmptyImportRequestBody(req.body);
  const { gamertag, provider } = parseXboxConnectionParameters(req.query);
  const account = resolvePlatformImportAccount(gamertag, config.openxbl.gamertag);
  const availability = getCurrentPlatformImportStatus({ gamertag: account }).xbox.providers[provider];
  if (!availability.available) {
    res.status(403).json({ error: getXboxUnavailableMessage(provider, availability.reason) });
    return;
  }
  try {
    res.json(provider === 'microsoft'
      ? await verifyMicrosoftXboxConnection()
      : await verifyOpenXblConnection(account));
  } catch (error) {
    throw new PlatformConnectionError(
      error instanceof Error ? error.message : 'Xbox 连接验证失败',
    );
  }
});

function getXboxUnavailableMessage(provider: 'openxbl' | 'microsoft', reason: string | null): string {
  if (provider === 'openxbl') {
    if (reason === 'missing_api_key') return '缺少 OpenXBL API Key';
    if (reason === 'missing_account') return '缺少 Xbox Gamertag';
    return 'OpenXBL 未启用';
  }
  if (reason === 'missing_client_id') return '缺少 Microsoft Xbox Client ID';
  if (reason === 'missing_client_secret') return '缺少 Microsoft Xbox Client Secret';
  if (reason === 'missing_authorization') return 'Microsoft Xbox 账号尚未授权';
  return 'Microsoft Xbox 同步未启用';
}

// POST /api/import/psn/owned/task?psnId=xxx&status=WANT
router.post('/psn/owned/task', (req: Request, res: Response) => {
  assertEmptyImportRequestBody(req.body);
  const { psnId, status } = parsePsnOwnedImportParameters(req.query);
  const account = resolvePlatformImportAccount(psnId, config.psnProfiles.accountId);
  const availability = getCurrentPlatformImportStatus({ psnId: account }).psn;
  if (!availability.available) {
    res.status(403).json({
      error: availability.reason === 'missing_account' ? '缺少 PSN 在线 ID' : 'PSNProfiles 未启用',
    });
    return;
  }
  const task = startPsnOwnedImportTask(account, status);
  res.json({ taskId: task.taskId, status: task.status, type: task.type, label: task.label });
});

// POST /api/import/psn/verify?psnId=xxx — 只读验证 PSNProfiles 档案首页
router.post('/psn/verify', async (req: Request, res: Response) => {
  assertEmptyImportRequestBody(req.body);
  const { psnId } = parsePsnConnectionParameters(req.query);
  const account = resolvePlatformImportAccount(psnId, config.psnProfiles.accountId);
  const availability = getCurrentPlatformImportStatus({ psnId: account }).psn;
  if (!availability.available) {
    res.status(403).json({
      error: availability.reason === 'missing_account' ? '缺少 PSN 在线 ID' : 'PSNProfiles 未启用',
    });
    return;
  }
  try {
    res.json(await verifyPsnProfilesConnection(account));
  } catch (error) {
    throw new PlatformConnectionError(
      error instanceof Error ? error.message : 'PSNProfiles 连接验证失败',
    );
  }
});

// POST /api/import/steam/backfill — 回填已有 Steam 游戏的海报和游玩时间
router.post('/steam/backfill', async (req: Request, res: Response) => {
  assertEmptyImportRequestBody(req.body);
  assertKnownImportParameters(req.query, []);
  const result = await runExclusiveImport('steam', 'Steam 导入或回填', backfillSteamData);
  res.json(result);
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

// GET /api/import/sources/history — 各正式来源最近一次同步终态，不包含凭据
router.get('/sources/history', (req: Request, res: Response) => {
  assertKnownImportParameters(req.query, []);
  res.json(getSyncHistory());
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
