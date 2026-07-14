import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { Request, Response } from 'express';
import { config, validateAuthConfiguration } from '../config';
import { RecordStatus } from '../enums/RecordStatus';
import { authMiddleware } from '../middlewares/auth';
import { errorHandler, getHttpErrorResponse } from '../middlewares/errorHandler';
import {
  assertRecordDeletionAllowed,
  ProtectedDoubanDataError,
} from '../middlewares/activity-log';
import { getAuthStatus } from '../routes/auth';
import { parseActivityCursor } from '../routes/activity';
import { getHealthStatus } from '../routes/health';
import {
  parsePositiveIntegerParameter,
  parsePositiveBigIntParameter,
  parseDateParameter,
  parseLibraryRecordUpdateBody,
  parseRecordStatusParameter,
  parseRequiredPositiveIntegerParameter,
  parseStringParameter,
  RequestValidationError,
} from '../routes/request-validation';
import {
  formatEnvLine,
  serializeSettingValue,
  validateAuthSettingValues,
  validateSettingValues,
} from '../routes/settings';
import { effectiveGameStatus, isImportedGame } from '../services/ProfileSummaryService';
import { resolveSteamImportStatus } from '../services/import/SteamOwnedGamesImportService';
import {
  getExternalServiceKey,
  RateLimiter,
  shouldRateLimitRequest,
} from '../services/external-api-rate-limiter';
import {
  buildDoubanRawData,
  buildMissingDoubanRawData,
} from '../services/douban-harvester/import-service';
import { INTERRUPTED_TASK_ERROR, TaskConflictError, TaskManager } from '../services/task-manager';

test('敏感配置只返回已配置标记', () => {
  assert.deepEqual(serializeSettingValue(true, 'secret-value'), {
    value: '',
    configured: true,
  });
  assert.deepEqual(serializeSettingValue(false, 'visible-value'), {
    value: 'visible-value',
    configured: false,
  });
});

test('配置更新拒绝无效类型和危险字符', () => {
  assert.equal(validateSettingValues({ AUTH_ENABLED: 'yes' }), 'AUTH_ENABLED 必须是 true 或 false');
  assert.equal(validateSettingValues({ PORT: '70000' }), 'PORT 必须是 1 到 65535 之间的整数');
  assert.equal(validateSettingValues({ IMAGE_PROXY_MAX_BYTES: '-1' }), 'IMAGE_PROXY_MAX_BYTES 必须是非负数字');
  assert.equal(validateSettingValues({ HOST: '127.0.0.1\nINJECTED=true' }), 'HOST 不能包含换行');
  assert.equal(validateSettingValues({ HOST: '"127.0.0.1"' }), 'HOST 不能包含引号');
  assert.equal(validateSettingValues({ UNKNOWN_SETTING: 'value' }), '未知配置项: UNKNOWN_SETTING');
  assert.equal(validateSettingValues({ AUTH_ENABLED: 'false', PORT: '18889' }), null);
});

test('配置值仅在需要时添加引号', () => {
  assert.equal(formatEnvLine('HOST', '127.0.0.1'), 'HOST=127.0.0.1');
  assert.equal(formatEnvLine('DOUBAN_DATA_DIR', '/path/with space'), 'DOUBAN_DATA_DIR="/path/with space"');
  assert.equal(formatEnvLine('CORS_ALLOWED_ORIGINS', 'http://localhost:18888#local'), 'CORS_ALLOWED_ORIGINS="http://localhost:18888#local"');
});

test('导入参数拒绝无效 limit、status 和标识值', () => {
  assert.equal(parsePositiveIntegerParameter(undefined, 'limit', 50, 100), 50);
  assert.equal(parsePositiveIntegerParameter('100', 'limit', 50, 100), 100);
  assert.throws(() => parsePositiveIntegerParameter('0', 'limit', 50, 100), RequestValidationError);
  assert.throws(() => parsePositiveIntegerParameter('1.5', 'limit', 50, 100), RequestValidationError);
  assert.throws(() => parsePositiveIntegerParameter('101', 'limit', 50, 100), RequestValidationError);
  assert.equal(parseRecordStatusParameter(undefined, null), null);
  assert.equal(parseRecordStatusParameter('done', RecordStatus.WANT), RecordStatus.DONE);
  assert.throws(() => parseRecordStatusParameter('INVALID', RecordStatus.WANT), RequestValidationError);
  assert.equal(parseStringParameter('  player-id  ', 'steamId'), 'player-id');
  assert.throws(() => parseStringParameter([], 'steamId'), RequestValidationError);
  assert.throws(() => parseStringParameter('  ', 'gamertag', true), RequestValidationError);
});

