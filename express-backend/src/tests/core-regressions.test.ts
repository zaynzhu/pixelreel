import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { Request, Response } from 'express';
import multer from 'multer';
import { config, validateAuthConfiguration } from '../config';
import { RecordStatus } from '../enums/RecordStatus';
import { authMiddleware } from '../middlewares/auth';
import { errorHandler, getHttpErrorResponse } from '../middlewares/errorHandler';
import {
  assertProtectedDoubanFieldsUnchanged,
  assertRecordDeletionAllowed,
  ProtectedDoubanDataError,
} from '../middlewares/activity-log';
import {
  getAuthStatus,
  LoginAttemptLimiter,
  parseLoginBody,
  secureCredentialEqual,
} from '../routes/auth';
import { getUndoneLogId, parseActivityCursor, serializeLog } from '../routes/activity';
import { parseAnalyticsYear } from '../routes/analytics';
import { getHealthStatus } from '../routes/health';
import {
  assertKnownImportParameters,
  DOUBAN_CSV_MAX_BYTES,
  getDoubanCsvUploadError,
  parseDoubanCsvImportParameters,
  parseDoubanHarvestParameters,
  parseImportLimitParameters,
  parseImportTaskStatusParameters,
  parsePsnOwnedImportParameters,
  parseSteamOwnedImportParameters,
  parseXboxOwnedImportParameters,
} from '../routes/import';
import {
  parseLibraryListParameters,
  parseLibraryRecordCategory,
} from '../routes/library';
import {
  parseRadarItemIdBody,
  parseRadarListParameters,
  parseRadarSyncSource,
} from '../routes/radar';
import { assertAllowedImageProxyUrl, validateImageProxyRedirect } from '../routes/search';
import {
  parseTimelineCategory,
  parseTimelineListParameters,
} from '../routes/timeline';
import {
  parseTraktImportParameters,
  parseTraktPageCount,
  parseTraktPageData,
} from '../routes/trakt';
import { parseConvertCategoryBody, parseToolSearchParameters } from '../routes/tools';
import {
  parsePositiveIntegerParameter,
  parsePositiveBigIntParameter,
  parseBoundedStringParameter,
  parseDateParameter,
  parseExternalSearchParameters,
  parseGameRecordWriteBody,
  parseLibraryRecordUpdateBody,
  parseMovieRecordWriteBody,
  parsePatternParameter,
  parseRecordStatusParameter,
  parseRequiredPositiveIntegerParameter,
  parseStringParameter,
  parseTvShowRecordWriteBody,
  RequestValidationError,
} from '../routes/request-validation';
import {
  formatEnvLine,
  parseSettingsUpdateBody,
  serializeSettingValue,
  validateAuthSettingValues,
  validateSettingValues,
} from '../routes/settings';
import { effectiveGameStatus, isImportedGame } from '../services/ProfileSummaryService';
import {
  parseSteamOwnedGamesResponse,
  resolveSteamImportStatus,
} from '../services/import/SteamOwnedGamesImportService';
import {
  getExternalServiceKey,
  RateLimiter,
  shouldRateLimitRequest,
} from '../services/external-api-rate-limiter';
import {
  acquireImportOperation,
  ImportOperationConflictError,
  runExclusiveImport,
} from '../services/import-operation-lock';
import {
  buildDoubanRawData,
  buildMissingDoubanRawData,
} from '../services/douban-harvester/import-service';
import {
  assertDoubanCsvRowLimit,
  claimCsvIdentifiers,
  csvParseRating,
  DOUBAN_CSV_MAX_ROWS,
  DoubanCsvLimitError,
  extractDoubanId,
  normalizeImdbId,
  parseDate as parseDoubanCsvDate,
  parseCsvBuffer,
} from '../services/import/DoubanCsvImportService';
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
  assert.equal(validateSettingValues({ IMAGE_PROXY_MAX_BYTES: '1.5' }), 'IMAGE_PROXY_MAX_BYTES 必须是安全整数');
  assert.equal(validateSettingValues({ DOUBAN_HARVEST_MAX_PAGES_PER_RUN: '0' }), 'DOUBAN_HARVEST_MAX_PAGES_PER_RUN 必须在 1 到 1000 之间');
  assert.equal(validateSettingValues({ DOUBAN_HARVEST_LONG_BREAK_EVERY: '0' }), 'DOUBAN_HARVEST_LONG_BREAK_EVERY 必须大于等于 1');
  assert.equal(validateSettingValues({ DOUBAN_HARVEST_SLEEP_MIN: '1.5' }), 'DOUBAN_HARVEST_SLEEP_MIN 必须在 2 到 2147483 之间');
  assert.equal(validateSettingValues({ RADAR_REQUEST_TIMEOUT_MS: '2147483648' }), 'RADAR_REQUEST_TIMEOUT_MS 必须在 1 到 2147483647 之间');
  assert.equal(validateSettingValues({ RADAR_SYNC_CORE_CRON: 'not a cron' }), 'RADAR_SYNC_CORE_CRON 不是有效的 Cron 表达式');
  assert.equal(validateSettingValues({ RADAR_SYNC_CORE_CRON: '   ' }), 'RADAR_SYNC_CORE_CRON 不是有效的 Cron 表达式');
  assert.equal(validateSettingValues({ RADAR_SYNC_CORE_CRON: '' }), null);
  assert.equal(validateSettingValues({ RADAR_SYNC_CORE_CRON: '0 * * * *' }), null);
  assert.equal(validateSettingValues({ RADAR_SYNC_SCRAPER_CRON: '0 0 */6 * * *' }), null);
  assert.equal(validateSettingValues({ HOST: '127.0.0.1\nINJECTED=true' }), 'HOST 不能包含换行');
  assert.equal(validateSettingValues({ HOST: '"127.0.0.1"' }), 'HOST 不能包含引号');
  assert.equal(validateSettingValues({ UNKNOWN_SETTING: 'value' }), '未知配置项: UNKNOWN_SETTING');
  assert.equal(validateSettingValues({ AUTH_ENABLED: 'false', PORT: '18889' }), null);
});