test('记录编辑请求拒绝非法 ID、状态、评分和短评', () => {
  assert.equal(parseRequiredPositiveIntegerParameter('42', 'id'), 42);
  assert.throws(() => parseRequiredPositiveIntegerParameter('0', 'id'), RequestValidationError);
  assert.throws(() => parseRequiredPositiveIntegerParameter('1.5', 'id'), RequestValidationError);
  assert.throws(() => parseRequiredPositiveIntegerParameter('9007199254740992', 'id'), RequestValidationError);
  assert.deepEqual(parseLibraryRecordUpdateBody({
    status: 'done',
    rating: 5,
    shortReview: '不错',
  }), {
    status: RecordStatus.DONE,
    rating: 5,
    shortReview: '不错',
  });
  assert.throws(() => parseLibraryRecordUpdateBody({ status: 'INVALID' }), RequestValidationError);
  assert.throws(() => parseLibraryRecordUpdateBody({ status: 'DONE', rating: 6 }), RequestValidationError);
  assert.throws(() => parseLibraryRecordUpdateBody({ status: 'DONE', shortReview: 'a'.repeat(1001) }), RequestValidationError);
  assert.throws(() => parseLibraryRecordUpdateBody({ status: 'DONE', doubanId: null }), RequestValidationError);
});

test('活动日志参数拒绝非法游标、ID 和日期', () => {
  assert.equal(parsePositiveBigIntParameter('9007199254740993', 'entityId'), 9007199254740993n);
  assert.throws(() => parsePositiveBigIntParameter('not-a-number', 'entityId'), RequestValidationError);
  assert.equal(parseDateParameter('2026-07-15T00:00:00.000Z', 'from')?.toISOString(), '2026-07-15T00:00:00.000Z');
  assert.throws(() => parseDateParameter('not-a-date', 'from'), RequestValidationError);
  assert.deepEqual(parseActivityCursor('2026-07-15T00:00:00.000Z__42'), {
    createdAt: new Date('2026-07-15T00:00:00.000Z'),
    id: 42n,
  });
  assert.throws(() => parseActivityCursor('2026-07-15T00:00:00.000Z__bad'), RequestValidationError);
  assert.throws(() => parseActivityCursor('invalid-cursor'), RequestValidationError);
  assert.equal(parseActivityCursor(undefined), null);
});

test('HTTP 错误响应保留 4xx 提示并隐藏 5xx 详情', () => {
  const requestError = getHttpErrorResponse(
    Object.assign(new Error('limit 必须是正整数'), { status: 400 }),
  );
  assert.equal(requestError.status, 400);
  assert.equal(requestError.message, 'limit 必须是正整数');
  assert.equal(requestError.internalMessage, 'limit 必须是正整数');
  assert.match(requestError.stack ?? '', /limit 必须是正整数/);
  const internalError = getHttpErrorResponse(new Error('DATABASE_URL=/secret/path'));
  assert.equal(internalError.status, 500);
  assert.equal(internalError.message, '内部服务器错误');
  assert.equal(internalError.internalMessage, 'DATABASE_URL=/secret/path');
  assert.equal(getHttpErrorResponse(Object.assign(new Error('bad status'), { status: 200 })).status, 500);

  let statusCode = 200;
  let responseBody: unknown;
  const response = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(body: unknown) {
      responseBody = body;
      return this;
    },
  } as unknown as Response;
  const originalConsoleError = console.error;
  console.error = () => {};
  try {
    errorHandler(new Error('mysql://user:password@private-host/database'), {} as Request, response, () => {});
  } finally {
    console.error = originalConsoleError;
  }
  assert.equal(statusCode, 500);
  assert.deepEqual(responseBody, { error: '内部服务器错误' });
});

test('启用认证时拒绝示例凭证和弱密码', () => {
  const insecureValues = {
    AUTH_ENABLED: 'false',
    JWT_SECRET: 'your-jwt-secret-here',
    JWT_USERNAME: 'zaynzhu',
    JWT_PASSWORD: '123456',
  };

  assert.equal(validateAuthSettingValues(insecureValues, { AUTH_ENABLED: 'true' }),
    '启用认证前必须设置至少 32 个字符的 JWT_SECRET，且不能使用示例值');
  assert.equal(validateAuthSettingValues(insecureValues, {
    AUTH_ENABLED: 'true',
    JWT_SECRET: 'a'.repeat(32),
  }), '启用认证前必须设置至少 8 个字符的 JWT_PASSWORD，且不能使用默认密码');
  assert.equal(validateAuthSettingValues(insecureValues, {
    AUTH_ENABLED: 'true',
    JWT_SECRET: 'a'.repeat(32),
    JWT_PASSWORD: 'secure-password',
  }), null);
  assert.equal(validateAuthConfiguration({
    enabled: false,
    secret: '',
    username: '',
    password: '',
  }), null);
});

test('同一外部服务的并发请求按两秒间隔排队', async () => {
  let now = 0;
  const waits: number[] = [];
  const limiter = new RateLimiter(2000, () => now, async (ms) => {
    waits.push(ms);
    now += ms;
  });

  await Promise.all([
    limiter.wait('themoviedb.org'),
    limiter.wait('themoviedb.org'),
    limiter.wait('themoviedb.org'),
  ]);

  assert.deepEqual(waits, [2000, 2000]);
  assert.equal(now, 4000);
});

test('外部 API 按服务主域名限流并排除图片代理下载', () => {
  assert.equal(getExternalServiceKey({ url: 'https://api.themoviedb.org/3/movie/1' }), 'themoviedb.org');
  assert.equal(getExternalServiceKey({ url: '/api/storesearch', baseURL: 'https://store.steampowered.com' }), 'steampowered.com');
  assert.equal(getExternalServiceKey({ url: 'http://127.0.0.1:18889/api/profile/summary' }), null);
  assert.equal(shouldRateLimitRequest({ url: 'https://api.rawg.io/api/games' }), true);
  assert.equal(shouldRateLimitRequest({ url: 'https://image.tmdb.org/poster.jpg', method: 'HEAD' }), false);
  assert.equal(shouldRateLimitRequest({ url: 'https://image.tmdb.org/poster.jpg', responseType: 'arraybuffer' }), false);
});