test('配置更新请求体只能包含非空 values 对象', () => {
  assert.deepEqual(parseSettingsUpdateBody({ values: { HOST: '127.0.0.1' } }), {
    HOST: '127.0.0.1',
  });
  assert.throws(() => parseSettingsUpdateBody(null), RequestValidationError);
  assert.throws(() => parseSettingsUpdateBody({}), RequestValidationError);
  assert.throws(() => parseSettingsUpdateBody({ values: [] }), RequestValidationError);
  assert.throws(() => parseSettingsUpdateBody({ values: {} }), RequestValidationError);
  assert.throws(
    () => parseSettingsUpdateBody({ values: { HOST: '127.0.0.1' }, restart: true }),
    RequestValidationError,
  );
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

test('平台游戏导入在调用外部服务前校验账号参数', () => {
  assert.deepEqual(parseSteamOwnedImportParameters({ steamId: '76561198369299195', status: 'DONE' }), {
    steamId: '76561198369299195',
    status: RecordStatus.DONE,
  });
  assert.throws(() => parseSteamOwnedImportParameters({ steamId: 'not-a-steam-id' }), RequestValidationError);
  assert.throws(() => parseSteamOwnedImportParameters({ steamId: '1'.repeat(21) }), RequestValidationError);
  assert.throws(() => parseSteamOwnedImportParameters({ steamId: '1', accessToken: 'secret' }), RequestValidationError);

  assert.deepEqual(parseXboxOwnedImportParameters({ gamertag: ' 玩家 One ', status: 'UNSET' }), {
    gamertag: '玩家 One',
    status: RecordStatus.UNSET,
  });
  assert.throws(() => parseXboxOwnedImportParameters({ gamertag: 'player/name' }), RequestValidationError);
  assert.throws(() => parseXboxOwnedImportParameters({ gamertag: 'a'.repeat(101) }), RequestValidationError);

  assert.deepEqual(parsePsnOwnedImportParameters({ psnId: 'player_name-1' }), {
    psnId: 'player_name-1',
    status: null,
  });
  assert.throws(() => parsePsnOwnedImportParameters({ psnId: 'player?name' }), RequestValidationError);
  assert.throws(() => parsePsnOwnedImportParameters({ psnId: [] }), RequestValidationError);
});

test('同步导入和任务查询拒绝未知或超长参数', () => {
  assert.equal(parseImportLimitParameters({ limit: '100' }), 100);
  assert.throws(() => parseImportLimitParameters({ limit: '10', force: 'true' }), RequestValidationError);

  assert.equal(parseDoubanCsvImportParameters({ status: 'WANT' }), RecordStatus.WANT);
  assert.throws(() => parseDoubanCsvImportParameters({ status: 'WANT', accessToken: 'secret' }), RequestValidationError);

  assert.equal(parseDoubanHarvestParameters({ mode: 'incremental' }), 'incremental');
  assert.throws(() => parseDoubanHarvestParameters({ mode: 'a'.repeat(21) }), RequestValidationError);
  assert.throws(() => parseDoubanHarvestParameters({ mode: 'json', resume: 'true' }), RequestValidationError);

  assert.equal(parseImportTaskStatusParameters({ taskId: ' task-123 ' }), 'task-123');
  assert.throws(() => parseImportTaskStatusParameters({ taskId: 'a'.repeat(101) }), RequestValidationError);
  assert.throws(() => parseImportTaskStatusParameters({ taskId: 'task-123', verbose: 'true' }), RequestValidationError);

  assert.doesNotThrow(() => assertKnownImportParameters({}, []));
  assert.throws(() => assertKnownImportParameters({ unexpected: 'value' }, []), RequestValidationError);
});

test('豆瓣 CSV 上传在解析和写库前限制资源占用', async () => {
  const tooLarge = getDoubanCsvUploadError(new multer.MulterError('LIMIT_FILE_SIZE'));
  assert.deepEqual(tooLarge, {
    status: 413,
    message: `CSV 文件不能超过 ${DOUBAN_CSV_MAX_BYTES / 1024 / 1024} MiB`,
  });
  assert.deepEqual(
    getDoubanCsvUploadError(new multer.MulterError('LIMIT_UNEXPECTED_FILE')),
    { status: 400, message: '仅接受一个名为 file 的 CSV 文件' },
  );
  assert.equal(getDoubanCsvUploadError(new Error('other')), null);

  assert.doesNotThrow(() => assertDoubanCsvRowLimit(DOUBAN_CSV_MAX_ROWS - 1));
  assert.throws(
    () => assertDoubanCsvRowLimit(DOUBAN_CSV_MAX_ROWS),
    (error: unknown) => error instanceof DoubanCsvLimitError && error.status === 413,
  );

  const csvParser = await import('csv-parser');
  const rows = await parseCsvBuffer(Buffer.from('unknown\nx\n'), csvParser);
  assert.deepEqual(rows, [{ unknown: 'x' }]);
  await assert.rejects(
    parseCsvBuffer(Buffer.from(`unknown\n${'x\n'.repeat(DOUBAN_CSV_MAX_ROWS + 1)}`), csvParser),
    (error: unknown) => error instanceof DoubanCsvLimitError && error.status === 413,
  );
});

test('豆瓣 CSV 导入在写库前规范字段并拒绝重复标识', () => {
  assert.equal(extractDoubanId(' 1292052 ', null), '1292052');
  assert.equal(
    extractDoubanId('invalid', 'https://movie.douban.com/subject/1292052/?from=collect'),
    '1292052',
  );
  assert.equal(extractDoubanId('invalid', 'https://example.com/subject/not-a-number'), null);
  assert.equal(normalizeImdbId(' TT0111161 '), 'tt0111161');
  assert.equal(normalizeImdbId('0111161'), null);

  assert.equal(csvParseRating('abc'), null);
  assert.equal(csvParseRating('0'), null);
  assert.equal(csvParseRating('3.6'), 4);
  assert.equal(csvParseRating('9'), 5);
  assert.equal(parseDoubanCsvDate('2024-02-29'), '2024-02-29T00:00:00.000Z');
  assert.equal(parseDoubanCsvDate('2023-02-29'), undefined);
  assert.equal(parseDoubanCsvDate('2026-02-31'), undefined);

  const seenDoubanIds = new Set(['100']);
  const seenImdbIds = new Set(['tt0000001']);
  assert.equal(claimCsvIdentifiers('200', 'tt0000002', seenDoubanIds, seenImdbIds), true);
  assert.equal(claimCsvIdentifiers('200', null, seenDoubanIds, seenImdbIds), false);
  assert.equal(claimCsvIdentifiers('300', 'tt0000001', seenDoubanIds, seenImdbIds), false);
  assert.equal(claimCsvIdentifiers('300', null, seenDoubanIds, seenImdbIds), false);
});

test('同一同步导入拒绝并发执行且异常后释放锁', async () => {
  let releaseFirst!: () => void;
  let markStarted!: () => void;
  const firstStarted = new Promise<void>(resolve => { markStarted = resolve; });
  const firstGate = new Promise<void>(resolve => { releaseFirst = resolve; });
  const first = runExclusiveImport('test-import', '测试导入', async () => {
    markStarted();
    await firstGate;
    return 'done';
  });
  await firstStarted;

  await assert.rejects(
    runExclusiveImport('test-import', '测试导入', async () => 'duplicate'),
    (error: unknown) => error instanceof ImportOperationConflictError && error.status === 409,
  );
  releaseFirst();
  assert.equal(await first, 'done');
  assert.equal(
    await runExclusiveImport('test-import', '测试导入', async () => 'next'),
    'next',
  );

  await assert.rejects(
    runExclusiveImport('failed-import', '失败导入', async () => {
      throw new Error('failed');
    }),
    /failed/,
  );
  assert.equal(
    await runExclusiveImport('failed-import', '失败导入', async () => 'recovered'),
    'recovered',
  );

  const release = acquireImportOperation('response-import', '响应导入');
  assert.throws(
    () => acquireImportOperation('response-import', '响应导入'),
    ImportOperationConflictError,
  );
  release();
  release();
  assert.doesNotThrow(() => acquireImportOperation('response-import', '响应导入')());
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

test('直接 CRUD 写入仅接受已知字段和有效类型', () => {
  assert.deepEqual(parseMovieRecordWriteBody({
    title: '  测试电影  ',
    status: 'want',
    tmdbId: 123,
    rating: null,
    posterUrl: null,
  }, 'create'), {
    title: '测试电影',
    status: RecordStatus.WANT,
    tmdbId: 123n,
    rating: null,
    posterUrl: null,
  });
  assert.deepEqual(parseTvShowRecordWriteBody({
    title: '测试剧集',
    status: 'DONE',
    firstAirDate: '2026-07-15',
  }, 'create'), {
    title: '测试剧集',
    status: RecordStatus.DONE,
    firstAirDate: '2026-07-15',
  });
  assert.deepEqual(parseGameRecordWriteBody({
    title: '测试游戏',
    status: 'IN_PROGRESS',
    steamAppId: '730',
    playtimeMinutes: 0,
    importedAt: '2026-07-15T00:00:00.000Z',
  }, 'create'), {
    title: '测试游戏',
    status: RecordStatus.IN_PROGRESS,
    steamAppId: 730n,
    playtimeMinutes: 0,
    importedAt: new Date('2026-07-15T00:00:00.000Z'),
  });

  assert.throws(() => parseMovieRecordWriteBody({}, 'update'), RequestValidationError);
  assert.throws(() => parseMovieRecordWriteBody({ title: '测试电影' }, 'create'), RequestValidationError);
  assert.throws(() => parseMovieRecordWriteBody({ title: '  ', status: 'WANT' }, 'create'), RequestValidationError);
  assert.throws(() => parseMovieRecordWriteBody({ doubanTitle: '不允许直接写入' }, 'update'), RequestValidationError);
  assert.throws(() => parseMovieRecordWriteBody({ createdAt: '2026-07-15' }, 'update'), RequestValidationError);
  assert.throws(() => parseMovieRecordWriteBody({ constructor: 'invalid' }, 'update'), RequestValidationError);
  assert.throws(() => parseMovieRecordWriteBody({ rating: 0 }, 'update'), RequestValidationError);
  assert.throws(() => parseMovieRecordWriteBody({ tmdbId: 1.5 }, 'update'), RequestValidationError);
  assert.throws(() => parseMovieRecordWriteBody({ tmdbVoteAverage: 11 }, 'update'), RequestValidationError);
  assert.throws(() => parseGameRecordWriteBody({ playtimeMinutes: -1 }, 'update'), RequestValidationError);
  assert.throws(() => parseTvShowRecordWriteBody({ releaseDate: '2026-07-15' }, 'update'), RequestValidationError);
});

test('活动日志参数拒绝非法游标、ID 和日期', () => {
  assert.equal(parsePositiveBigIntParameter('9007199254740993', 'entityId'), 9007199254740993n);
  assert.equal(parsePositiveBigIntParameter(42, 'entityId'), 42n);
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

test('已撤销的活动日志不再标记为可撤销', () => {
  const entry = {
    id: 42n,
    action: 'UPDATE',
    entityType: 'MOVIE',
    entityId: 7n,
    entityTitle: '测试电影',
    oldValues: { rating: 1 },
    newValues: { rating: 2 },
    metadata: null,
    createdAt: new Date('2026-07-15T00:00:00.000Z'),
  };

  assert.equal(getUndoneLogId({ undoneLogId: '42' }), '42');
  assert.equal(getUndoneLogId({ undoneLogId: 42 }), null);
  assert.equal(getUndoneLogId(null), null);
  assert.equal(serializeLog(entry).undoable, true);
  assert.equal(serializeLog(entry, new Set(['42'])).undoable, false);
});

test('雷达接口拒绝非法筛选、同步来源和条目 ID', () => {
  assert.deepEqual(parseRadarListParameters({}), {
    category: null,
    type: null,
    platform: null,
    source: null,
    syncType: null,
    page: 1,
    limit: 40,
  });
  assert.deepEqual(parseRadarListParameters({
    category: 'upcoming',
    type: 'movie',
    platform: 'Netflix',
    source: 'tmdb',
    syncType: 'new_release',
    page: '2',
    limit: '50',
  }), {
    category: 'upcoming',
    type: 'movie',
    platform: 'Netflix',
    source: 'tmdb',
    syncType: 'new_release',
    page: 2,
    limit: 50,
  });
  assert.equal(parseRadarSyncSource('tencent'), 'tencent');
  assert.equal(parseRadarItemIdBody({ radarItemId: '9007199254740993' }), 9007199254740993n);
  assert.equal(parseRadarItemIdBody({ radarItemId: 42 }), 42n);

  assert.throws(() => parseRadarListParameters({ category: 'invalid' }), RequestValidationError);
  assert.throws(() => parseRadarListParameters({ page: '1.5' }), RequestValidationError);
  assert.throws(() => parseRadarListParameters({ limit: '101' }), RequestValidationError);
  assert.throws(() => parseRadarListParameters({ source: ['tmdb'] }), RequestValidationError);
  assert.throws(() => parseRadarSyncSource('douban'), RequestValidationError);
  assert.throws(() => parseRadarItemIdBody({ radarItemId: 0 }), RequestValidationError);
  assert.throws(() => parseRadarItemIdBody({ radarItemId: 1, extra: true }), RequestValidationError);
});

test('外部搜索在发起请求前校验关键词、页码、Provider 和详情 ID', () => {
  const providers = ['tmdb', 'omdb', 'trakt'] as const;
  assert.deepEqual(parseExternalSearchParameters({
    query: '  测试电影  ',
    page: '2',
    providers: ['TMDB', 'omdb,trakt', 'tmdb'],
  }, providers), {
    query: '测试电影',
    page: 2,
    providers: ['tmdb', 'omdb', 'trakt'],
  });
  assert.deepEqual(parseExternalSearchParameters({ query: '测试电影' }, providers), {
    query: '测试电影',
    page: 1,
    providers: undefined,
  });
  assert.equal(parsePatternParameter('tt1234567', 'imdbId', /^tt\d{7,10}$/, 12), 'tt1234567');
  assert.equal(parseBoundedStringParameter(' https://example.com/image.jpg ', 'url', 2000, true), 'https://example.com/image.jpg');

  assert.throws(() => parseExternalSearchParameters({}, providers), RequestValidationError);
  assert.throws(() => parseExternalSearchParameters({ query: ['测试'] }, providers), RequestValidationError);
  assert.throws(() => parseExternalSearchParameters({ query: 'x'.repeat(201) }, providers), RequestValidationError);
  assert.throws(() => parseExternalSearchParameters({ query: '测试', page: '1x' }, providers), RequestValidationError);
  assert.throws(() => parseExternalSearchParameters({ query: '测试', page: '1001' }, providers), RequestValidationError);
  assert.throws(() => parseExternalSearchParameters({ query: '测试', providers: 'unknown' }, providers), RequestValidationError);
  assert.throws(() => parseExternalSearchParameters({ query: '测试', providers: 'tmdb,' }, providers), RequestValidationError);
  assert.throws(() => parsePatternParameter('1234567', 'imdbId', /^tt\d{7,10}$/, 12), RequestValidationError);
});

test('记录库、时间线和分析查询严格校验分页与筛选参数', () => {
  const cursor = '2026-07-15T00:00:00.000Z__42';
  assert.deepEqual(parseLibraryListParameters({}), {
    cursor: undefined,
    limit: 50,
    includeTotals: true,
    category: 'all',
    year: undefined,
    status: undefined,
  });
  assert.deepEqual(parseLibraryListParameters({
    cursor,
    limit: '100',
    includeTotals: 'false',
    category: 'media',
    year: '2026',
    status: 'done',
  }), {
    cursor,
    limit: 100,
    includeTotals: false,
    category: 'media',
    year: 2026,
    status: RecordStatus.DONE,
  });
  assert.deepEqual(parseTimelineListParameters({
    cursor,
    category: 'game',
    includeTotals: 'true',
    year: '2025',
    status: 'IN_PROGRESS',
  }), {
    cursor,
    limit: 96,
    includeTotals: true,
    category: 'game',
    year: 2025,
    status: RecordStatus.IN_PROGRESS,
  });
  assert.equal(parseLibraryRecordCategory('TVSHOW'), 'tvshow');
  assert.equal(parseTimelineCategory(undefined), 'all');
  assert.equal(parseAnalyticsYear(undefined, 2026), 2026);
  assert.equal(parseAnalyticsYear('2025', 2026), 2025);

  assert.throws(() => parseLibraryListParameters({ cursor: 'invalid' }), RequestValidationError);
  assert.throws(() => parseLibraryListParameters({ cursor: '2026-07-15T00:00:00.000Z__1.5' }), RequestValidationError);
  assert.throws(() => parseLibraryListParameters({ limit: '1x' }), RequestValidationError);
  assert.throws(() => parseLibraryListParameters({ includeTotals: '0' }), RequestValidationError);
  assert.throws(() => parseLibraryListParameters({ category: 'unknown' }), RequestValidationError);
  assert.throws(() => parseLibraryListParameters({ year: '2026x' }), RequestValidationError);
  assert.throws(() => parseLibraryListParameters({ status: 'unknown' }), RequestValidationError);
  assert.throws(() => parseTimelineCategory(['all']), RequestValidationError);
  assert.throws(() => parseAnalyticsYear('1899', 2026), RequestValidationError);
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

test('图片代理的初始请求和每次重定向都受域名允许列表约束', () => {
  assert.equal(
    assertAllowedImageProxyUrl('https://image.tmdb.org/t/p/w500/poster.jpg').hostname,
    'image.tmdb.org',
  );
  assert.throws(
    () => assertAllowedImageProxyUrl('https://127.0.0.1/private'),
    /Host not allowed/,
  );

  assert.doesNotThrow(() => validateImageProxyRedirect(
    {},
    { headers: { location: '/t/p/original/poster.jpg' } },
    { url: 'https://image.tmdb.org/t/p/w500/poster.jpg' },
  ));
  assert.doesNotThrow(() => validateImageProxyRedirect(
    {},
    { headers: { location: 'https://media.themoviedb.org/poster.jpg' } },
    { url: 'https://image.tmdb.org/t/p/w500/poster.jpg' },
  ));
  assert.throws(
    () => validateImageProxyRedirect(
      {},
      { headers: { location: 'http://127.0.0.1:18889/api/settings' } },
      { url: 'https://image.tmdb.org/t/p/w500/poster.jpg' },
    ),
    /Host not allowed/,
  );
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

test('登录请求仅接受合法的用户名和密码', () => {
  assert.deepEqual(parseLoginBody({ username: 'admin', password: 'secret' }), {
    username: 'admin',
    password: 'secret',
  });
  assert.throws(() => parseLoginBody(null), RequestValidationError);
  assert.throws(() => parseLoginBody({ username: 'admin' }), RequestValidationError);
  assert.throws(
    () => parseLoginBody({ username: 'admin', password: 'secret', role: 'admin' }),
    RequestValidationError,
  );
  assert.throws(() => parseLoginBody({ username: ' ', password: 'secret' }), RequestValidationError);
  assert.throws(() => parseLoginBody({ username: 'admin', password: ' ' }), RequestValidationError);
  assert.throws(
    () => parseLoginBody({ username: 'a'.repeat(101), password: 'secret' }),
    RequestValidationError,
  );
});

test('登录凭据使用恒定时间哈希比较', () => {
  assert.equal(secureCredentialEqual('admin', 'admin'), true);
  assert.equal(secureCredentialEqual('admin', 'Admin'), false);
  assert.equal(secureCredentialEqual('管理员', '管理员'), true);
});

test('登录失败达到上限后限流并支持到期和成功重置', () => {
  let now = 0;
  const limiter = new LoginAttemptLimiter(3, 10_000, () => now);

  assert.deepEqual(limiter.check('client-a'), { allowed: true, retryAfterSeconds: 0 });
  limiter.recordFailure('client-a');
  limiter.recordFailure('client-a');
  limiter.recordFailure('client-a');
  assert.deepEqual(limiter.check('client-a'), { allowed: false, retryAfterSeconds: 10 });
  assert.deepEqual(limiter.check('client-b'), { allowed: true, retryAfterSeconds: 0 });

  now = 5_001;
  assert.deepEqual(limiter.check('client-a'), { allowed: false, retryAfterSeconds: 5 });
  limiter.reset('client-a');
  assert.deepEqual(limiter.check('client-a'), { allowed: true, retryAfterSeconds: 0 });

  limiter.recordFailure('client-a');
  now = 15_001;
  assert.deepEqual(limiter.check('client-a'), { allowed: true, retryAfterSeconds: 0 });
});

test('Trakt 导入仅接受状态参数且拒绝通过 URL 传递凭据', () => {
  assert.deepEqual(parseTraktImportParameters({}), { status: RecordStatus.WANT });
  assert.deepEqual(parseTraktImportParameters({ status: 'DONE' }), { status: RecordStatus.DONE });
  assert.throws(
    () => parseTraktImportParameters({ accessToken: 'secret' }),
    (error: unknown) => error instanceof RequestValidationError
      && error.message === '未知参数: accessToken',
  );
  assert.throws(
    () => parseTraktImportParameters({ status: 'INVALID' }),
    RequestValidationError,
  );
});

test('Trakt 导入拒绝异常分页响应以避免失控请求', () => {
  assert.equal(parseTraktPageCount(undefined), 1);
  assert.equal(parseTraktPageCount('0'), 0);
  assert.equal(parseTraktPageCount(' 12 '), 12);
  assert.throws(
    () => parseTraktPageCount('not-a-number'),
    (error: any) => error.status === 502 && error.message === 'Trakt 返回了无效的分页信息',
  );
  assert.throws(
    () => parseTraktPageCount('1001'),
    (error: any) => error.status === 502 && error.message === 'Trakt 返回的分页数量超出安全范围',
  );
  assert.deepEqual(parseTraktPageData([{ movie: { title: '测试' } }]), [{ movie: { title: '测试' } }]);
  assert.throws(
    () => parseTraktPageData({ error: 'upstream failure' }),
    (error: any) => error.status === 502 && error.message === 'Trakt 返回了无效的数据格式',
  );
});

test('工具页在查询和转换前严格校验参数', () => {
  assert.deepEqual(parseToolSearchParameters({ query: ' 科幻 ' }), { query: '科幻' });
  assert.deepEqual(parseToolSearchParameters({}), { query: null });
  assert.throws(
    () => parseToolSearchParameters({ query: 'test', limit: '100' }),
    RequestValidationError,
  );
  assert.throws(
    () => parseToolSearchParameters({ query: 'a'.repeat(201) }),
    RequestValidationError,
  );

  assert.deepEqual(parseConvertCategoryBody({ id: '42', from: 'movie', to: 'tv_show' }), {
    id: 42n,
    from: 'movie',
    to: 'tv_show',
  });
  assert.throws(
    () => parseConvertCategoryBody({ id: '0', from: 'movie', to: 'tv_show' }),
    RequestValidationError,
  );
  assert.throws(
    () => parseConvertCategoryBody({ id: '42', from: 'movie', to: 'movie' }),
    RequestValidationError,
  );
  assert.throws(
    () => parseConvertCategoryBody({ id: '42', from: 'movie', to: 'tv_show', force: true }),
    RequestValidationError,
  );
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

test('豆瓣影视记录的原始字段在 Prisma 写入层禁止改写', () => {
  const record = {
    doubanId: '35517044',
    doubanTitle: '低智商犯罪',
    doubanRating: 3,
  };

  assert.doesNotThrow(() => assertProtectedDoubanFieldsUnchanged('Movie', record, {
    status: 'DONE',
    title: '新显示标题',
    doubanId: '35517044',
  }));
  assert.throws(
    () => assertProtectedDoubanFieldsUnchanged('Movie', record, { doubanId: null }),
    (error: unknown) => error instanceof ProtectedDoubanDataError && error.status === 403,
  );
  assert.throws(
    () => assertProtectedDoubanFieldsUnchanged('Movie', record, { doubanTitle: '被篡改的标题' }),
    ProtectedDoubanDataError,
  );
  assert.throws(
    () => assertProtectedDoubanFieldsUnchanged('Movie', record, { doubanRating: { set: 5 } }),
    ProtectedDoubanDataError,
  );
  assert.doesNotThrow(() => assertProtectedDoubanFieldsUnchanged('Game', record, { doubanId: null }));
  assert.doesNotThrow(() => assertProtectedDoubanFieldsUnchanged('TvShow', { doubanId: null }, { doubanTitle: '新记录' }));
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

test('Steam 导入在写库前规范响应并去重', () => {
  assert.deepEqual(parseSteamOwnedGamesResponse({ response: { games: [
    { appid: 730, name: ' Counter-Strike 2 ', playtime_forever: 120 },
    { appid: '730', name: '重复条目', playtime_forever: 30 },
    { appid: 0, name: '无效 ID' },
    { appid: 20, name: '   ' },
    { appid: 40, name: '有效游戏', playtime_forever: -1 },
  ] } }), {
    total: 5,
    games: [
      { appId: 730, title: 'Counter-Strike 2', playtimeMinutes: 120 },
      { appId: 40, title: '有效游戏', playtimeMinutes: null },
    ],
    skipped: 3,
    errors: [
      'Steam 响应包含重复 appid: 730',
      'Steam 响应包含无效 appid，已跳过',
      'Steam appid 20 缺少有效标题，已跳过',
      'Steam appid 40 的游玩时长无效，已忽略',
    ],
  });
  assert.deepEqual(parseSteamOwnedGamesResponse({ response: {} }), {
    total: 0,
    games: [],
    skipped: 0,
    errors: [],
  });
  assert.throws(
    () => parseSteamOwnedGamesResponse({ response: { games: {} } }),
    /Steam API 返回的 games 不是数组/,
  );
  assert.throws(
    () => parseSteamOwnedGamesResponse(null),
    /Steam API 返回的 response 不是对象/,
  );
});

test('外部平台标识可识别历史导入游戏', () => {
  assert.equal(isImportedGame({ steamAppId: 10n }), true);
  assert.equal(isImportedGame({ xboxId: 'xbox-id' }), true);
  assert.equal(isImportedGame({ importedAt: new Date() }), true);
  assert.equal(isImportedGame({}), false);
});