test('任务状态可跨进程恢复且终态不会被后续回调覆盖', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pixelreel-task-manager-'));
  const storagePath = path.join(tempDir, 'tasks.json');
  let now = new Date('2026-07-14T12:00:00.000Z');
  const activityLogger = async () => {};

  try {
    const firstManager = new TaskManager({ storagePath, now: () => now, activityLogger });
    assert.equal(firstManager.initialize(), 0);
    const runningTask = firstManager.createTask('test-import', '测试导入');
    assert.throws(
      () => firstManager.createTask('test-import', '重复导入'),
      (error: unknown) => error instanceof TaskConflictError && error.status === 409,
    );
    firstManager.updateProgress(runningTask.taskId, { processed: 3, total: 10, currentTitle: '第三条' });
    firstManager.flush();

    now = new Date('2026-07-14T12:01:00.000Z');
    const recoveredManager = new TaskManager({ storagePath, now: () => now, activityLogger });
    assert.equal(recoveredManager.initialize(), 1);
    const recoveredTask = recoveredManager.getTask(runningTask.taskId);
    assert.equal(recoveredTask?.status, 'failed');
    assert.equal(recoveredTask?.error, INTERRUPTED_TASK_ERROR);
    assert.equal(recoveredTask?.progress.processed, 3);
    assert.equal(recoveredTask?.progress.currentTitle, '');
    assert.equal(recoveredTask?.completedAt, now.toISOString());

    recoveredManager.completeTask(runningTask.taskId, { total: 10, imported: 10, skipped: 0, errors: [] });
    assert.equal(recoveredManager.getTask(runningTask.taskId)?.status, 'failed');

    const cancelledTask = recoveredManager.createTask('test-import', '取消测试');
    assert.deepEqual(recoveredManager.cancelTask(cancelledTask.taskId), { ok: true });
    recoveredManager.failTask(cancelledTask.taskId, '取消后的异步异常');
    assert.equal(recoveredManager.getTask(cancelledTask.taskId)?.status, 'cancelled');

    const reloadedManager = new TaskManager({ storagePath, now: () => now, activityLogger });
    assert.equal(reloadedManager.initialize(), 0);
    assert.equal(reloadedManager.getTask(runningTask.taskId)?.status, 'failed');
    assert.equal(reloadedManager.getTask(cancelledTask.taskId)?.status, 'cancelled');

    now = new Date('2026-07-14T12:32:00.001Z');
    const expiredManager = new TaskManager({ storagePath, now: () => now, activityLogger });
    assert.equal(expiredManager.initialize(), 0);
    assert.deepEqual(expiredManager.listTasks(), []);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('关闭认证时放行请求，开启认证时拒绝无令牌请求', () => {
  const mutableConfig = config as unknown as { authEnabled: boolean };
  const originalAuthEnabled = mutableConfig.authEnabled;
  let nextCalled = false;
  let statusCode = 200;
  let responseBody: unknown;
  const request = { headers: {} } as Request;
  const response = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(body: unknown) {
      responseBody = body;
      return this;
    },
  } as unknown as Response;

  try {
    mutableConfig.authEnabled = false;
    authMiddleware(request, response, () => { nextCalled = true; });
    assert.equal(nextCalled, true);

    nextCalled = false;
    mutableConfig.authEnabled = true;
    authMiddleware(request, response, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
    assert.equal(statusCode, 401);
    assert.deepEqual(responseBody, { error: '未提供认证令牌' });
  } finally {
    mutableConfig.authEnabled = originalAuthEnabled;
  }
});

test('认证状态接口与后端配置保持一致', () => {
  const mutableConfig = config as unknown as { authEnabled: boolean };
  const originalAuthEnabled = mutableConfig.authEnabled;

  try {
    mutableConfig.authEnabled = false;
    assert.deepEqual(getAuthStatus(), { enabled: false });

    mutableConfig.authEnabled = true;
    assert.deepEqual(getAuthStatus(), { enabled: true });
  } finally {
    mutableConfig.authEnabled = originalAuthEnabled;
  }
});

test('健康检查区分数据库正常和不可用', async () => {
  assert.deepEqual(await getHealthStatus(async () => {}), {
    status: 'ok',
    service: 'ok',
    database: 'ok',
  });
  assert.deepEqual(await getHealthStatus(async () => {
    throw new Error('database credentials leaked here');
  }), {
    status: 'degraded',
    service: 'ok',
    database: 'unavailable',
  });
});

test('豆瓣影视记录在 Prisma 写入层禁止删除', () => {
  assert.throws(
    () => assertRecordDeletionAllowed('Movie', { doubanId: '35517044' }),
    (error: unknown) => error instanceof ProtectedDoubanDataError && error.status === 403,
  );
  assert.throws(
    () => assertRecordDeletionAllowed('TvShow', { doubanId: '30170894' }),
    ProtectedDoubanDataError,
  );
  assert.doesNotThrow(() => assertRecordDeletionAllowed('Movie', { doubanId: null }));
  assert.doesNotThrow(() => assertRecordDeletionAllowed('Game', { doubanId: 'not-applicable' }));
});

test('豆瓣导入保留原始字段并且只补空值', () => {
  const item = {
    title: '测试片名',
    altTitle: '',
    intro: '2026 / 剧情',
    rating: '4.6',
    date: '2026-07-15',
    comment: '豆瓣原始短评',
    link: 'https://movie.douban.com/subject/12345678/',
  };

  assert.deepEqual(buildDoubanRawData(item), {
    doubanId: '12345678',
    doubanTitle: '测试片名',
    doubanAltTitle: '',
    doubanIntro: '2026 / 剧情',
    doubanRating: 5,
    doubanDate: '2026-07-15',
    doubanComment: '豆瓣原始短评',
    doubanLink: 'https://movie.douban.com/subject/12345678/',
  });
  assert.deepEqual(buildMissingDoubanRawData({
    doubanId: '12345678',
    doubanTitle: '已有标题',
    doubanAltTitle: null,
    doubanIntro: null,
    doubanRating: 3,
    doubanDate: null,
    doubanComment: '已有短评',
    doubanLink: null,
  }, item), {
    doubanAltTitle: '',
    doubanIntro: '2026 / 剧情',
    doubanDate: '2026-07-15',
    doubanLink: 'https://movie.douban.com/subject/12345678/',
  });
  assert.deepEqual(buildMissingDoubanRawData({
    doubanId: '87654321',
    doubanTitle: null,
  }, item), {});
});

test('已游玩的想玩游戏按进行中统计', () => {
  assert.equal(effectiveGameStatus({ status: 'WANT', playtimeMinutes: 30 }), 'IN_PROGRESS');
  assert.equal(effectiveGameStatus({ status: 'WANT', playtimeMinutes: 0 }), 'WANT');
  assert.equal(effectiveGameStatus({ status: 'DONE', playtimeMinutes: 30 }), 'DONE');
});

test('Steam 导入默认状态尊重显式状态和游玩时长', () => {
  assert.equal(resolveSteamImportStatus(undefined, 30), 'IN_PROGRESS');
  assert.equal(resolveSteamImportStatus(undefined, 0), 'WANT');
  assert.equal(resolveSteamImportStatus('DONE', 0), 'DONE');
});

test('外部平台标识可识别历史导入游戏', () => {
  assert.equal(isImportedGame({ steamAppId: 10n }), true);
  assert.equal(isImportedGame({ xboxId: 'xbox-id' }), true);
  assert.equal(isImportedGame({ importedAt: new Date() }), true);
  assert.equal(isImportedGame({}), false);
});
