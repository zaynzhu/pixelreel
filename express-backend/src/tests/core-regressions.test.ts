import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { Request, Response } from 'express';
import axios from 'axios';
import multer from 'multer';
import { config, validateAuthConfiguration } from '../config';
import { RecordStatus } from '../enums/RecordStatus';
import { bigIntToJson, serializeBigIntForJson } from '../json';
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
import {
  getUndoneLogId,
  isProtectedDoubanCreate,
  parseActivityCursor,
  parseActivityListParameters,
  serializeLog,
} from '../routes/activity';
import { parseAnalyticsParameters, parseAnalyticsYear } from '../routes/analytics';
import {
  parseDataHealthIssueParameters,
  parseDataHealthRepairBody,
  parseDuplicateListParameters,
  parseDuplicateReviewBody,
} from '../routes/dataHealth';
import { getHealthStatus } from '../routes/health';
import {
  assertEmptyImportRequestBody,
  assertKnownImportParameters,
  buildPlatformImportStatus,
  buildImportSourceStatus,
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
import { extractXuid, parseXboxTitles } from '../services/import/OpenXblImportService';
import {
  collectPsnProfilePages,
  extractPsnGameId,
  importPsnOwnedGames,
  isPsnProfilesChallengePage,
  isPsnProfilesChallengeResponse,
  parsePsnGames,
  parsePsnProfilePage,
} from '../services/import/PsnProfilesImportService';
import { parseRawgPosterUrl } from '../services/import/RawgPosterLookupService';
import {
  parseImportReviewDecisionBody,
  parseLibraryListParameters,
  parseLibraryRandomParameters,
  parseLibraryRecordCategory,
} from '../routes/library';
import {
  assertRadarSyncRequest,
  parseRadarItemIdBody,
  parseRadarListParameters,
  parseRadarSyncSource,
} from '../routes/radar';
import {
  assertAllowedImageProxyUrl,
  assertKnownSearchQueryParameters,
  GAME_SEARCH_PROVIDERS,
  mapDetailRating,
  mapTmdbIdentityMetadata,
  parseImageProxyParameters,
  parseTmdbDetailParameters,
  validateImageProxyRedirect,
} from '../routes/search';
import {
  parseTimelineCategory,
  parseTimelineListParameters,
  parseTimelineYearsParameters,
} from '../routes/timeline';
import {
  assertEmptyTraktImportBody,
  parseTraktCallbackParameters,
  parseTraktAccessToken,
  parseTraktImportParameters,
  parseTraktPageCount,
  parseTraktPageData,
  TraktOAuthStateStore,
} from '../routes/trakt';
import {
  assertConvertedSourceDeleted,
  parseConvertCategoryBody,
  parseToolSearchParameters,
} from '../routes/tools';
import {
  buildLibraryExportSnapshot,
  libraryExportFilename,
  serializeLibraryExportSnapshot,
} from '../services/LibraryExportService';
import {
  assertEmptyRequestBody,
  assertNoQueryParameters,
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
  buildRecordListCursorWhere,
  createRecordListResponse,
  parseRecordListParameters,
} from '../routes/record-list';
import {
  applyRuntimeSettingValues,
  formatEnvLine,
  parseSettingsUpdateBody,
  serializeSettingValue,
  validateAuthSettingValues,
  validateSettingValues,
} from '../routes/settings';
import {
  buildMovieSourceCounts,
  buildMonthlyMemories,
  buildNextUpQueue,
  buildTvShowSourceCounts,
  isImportedGame,
} from '../services/ProfileSummaryService';
import { buildGameStatusWhere, effectiveGameStatus } from '../services/GameStatusService';
import {
  buildCrossPlatformRatings,
  buildSourceBreakdown,
  collectAvailableAnalyticsYears,
} from '../services/AnalyticsService';
import { resolveCompletionDate } from '../services/RecordDateService';
import { SyncHistoryStore } from '../services/SyncHistoryService';
import {
  buildDataHealthWhere,
  isDataHealthIssueApplicable,
} from '../services/DataHealthService';
import {
  buildMediaRepairUpdate,
  isDataHealthRepairSupported,
} from '../services/DataHealthRepairService';
import {
  findDuplicateGroups,
  normalizeDuplicateTitle,
} from '../services/DuplicateDetectionService';
import {
  buildCompletedWhere,
  encodeLibraryCursor,
  parseLibraryCursor,
  toGameRecord,
  toMovieRecord,
  toTvShowRecord,
} from '../services/LibraryService';
import { SteamGameSearchProvider } from '../services/provider/SteamGameSearchProvider';
import {
  parseSteamOwnedGamesResponse,
  resolveSteamImportStatus,
} from '../services/import/SteamOwnedGamesImportService';
import {
  assertTaskActive,
  getImportSummaryFailure,
} from '../services/import/ImportSummaryTaskService';
import {
  buildPlatformGameRequestOptions,
  buildPlatformGameMetricUpdate,
  hasPlatformGameMetricUpdate,
  isPlatformGameExternalIdValid,
  isPlatformGameTitleValid,
  normalizePlatformGamePosterUrl,
  PLATFORM_GAME_REQUEST_TIMEOUT_MS,
} from '../services/import/PlatformGameSyncService';
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
  assert.equal(validateSettingValues({ OPENXBL_ENABLED: 'yes' }), 'OPENXBL_ENABLED 必须是 true 或 false');
  assert.equal(validateSettingValues({ PSN_PROFILES_ENABLED: 'yes' }), 'PSN_PROFILES_ENABLED 必须是 true 或 false');
  assert.equal(validateSettingValues({ OPENXBL_ENABLED: 'true', OPENXBL_API_KEY: 'secret' }), null);
  assert.equal(validateSettingValues({ PSN_PROFILES_ENABLED: 'true', PSN_PROFILES_COOKIE: 'secret' }), null);
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

test('主机平台设置即时更新运行时配置并区分重启项', () => {
  const runtimeConfig = {
    openxbl: { apiKey: '', baseUrl: 'https://old.xbl.test', enabled: false },
    psnProfiles: {
      baseUrl: 'https://old.psn.test',
      userAgent: 'old-agent',
      cookie: '',
      enabled: false,
    },
  };

  assert.equal(applyRuntimeSettingValues({
    OPENXBL_API_KEY: 'xbox-key',
    OPENXBL_BASE_URL: 'https://api.xbl.test/v2',
    OPENXBL_ENABLED: 'true',
    PSN_PROFILES_BASE_URL: 'https://psn.test',
    PSN_PROFILES_USER_AGENT: 'new-agent',
    PSN_PROFILES_COOKIE: 'session=value',
    PSN_PROFILES_ENABLED: 'true',
  }, runtimeConfig), false);
  assert.deepEqual(runtimeConfig, {
    openxbl: { apiKey: 'xbox-key', baseUrl: 'https://api.xbl.test/v2', enabled: true },
    psnProfiles: {
      baseUrl: 'https://psn.test',
      userAgent: 'new-agent',
      cookie: 'session=value',
      enabled: true,
    },
  });
  assert.equal(applyRuntimeSettingValues({ OPENXBL_ENABLED: 'false', PORT: '18890' }, runtimeConfig), true);
  assert.equal(runtimeConfig.openxbl.enabled, false);
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

test('BigInt JSON 序列化只在安全范围内返回数字', () => {
  assert.equal(serializeBigIntForJson(42n), 42);
  assert.equal(serializeBigIntForJson(9_007_199_254_740_991n), 9_007_199_254_740_991);
  assert.equal(serializeBigIntForJson(-9_007_199_254_740_991n), -9_007_199_254_740_991);
  assert.equal(serializeBigIntForJson(9_007_199_254_740_992n), '9007199254740992');
  assert.equal(serializeBigIntForJson(-9_007_199_254_740_992n), '-9007199254740992');
  assert.equal(serializeBigIntForJson(9_223_372_036_854_775_807n), '9223372036854775807');
  assert.equal(bigIntToJson.call(42n), 42);
  assert.equal(bigIntToJson.call(9_223_372_036_854_775_807n), '9223372036854775807');
});

test('直接记录列表使用有界游标分页', () => {
  assert.deepEqual(parseRecordListParameters({}), { cursor: null, limit: 50 });
  assert.deepEqual(parseRecordListParameters({ limit: '200' }), { cursor: null, limit: 200 });

  const parameters = parseRecordListParameters({
    cursor: '2026-07-15T00:00:00.000Z__42',
    limit: '10',
  });
  assert.deepEqual(parameters, {
    cursor: { createdAt: new Date('2026-07-15T00:00:00.000Z'), id: 42n },
    limit: 10,
  });
  assert.deepEqual(buildRecordListCursorWhere(parameters.cursor), {
    OR: [
      { createdAt: { lt: new Date('2026-07-15T00:00:00.000Z') } },
      { createdAt: { equals: new Date('2026-07-15T00:00:00.000Z') }, id: { lt: 42n } },
    ],
  });

  const rows = [
    { id: 3, createdAt: new Date('2026-07-15T00:00:00.000Z') },
    { id: 2, createdAt: new Date('2026-07-14T00:00:00.000Z') },
  ];
  assert.deepEqual(createRecordListResponse(rows, 1), {
    records: [rows[0]],
    nextCursor: '2026-07-15T00:00:00.000Z__3',
  });
  assert.throws(() => parseRecordListParameters({ limit: '201' }), RequestValidationError);
  assert.throws(() => parseRecordListParameters({ page: '1' }), RequestValidationError);
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

test('Xbox 导入解析当前 OpenXBL v2 响应并过滤非游戏及重复条目', () => {
  const response = {
    content: {
      xuid: '2535473210914202',
      titles: [
        {
          titleId: '1632510060',
          name: 'The Sims 4',
          type: 'Game',
          displayImage: 'https://images.example/game.jpg',
          achievement: {
            currentAchievements: 0,
            totalAchievements: 50,
          },
        },
        {
          titleId: 'app-1',
          name: 'Streaming App',
          type: 'App',
        },
        {
          titleId: '1632510060',
          name: 'Duplicate The Sims 4',
          type: 'Game',
          achievement: {
            currentAchievements: 10,
            totalAchievements: 50,
          },
        },
      ],
    },
    code: 200,
  };
  assert.deepEqual(parseXboxTitles(response), [{
    titleId: '1632510060',
    name: 'The Sims 4',
    posterUrl: 'https://images.example/game.jpg',
    playtimeMinutes: null,
    achievementTotal: 50,
    achievementUnlocked: 0,
  }]);
  assert.equal(extractXuid({ content: { people: [{ xuid: '2533274792093122' }] } }), '2533274792093122');
  assert.deepEqual(parseXboxTitles({ content: { titles: [] }, code: 200 }), []);
  assert.throws(
    () => parseXboxTitles({ content: { titles: 'invalid' }, code: 200 }),
    /OpenXBL 返回的游戏列表格式无效/,
  );
});

test('游戏平台重复同步只刷新来源指标并保留已有展示字段', () => {
  const update = buildPlatformGameMetricUpdate({
    platform: null,
    posterUrl: null,
    playtimeMinutes: 30,
    achievementTotal: 20,
    achievementUnlocked: 5,
  }, {
    platform: 'XBOX',
    posterUrl: 'https://images.example/game.jpg',
    playtimeMinutes: 45,
    achievementTotal: 25,
    achievementUnlocked: 8,
  });
  assert.deepEqual(update, {
    platform: 'XBOX',
    posterUrl: 'https://images.example/game.jpg',
    playtimeMinutes: 45,
    achievementTotal: 25,
    achievementUnlocked: 8,
  });
  assert.equal(hasPlatformGameMetricUpdate(update), true);

  const unchanged = buildPlatformGameMetricUpdate({
    platform: 'PSN',
    posterUrl: 'https://images.example/existing.jpg',
    playtimeMinutes: null,
    achievementTotal: 10,
    achievementUnlocked: 3,
  }, {
    platform: 'PSN',
    posterUrl: 'https://images.example/new.jpg',
    playtimeMinutes: null,
    achievementTotal: null,
    achievementUnlocked: 3,
  });
  assert.deepEqual(unchanged, {});
  assert.equal(hasPlatformGameMetricUpdate(unchanged), false);
  assert.equal(isPlatformGameExternalIdValid('x'.repeat(50)), true);
  assert.equal(isPlatformGameExternalIdValid('x'.repeat(51)), false);
  assert.equal(isPlatformGameTitleValid('游'.repeat(255)), true);
  assert.equal(isPlatformGameTitleValid('游'.repeat(256)), false);
  assert.equal(normalizePlatformGamePosterUrl(`https://example.com/${'a'.repeat(480)}`), 'https://example.com/' + 'a'.repeat(480));
  assert.equal(normalizePlatformGamePosterUrl(`https://example.com/${'a'.repeat(481)}`), null);
});

test('主机平台外部请求限制等待时间并保留取消信号', () => {
  const controller = new AbortController();
  assert.deepEqual(buildPlatformGameRequestOptions(controller.signal), {
    signal: controller.signal,
    timeout: PLATFORM_GAME_REQUEST_TIMEOUT_MS,
  });
  assert.equal(PLATFORM_GAME_REQUEST_TIMEOUT_MS, 30_000);
});

test('主机平台导入状态区分开关和 OpenXBL 密钥', () => {
  assert.deepEqual(buildPlatformImportStatus({
    openxblEnabled: false,
    openxblApiKey: '',
    psnProfilesEnabled: false,
  }), {
    xbox: { available: false, reason: 'disabled' },
    psn: { available: false, reason: 'disabled' },
  });
  assert.deepEqual(buildPlatformImportStatus({
    openxblEnabled: true,
    openxblApiKey: '',
    psnProfilesEnabled: true,
  }), {
    xbox: { available: false, reason: 'missing_api_key' },
    psn: { available: true, reason: null },
  });
});

test('同步中心来源状态区分凭据、账号、开关和本地数据缺口', () => {
  const unavailable = buildImportSourceStatus({
    steamApiKey: '',
    steamDefaultId: '',
    traktClientId: 'client-id',
    traktAccessToken: '',
    doubanHarvestEnabled: false,
    doubanUserId: '',
    doubanCollectExists: false,
    openxblEnabled: false,
    openxblApiKey: '',
    psnProfilesEnabled: false,
  });
  assert.deepEqual(unavailable.steam, { available: false, reason: 'missing_api_key' });
  assert.deepEqual(unavailable.trakt, { available: false, reason: 'missing_access_token' });
  assert.deepEqual(unavailable.douban.modes.json, { available: false, reason: 'missing_data' });
  assert.deepEqual(unavailable.douban.modes.full, { available: false, reason: 'disabled' });
  assert.deepEqual(unavailable.xbox, { available: false, reason: 'disabled' });
  assert.deepEqual(unavailable.psn, { available: false, reason: 'disabled' });

  const available = buildImportSourceStatus({
    steamApiKey: 'configured',
    steamDefaultId: '76561198000000000',
    traktClientId: 'client-id',
    traktAccessToken: 'token',
    doubanHarvestEnabled: true,
    doubanUserId: 'user',
    doubanCollectExists: true,
    openxblEnabled: true,
    openxblApiKey: 'openxbl-key',
    psnProfilesEnabled: true,
  });
  assert.equal(available.steam.available, true);
  assert.equal(available.trakt.available, true);
  assert.equal(available.douban.available, true);
  assert.deepEqual(available.xbox, { available: true, reason: null });
  assert.deepEqual(available.psn, { available: true, reason: null });
  assert.equal(available.douban.modes.incremental.available, true);
});

test('数据健康查询只接受适用的问题类型和有界分页参数', () => {
  assert.deepEqual(parseDataHealthIssueParameters({
    category: 'movie',
    issue: 'missing_poster',
    cursor: '12',
    limit: '25',
  }), {
    category: 'movie',
    issue: 'missing_poster',
    cursor: 12n,
    limit: 25,
  });
  assert.throws(
    () => parseDataHealthIssueParameters({ category: 'game', issue: 'missing_date' }),
    /不适用于 game/,
  );
  assert.throws(
    () => parseDataHealthIssueParameters({ category: 'movie', issue: 'missing_poster', extra: '1' }),
    /未知参数/,
  );
  assert.equal(isDataHealthIssueApplicable('game', 'missing_overview'), false);
  assert.deepEqual(buildDataHealthWhere('movie', 'missing_date'), {
    OR: [{ releaseDate: null }, { releaseDate: '' }],
  });
  assert.deepEqual(buildDataHealthWhere('game', 'missing_external_id'), {
    rawgId: null,
    steamAppId: null,
    OR: [{ xboxId: null }, { xboxId: '' }],
    AND: [{ OR: [{ psnId: null }, { psnId: '' }] }],
  });
});

test('数据健康自动修复限制批量大小并拒绝不安全的游戏标识匹配', () => {
  assert.equal(isDataHealthRepairSupported('movie', 'missing_overview'), true);
  assert.equal(isDataHealthRepairSupported('game', 'missing_poster'), true);
  assert.equal(isDataHealthRepairSupported('game', 'missing_external_id'), false);
  assert.deepEqual(parseDataHealthRepairBody({
    category: 'movie',
    issue: 'missing_poster',
    limit: 20,
  }), { category: 'movie', issue: 'missing_poster', limit: 20 });
  assert.throws(
    () => parseDataHealthRepairBody({ category: 'game', issue: 'missing_external_id' }),
    /需要人工核对/,
  );
  assert.throws(
    () => parseDataHealthRepairBody({ category: 'movie', issue: 'missing_poster', limit: 51 }),
    /1 到 50/,
  );
  assert.throws(
    () => parseDataHealthRepairBody({ category: 'movie', issue: 'missing_poster', extra: true }),
    /未知字段/,
  );
  assert.deepEqual(buildMediaRepairUpdate('movie', 'missing_poster', {
    tmdbId: 42n,
    tmdbPosterUrl: 'https://existing.example/poster.jpg',
    tmdbOverview: null,
    tmdbReleaseDate: null,
  }, 42, 'https://new.example/poster.jpg'), {
    posterUrl: 'https://new.example/poster.jpg',
  });
  assert.deepEqual(buildMediaRepairUpdate('tv_show', 'missing_date', {
    tmdbId: null,
    tmdbPosterUrl: null,
    tmdbOverview: null,
    tmdbReleaseDate: null,
  }, 99, '2026-07-15'), {
    tmdbId: 99,
    firstAirDate: '2026-07-15',
    tmdbReleaseDate: '2026-07-15',
  });
});

test('疑似重复检测只合并强标识或带年份和平台的同名候选', () => {
  assert.equal(normalizeDuplicateTitle(' Spider-Man：Homecoming '), 'spidermanhomecoming');
  const movieGroups = findDuplicateGroups([
    {
      id: 1n,
      category: 'movie',
      title: 'Alpha',
      posterUrl: null,
      year: '2020',
      platform: null,
      protected: true,
      identityValues: { tmdb_id: '10' },
    },
    {
      id: 2n,
      category: 'movie',
      title: 'Beta / 贝塔',
      posterUrl: null,
      year: '2021',
      platform: null,
      protected: false,
      identityValues: { tmdb_id: '10' },
    },
    {
      id: 3n,
      category: 'movie',
      title: '贝塔',
      posterUrl: null,
      year: '2021',
      platform: null,
      protected: false,
      identityValues: {},
    },
    {
      id: 4n,
      category: 'movie',
      title: '贝塔',
      posterUrl: null,
      year: null,
      platform: null,
      protected: false,
      identityValues: {},
    },
  ]);
  assert.equal(movieGroups.length, 1);
  assert.deepEqual(movieGroups[0].reasons, ['tmdb_id', 'title_year']);
  assert.deepEqual(movieGroups[0].records.map(record => record.id), [1, 2, 3]);

  const gameGroups = findDuplicateGroups([
    { id: 5n, category: 'game', title: 'Portal 2', posterUrl: null, year: null, platform: 'PC', protected: false, identityValues: {} },
    { id: 6n, category: 'game', title: 'Portal II', posterUrl: null, year: null, platform: 'PC', protected: false, identityValues: {} },
    { id: 7n, category: 'game', title: 'Portal 2', posterUrl: null, year: null, platform: 'PSN', protected: false, identityValues: {} },
    { id: 8n, category: 'game', title: 'Portal 2', posterUrl: null, year: null, platform: 'PC', protected: false, identityValues: {} },
  ]);
  assert.equal(gameGroups.length, 1);
  assert.deepEqual(gameGroups[0].records.map(record => record.id), [5, 8]);
  assert.deepEqual(parseDuplicateListParameters({ category: 'game', limit: '10' }), {
    category: 'game', cursor: 0, limit: 10, review: 'unreviewed',
  });
  assert.equal(movieGroups[0].key.startsWith('movie:'), true);
  assert.equal(movieGroups[0].key.length, 70);
  assert.deepEqual(parseDuplicateListParameters({ category: 'movie', review: 'reviewed' }), {
    category: 'movie', cursor: 0, limit: 20, review: 'reviewed',
  });
  assert.deepEqual(parseDuplicateReviewBody({
    category: 'movie',
    groupKey: movieGroups[0].key,
  }), {
    category: 'movie',
    groupKey: movieGroups[0].key,
  });
  assert.throws(
    () => parseDuplicateReviewBody({ category: 'movie', groupKey: 'x'.repeat(81) }),
    /80/,
  );
  assert.throws(
    () => parseDuplicateListParameters({ category: 'movie', review: 'all' }),
    /review/,
  );
  assert.throws(
    () => parseDuplicateListParameters({ category: 'movie', cursor: '0' }),
    /正整数/,
  );
});

test('统一详情响应保留三类记录的显示字段和来源身份', () => {
  const common = {
    id: 12n,
    title: '详情记录',
    posterUrl: null,
    status: 'DONE',
    rating: 5,
    shortReview: '个人短评',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    importReviewState: 'PENDING',
  };
  const movie = toMovieRecord({
    ...common,
    overview: '电影简介',
    releaseDate: '2025-12-31',
    doubanId: '12345',
    tmdbId: 987654321n,
    imdbId: 'tt1234567',
    traktId: '765',
  });
  assert.deepEqual({
    overview: movie.overview,
    releaseDate: movie.releaseDate,
    doubanId: movie.doubanId,
    tmdbId: movie.tmdbId,
    imdbId: movie.imdbId,
    traktId: movie.traktId,
    importReviewState: movie.importReviewState,
  }, {
    overview: '电影简介',
    releaseDate: '2025-12-31',
    doubanId: '12345',
    tmdbId: '987654321',
    imdbId: 'tt1234567',
    traktId: '765',
    importReviewState: 'PENDING',
  });

  const show = toTvShowRecord({ ...common, firstAirDate: '2024-01-01', tmdbId: 44n });
  assert.equal(show.firstAirDate, '2024-01-01');
  assert.equal(show.tmdbId, '44');

  const game = toGameRecord({
    ...common,
    platform: 'xbox',
    rawgId: 77n,
    steamAppId: 88n,
    xboxId: 'xbox-title',
    psnId: 'psn-title',
  });
  assert.deepEqual({
    platform: game.platform,
    rawgId: game.rawgId,
    steamAppId: game.steamAppId,
    xboxId: game.xboxId,
    psnId: game.psnId,
  }, {
    platform: 'xbox',
    rawgId: '77',
    steamAppId: '88',
    xboxId: 'xbox-title',
    psnId: 'psn-title',
  });
});

test('TMDB 详情返回可用于纠正重复候选的身份和原始字段', () => {
  assert.equal(parseTmdbDetailParameters({ mediaType: 'movie' }), 'movie');
  assert.equal(parseTmdbDetailParameters({ mediaType: 'tv_show' }), 'tv_show');
  assert.throws(() => parseTmdbDetailParameters({ mediaType: 'game' }), /mediaType/);
  assert.throws(() => parseTmdbDetailParameters({ category: 'movie' }), /未知参数/);
  assert.deepEqual(mapTmdbIdentityMetadata({
    imdb_id: 'tt1234567',
    popularity: 42.5,
    genres: [{ id: 28 }, { id: 12 }],
  }, false), {
    imdbId: 'tt1234567',
    tmdbPopularity: 42.5,
    tmdbGenreIds: '28,12',
  });
  assert.deepEqual(mapTmdbIdentityMetadata({
    external_ids: { imdb_id: 'tt7654321' },
    genres: [],
  }, true), {
    imdbId: 'tt7654321',
    tmdbPopularity: null,
    tmdbGenreIds: '',
  });
  assert.deepEqual(mapDetailRating(8.4, 'tmdb'), { rating: 8.4, ratingSource: 'tmdb' });
  assert.deepEqual(mapDetailRating('7.9', 'imdb'), { rating: 7.9, ratingSource: 'imdb' });
  assert.deepEqual(mapDetailRating('', 'tmdb'), { rating: null, ratingSource: 'tmdb' });
  assert.deepEqual(mapDetailRating('not-rated', 'douban'), { rating: null, ratingSource: 'douban' });
});

test('PSNProfiles 分页和游戏行解析保留奖杯与封面数据', async () => {
  const firstPage = parsePsnProfilePage({
    html: '<table>第一页</table><script>nextPage = 2;</script>',
  });
  assert.deepEqual(firstPage, {
    html: '<table>第一页</table><script>nextPage = 2;</script>',
    hasNext: true,
  });
  assert.deepEqual(parsePsnProfilePage({ html: '<script>nextPage = 0;</script>' }), {
    html: '<script>nextPage = 0;</script>',
    hasNext: false,
  });
  assert.equal(parsePsnProfilePage({ html: '<tr>无分页标记</tr>' }).hasNext, true);
  assert.equal(parsePsnProfilePage('<html>普通单页</html>').hasNext, false);
  assert.equal(isPsnProfilesChallengePage('<title>Just a moment...</title>'), true);
  assert.equal(extractPsnGameId('/trophies/3303-dying-light'), '3303');
  assert.equal(extractPsnGameId('/trophies/19260-god-of-war-ragnar%C3%B6k/TestPlayer'), '19260');
  assert.equal(extractPsnGameId('/trophies/not-a-game/TestPlayer'), null);
  const requestedPages: number[] = [];
  const combinedHtml = await collectPsnProfilePages(async (page) => {
    requestedPages.push(page);
    return page === 1
      ? { html: '<tr>第一页</tr>', nextPage: 2 }
      : { html: '<tr>第二页</tr>', nextPage: 0 };
  }, 10);
  assert.deepEqual(requestedPages, [1, 2]);
  assert.equal(combinedHtml, '<tr>第一页</tr>\n<tr>第二页</tr>');
  await assert.rejects(
    collectPsnProfilePages(async () => ({ html: '<tr>仍有下一页</tr>', nextPage: 2 }), 1),
    /分页超过 1 页/,
  );

  const games = parsePsnGames(`
    <table>
      <tr>
        <td><picture class="game"><img src="//cdn.example/cover.jpg" alt="FoxyLand"></picture></td>
        <td>
          <a class="title" href="/trophies/10034-foxyland/TestPlayer">FoxyLand</a>
          <a href="/trophies/10034-foxyland/TestPlayer">奖杯详情</a>
          <div class="small-info"><b>12</b> of <b>15</b> Trophies</div>
        </td>
      </tr>
      <tr data-earned="3" data-total="20">
        <td><img src="/lib/img/games/second.png" alt="Second Game"></td>
        <td><a class="title" href="/trophies/20000-second-game-with-a-very-long-title-that-exceeds-the-database-identity-limit/TestPlayer">Second Game</a></td>
      </tr>
      <tr><td><img src="javascript:alert(1)"><a class="title" href="/trophies/30000-third-game/TestPlayer">Third Game</a></td></tr>
      <tr><td><a class="title" href="/trophies/not-a-game/TestPlayer">Invalid Game</a></td></tr>
    </table>
  `, 'https://psnprofiles.com');
  assert.deepEqual(games, [
    {
      psnId: '10034',
      title: 'FoxyLand',
      posterUrl: 'https://cdn.example/cover.jpg',
      achievementTotal: 15,
      achievementUnlocked: 12,
    },
    {
      psnId: '20000',
      title: 'Second Game',
      posterUrl: 'https://psnprofiles.com/lib/img/games/second.png',
      achievementTotal: 20,
      achievementUnlocked: 3,
    },
    {
      psnId: '30000',
      title: 'Third Game',
      posterUrl: null,
      achievementTotal: null,
      achievementUnlocked: null,
    },
  ]);
});

test('PSNProfiles 将 Cloudflare 403 识别为需要更新 Cookie', () => {
  const challengeHtml = '<html><head><title>Attention Required! | Cloudflare</title></head></html>';
  assert.equal(isPsnProfilesChallengeResponse(403, challengeHtml), true);
  assert.equal(isPsnProfilesChallengeResponse(403, '<html><title>Profile not found</title></html>'), false);
  assert.equal(isPsnProfilesChallengeResponse(404, challengeHtml), false);
  assert.equal(isPsnProfilesChallengeResponse(403, { error: 'forbidden' }), false);
});

test('PSN 导入把 Cloudflare 403 转换为可操作的同步错误', async () => {
  const mutableConfig = config as unknown as { psnProfiles: { enabled: boolean } };
  const originalEnabled = mutableConfig.psnProfiles.enabled;
  const axiosClient = axios as unknown as { get: typeof axios.get };
  const originalGet = axiosClient.get;

  try {
    mutableConfig.psnProfiles.enabled = true;
    axiosClient.get = async () => {
      throw {
        isAxiosError: true,
        message: 'Request failed with status code 403',
        response: {
          status: 403,
          data: '<html><head><title>Attention Required! | Cloudflare</title></head></html>',
        },
      };
    };
    const result = await importPsnOwnedGames('test-account');
    assert.deepEqual(result, {
      total: 0,
      imported: 0,
      updated: 0,
      skipped: 0,
      errors: ['无法获取 PSNProfiles 页面: PSNProfiles 访问被验证页面拦截，请更新 Cookie'],
    });
  } finally {
    axiosClient.get = originalGet;
    mutableConfig.psnProfiles.enabled = originalEnabled;
  }
});

test('RAWG 封面响应只接受非空图片地址并补全协议', () => {
  assert.equal(parseRawgPosterUrl({
    results: [{ background_image: '//media.rawg.io/game.jpg' }],
  }), 'https://media.rawg.io/game.jpg');
  assert.equal(parseRawgPosterUrl({ results: [] }), null);
  assert.equal(parseRawgPosterUrl({ results: [{ background_image: '' }] }), null);
});

test('同步导入和任务查询拒绝未知或超长参数', () => {
  assert.doesNotThrow(() => assertEmptyImportRequestBody(undefined));
  assert.doesNotThrow(() => assertEmptyImportRequestBody({}));
  assert.throws(() => assertEmptyImportRequestBody({ limit: 10 }), RequestValidationError);
  assert.throws(() => assertEmptyImportRequestBody([]), RequestValidationError);

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
  assert.doesNotThrow(() => assertNoQueryParameters({}));
  assert.doesNotThrow(() => assertEmptyRequestBody(undefined));
  assert.doesNotThrow(() => assertEmptyRequestBody({}));
  assert.throws(() => assertNoQueryParameters({ dryRun: 'true' }), RequestValidationError);
  assert.throws(() => assertEmptyRequestBody({ reason: 'cleanup' }), RequestValidationError);
  assert.throws(() => assertEmptyRequestBody([]), RequestValidationError);

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
  assert.equal(
    parsePositiveBigIntParameter('9223372036854775807', 'entityId'),
    9223372036854775807n,
  );
  assert.equal(parsePositiveBigIntParameter(42, 'entityId'), 42n);
  assert.throws(() => parsePositiveBigIntParameter('not-a-number', 'entityId'), RequestValidationError);
  assert.throws(
    () => parsePositiveBigIntParameter('9223372036854775808', 'entityId'),
    RequestValidationError,
  );
  assert.throws(
    () => parsePositiveBigIntParameter('9'.repeat(1000), 'entityId'),
    RequestValidationError,
  );
  assert.equal(parseDateParameter('2026-07-15T00:00:00.000Z', 'from')?.toISOString(), '2026-07-15T00:00:00.000Z');
  assert.throws(() => parseDateParameter('not-a-date', 'from'), RequestValidationError);
  assert.deepEqual(parseActivityCursor('2026-07-15T00:00:00.000Z__42'), {
    createdAt: new Date('2026-07-15T00:00:00.000Z'),
    id: 42n,
  });
  assert.throws(() => parseActivityCursor('2026-07-15T00:00:00.000Z__bad'), RequestValidationError);
  assert.throws(() => parseActivityCursor('invalid-cursor'), RequestValidationError);
  assert.throws(
    () => parseActivityCursor(`2026-07-15T00:00:00.000Z__${'1'.repeat(101)}`),
    RequestValidationError,
  );
  assert.equal(parseActivityCursor(undefined), null);

  assert.deepEqual(parseActivityListParameters({
    limit: '25',
    action: 'UPDATE',
    entityType: 'MOVIE',
    entityId: '42',
  }), {
    limit: 25,
    cursor: null,
    action: 'UPDATE',
    entityType: 'MOVIE',
    entityId: 42n,
    from: null,
    to: null,
  });
  assert.equal(parseActivityListParameters({ action: 'TASK_CANCEL' }).action, 'TASK_CANCEL');
  assert.equal(parseActivityListParameters({ action: 'DATA_CHANGE' }).action, 'DATA_CHANGE');
  assert.throws(() => parseActivityListParameters({ action: 'INVALID' }), RequestValidationError);
  assert.throws(() => parseActivityListParameters({ entityType: 'USER' }), RequestValidationError);
  assert.throws(() => parseActivityListParameters({ verbose: 'true' }), RequestValidationError);
  assert.throws(() => parseActivityListParameters({
    from: '2026-07-16T00:00:00.000Z',
    to: '2026-07-15T00:00:00.000Z',
  }), RequestValidationError);
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
  const protectedCreate = {
    ...entry,
    action: 'CREATE',
    entityType: 'MOVIE',
    newValues: { doubanId: '1292052', status: 'DONE' },
  };
  assert.equal(isProtectedDoubanCreate(protectedCreate), true);
  assert.equal(serializeLog(protectedCreate).undoable, false);
  assert.equal(serializeLog({ ...protectedCreate, entityType: 'TV_SHOW' }).undoable, false);
  assert.equal(serializeLog({ ...protectedCreate, entityType: 'GAME' }).undoable, true);
  assert.equal(serializeLog({ ...protectedCreate, newValues: { status: 'DONE' } }).undoable, true);
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
  assert.doesNotThrow(() => assertRadarSyncRequest({}, undefined));
  assert.doesNotThrow(() => assertRadarSyncRequest({}, {}));

  assert.throws(() => parseRadarListParameters({ category: 'invalid' }), RequestValidationError);
  assert.throws(() => parseRadarListParameters({ verbose: 'true' }), RequestValidationError);
  assert.throws(() => parseRadarListParameters({ page: '1.5' }), RequestValidationError);
  assert.throws(() => parseRadarListParameters({ limit: '101' }), RequestValidationError);
  assert.throws(() => parseRadarListParameters({ source: ['tmdb'] }), RequestValidationError);
  assert.throws(() => parseRadarSyncSource('douban'), RequestValidationError);
  assert.throws(() => assertRadarSyncRequest({ source: 'tmdb' }, undefined), RequestValidationError);
  assert.throws(() => assertRadarSyncRequest({}, { source: 'tmdb' }), RequestValidationError);
  assert.throws(() => assertRadarSyncRequest({}, []), RequestValidationError);
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
  assert.doesNotThrow(() => assertKnownSearchQueryParameters({}));
  assert.equal(
    parseImageProxyParameters({ url: ' https://img1.doubanio.com/view/photo.jpg ' }),
    'https://img1.doubanio.com/view/photo.jpg',
  );

  assert.throws(() => parseExternalSearchParameters({}, providers), RequestValidationError);
  assert.throws(() => parseExternalSearchParameters({ query: ['测试'] }, providers), RequestValidationError);
  assert.throws(() => parseExternalSearchParameters({ query: 'x'.repeat(201) }, providers), RequestValidationError);
  assert.throws(() => parseExternalSearchParameters({ query: '测试', page: '1x' }, providers), RequestValidationError);
  assert.throws(() => parseExternalSearchParameters({ query: '测试', page: '1001' }, providers), RequestValidationError);
  assert.throws(() => parseExternalSearchParameters({ query: '测试', providers: 'unknown' }, providers), RequestValidationError);
  assert.deepEqual(parseExternalSearchParameters({ query: '传送门', providers: 'rawg,steam' }, GAME_SEARCH_PROVIDERS), {
    query: '传送门',
    page: 1,
    providers: ['rawg', 'steam'],
  });
  assert.throws(
    () => parseExternalSearchParameters({ query: '传送门', providers: 'xbox' }, GAME_SEARCH_PROVIDERS),
    RequestValidationError,
  );
  assert.throws(
    () => parseExternalSearchParameters({ query: '传送门', providers: 'psn' }, GAME_SEARCH_PROVIDERS),
    RequestValidationError,
  );
  assert.throws(
    () => parseExternalSearchParameters({ query: '传送门', providers: 'switch' }, GAME_SEARCH_PROVIDERS),
    RequestValidationError,
  );
  assert.throws(() => parseExternalSearchParameters({ query: '测试', providers: 'tmdb,' }, providers), RequestValidationError);
  assert.throws(() => parseExternalSearchParameters({ query: '测试', limit: '10' }, providers), RequestValidationError);
  assert.throws(() => assertKnownSearchQueryParameters({ language: 'zh-CN' }), RequestValidationError);
  assert.throws(() => parseImageProxyParameters({ url: 'https://img1.doubanio.com/a.jpg', cache: '1' }), RequestValidationError);
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
    query: undefined,
    source: 'all',
    review: 'all',
    importReview: 'all',
    sort: 'recent',
  });
  assert.deepEqual(parseLibraryListParameters({
    cursor,
    limit: '100',
    includeTotals: 'false',
    category: 'media',
    year: '2026',
    status: 'done',
    query: ' 后室 ',
    source: 'douban',
    review: 'reviewed',
    importReview: 'pending',
    sort: 'recent',
  }), {
    cursor,
    limit: 100,
    includeTotals: false,
    category: 'media',
    year: 2026,
    status: RecordStatus.DONE,
    query: '后室',
    source: 'douban',
    review: 'reviewed',
    importReview: 'pending',
    sort: 'recent',
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
  assert.deepEqual(parseLibraryRandomParameters({}), {
    limit: 1,
    category: 'all',
    status: undefined,
  });
  assert.deepEqual(parseLibraryRandomParameters({
    limit: '15',
    t: '1784040000000',
    category: 'game',
    status: 'WANT',
  }), {
    limit: 15,
    category: 'game',
    status: RecordStatus.WANT,
  });
  assert.equal(parseTimelineCategory(undefined), 'all');
  assert.equal(parseTimelineYearsParameters({ category: 'tv_show' }), 'tv_show');
  assert.equal(parseAnalyticsYear(undefined, 2026), 2026);
  assert.equal(parseAnalyticsYear('2025', 2026), 2025);
  assert.equal(parseAnalyticsParameters({ year: '2025' }, 2026), 2025);
  assert.deepEqual(buildCompletedWhere({ status: RecordStatus.DONE }), {
    status: RecordStatus.DONE,
  });
  assert.equal(buildCompletedWhere({ status: RecordStatus.DROPPED }), null);
  const ratingCursor = encodeLibraryCursor({
    id: 7,
    category: 'game',
    createdAt: '2026-07-15T00:00:00.000Z',
    rating: 5,
  }, 'rating');
  const parsedRatingCursor = parseLibraryCursor(ratingCursor, 'rating');
  assert.equal(parsedRatingCursor?.category, 'game');
  assert.equal(parsedRatingCursor?.id, 7);
  assert.equal(parsedRatingCursor?.rating, 5);
  assert.equal(parseLibraryCursor(ratingCursor, 'recent'), null);
  assert.equal(parseLibraryListParameters({ cursor: ratingCursor, sort: 'rating' }).sort, 'rating');

  assert.throws(() => parseLibraryListParameters({ cursor: 'invalid' }), RequestValidationError);
  assert.throws(() => parseLibraryListParameters({ cursor: '2026-07-15T00:00:00.000Z__1.5' }), RequestValidationError);
  assert.throws(() => parseLibraryListParameters({ limit: '1x' }), RequestValidationError);
  assert.throws(() => parseLibraryListParameters({ includeTotals: '0' }), RequestValidationError);
  assert.throws(() => parseLibraryListParameters({ category: 'unknown' }), RequestValidationError);
  assert.throws(() => parseLibraryListParameters({ year: '2026x' }), RequestValidationError);
  assert.throws(() => parseLibraryListParameters({ status: 'unknown' }), RequestValidationError);
  assert.throws(() => parseLibraryListParameters({ query: 'x'.repeat(201) }), RequestValidationError);
  assert.throws(() => parseLibraryListParameters({ source: 'unknown' }), RequestValidationError);
  assert.throws(() => parseLibraryListParameters({ review: 'unknown' }), RequestValidationError);
  assert.throws(() => parseLibraryListParameters({ importReview: 'unknown' }), RequestValidationError);
  assert.throws(() => parseLibraryListParameters({ sort: 'title' }), RequestValidationError);
  assert.throws(() => parseLibraryListParameters({ cursor, sort: 'rating' }), RequestValidationError);
  assert.throws(() => parseLibraryListParameters({ verbose: 'true' }), RequestValidationError);
  assert.throws(() => parseLibraryRandomParameters({ t: 'invalid' }), RequestValidationError);
  assert.throws(() => parseLibraryRandomParameters({ category: 'media' }), RequestValidationError);
  assert.throws(() => parseLibraryRandomParameters({ status: 'all' }), RequestValidationError);
  assert.throws(() => parseLibraryRandomParameters({ verbose: 'true' }), RequestValidationError);
  assert.throws(() => parseTimelineCategory(['all']), RequestValidationError);
  assert.throws(() => parseTimelineListParameters({ verbose: 'true' }), RequestValidationError);
  assert.throws(() => parseTimelineYearsParameters({ year: '2026' }), RequestValidationError);
  assert.throws(() => parseAnalyticsYear('1899', 2026), RequestValidationError);
  assert.throws(() => parseAnalyticsParameters({ verbose: 'true' }, 2026), RequestValidationError);
});

test('导入审核请求只接受唯一且有界的记录引用', () => {
  assert.deepEqual(parseImportReviewDecisionBody({
    decision: 'ACCEPTED',
    records: [
      { category: 'movie', id: 1 },
      { category: 'tv_show', id: '2' },
      { category: 'game', id: 3 },
    ],
  }), {
    decision: 'ACCEPTED',
    records: [
      { category: 'movie', id: 1 },
      { category: 'tv_show', id: 2 },
      { category: 'game', id: 3 },
    ],
  });
  assert.throws(() => parseImportReviewDecisionBody({ decision: 'PENDING', records: [{ category: 'movie', id: 1 }] }), RequestValidationError);
  assert.throws(() => parseImportReviewDecisionBody({ decision: 'IGNORED', records: [] }), RequestValidationError);
  assert.throws(() => parseImportReviewDecisionBody({ decision: 'IGNORED', records: [{ category: 'xbox', id: 1 }] }), RequestValidationError);
  assert.throws(() => parseImportReviewDecisionBody({ decision: 'IGNORED', records: [{ category: 'game', id: 1 }, { category: 'game', id: 1 }] }), RequestValidationError);
  assert.throws(() => parseImportReviewDecisionBody({ decision: 'IGNORED', records: [{ category: 'game', id: 1, title: 'x' }] }), RequestValidationError);
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

  const notFoundError = Object.assign(new Error('Prisma record not found'), {
    name: 'PrismaClientKnownRequestError',
    code: 'P2025',
  });
  assert.deepEqual(getHttpErrorResponse(notFoundError), {
    status: 404,
    message: '记录不存在',
    internalMessage: 'Prisma record not found',
    stack: notFoundError.stack,
  });

  const conflictError = Object.assign(new Error('Unique constraint failed'), {
    name: 'PrismaClientKnownRequestError',
    code: 'P2002',
  });
  assert.deepEqual(getHttpErrorResponse(conflictError), {
    status: 409,
    message: '记录已存在',
    internalMessage: 'Unique constraint failed',
    stack: conflictError.stack,
  });

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
  const taskActivities: string[] = [];
  const activityLogger = async (entry: { action: string }) => {
    taskActivities.push(entry.action);
  };
  const terminalTasks: Array<{ status: string }> = [];
  const terminalTaskObserver = (task: { status: string }) => terminalTasks.push(task);

  try {
    const firstManager = new TaskManager({ storagePath, now: () => now, activityLogger, terminalTaskObserver });
    assert.equal(firstManager.initialize(), 0);
    const runningTask = firstManager.createTask('test-import', '测试导入');
    assert.deepEqual(taskActivities, ['TASK_START']);
    assert.throws(
      () => firstManager.createTask('test-import', '重复导入'),
      (error: unknown) => error instanceof TaskConflictError && error.status === 409,
    );
    firstManager.updateProgress(runningTask.taskId, { processed: 3, total: 10, currentTitle: '第三条' });
    firstManager.flush();

    now = new Date('2026-07-14T12:01:00.000Z');
    const recoveredManager = new TaskManager({ storagePath, now: () => now, activityLogger, terminalTaskObserver });
    assert.equal(recoveredManager.initialize(), 1);
    const recoveredTask = recoveredManager.getTask(runningTask.taskId);
    assert.equal(recoveredTask?.status, 'failed');
    assert.equal(recoveredTask?.error, INTERRUPTED_TASK_ERROR);
    assert.equal(recoveredTask?.progress.processed, 3);
    assert.equal(recoveredTask?.progress.currentTitle, '');
    assert.equal(recoveredTask?.completedAt, now.toISOString());
    assert.deepEqual(terminalTasks.map(task => task.status), ['failed']);
    assert.deepEqual(taskActivities, ['TASK_START', 'TASK_FAIL']);

    recoveredManager.completeTask(runningTask.taskId, { total: 10, imported: 10, skipped: 0, errors: [] });
    assert.equal(recoveredManager.getTask(runningTask.taskId)?.status, 'failed');

    const cancelledTask = recoveredManager.createTask('test-import', '取消测试');
    assert.deepEqual(recoveredManager.cancelTask(cancelledTask.taskId), { ok: true });
    assert.deepEqual(terminalTasks.map(task => task.status), ['failed', 'cancelled']);
    assert.deepEqual(taskActivities, ['TASK_START', 'TASK_FAIL', 'TASK_START', 'TASK_CANCEL']);
    recoveredManager.failTask(cancelledTask.taskId, '取消后的异步异常');
    assert.equal(recoveredManager.getTask(cancelledTask.taskId)?.status, 'cancelled');

    const reloadedManager = new TaskManager({ storagePath, now: () => now, activityLogger, terminalTaskObserver });
    assert.equal(reloadedManager.initialize(), 0);
    assert.equal(reloadedManager.getTask(runningTask.taskId)?.status, 'failed');
    assert.equal(reloadedManager.getTask(cancelledTask.taskId)?.status, 'cancelled');

    now = new Date('2026-07-14T12:32:00.001Z');
    const expiredManager = new TaskManager({ storagePath, now: () => now, activityLogger, terminalTaskObserver });
    assert.equal(expiredManager.initialize(), 0);
    assert.deepEqual(expiredManager.listTasks(), []);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('同步历史按来源持久化最近一次终态且忽略非同步任务', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pixelreel-sync-history-'));
  const storagePath = path.join(tempDir, 'sync-history.json');
  const store = new SyncHistoryStore(storagePath);
  const task = (overrides: Record<string, unknown> = {}) => ({
    taskId: 'douban-2',
    type: 'douban-harvest',
    label: '豆瓣增量同步',
    status: 'completed',
    result: { total: 10, imported: 2, updated: 1, skipped: 7, errors: [] },
    error: null,
    startedAt: '2026-07-15T10:00:00.000Z',
    completedAt: '2026-07-15T10:05:00.000Z',
    ...overrides,
  });

  try {
    store.record(task());
    store.record(task({
      taskId: 'douban-1',
      status: 'failed',
      result: null,
      error: '旧错误',
      completedAt: '2026-07-14T10:05:00.000Z',
    }));
    store.record(task({ taskId: 'other', type: 'tmdb-detail-backfill' }));
    store.record(task({
      taskId: 'xbox-1',
      type: 'xbox-owned',
      label: 'Xbox 导入',
    }));
    store.record(task({
      taskId: 'psn-1',
      type: 'psn-owned',
      label: 'PSN 导入',
    }));
    store.record(task({
      taskId: 'trakt-1',
      type: 'trakt-import',
      label: 'Trakt 电影同步',
      status: 'failed',
      result: null,
      error: '令牌失效',
    }));

    const history = new SyncHistoryStore(storagePath).list();
    assert.equal(history.douban?.taskId, 'douban-2');
    assert.deepEqual(history.douban?.result, {
      total: 10,
      imported: 2,
      updated: 1,
      skipped: 7,
      errors: [],
    });
    assert.equal(history.trakt?.status, 'failed');
    assert.equal(history.trakt?.error, '令牌失效');
    assert.equal(history.steam, null);
    assert.equal(history.xbox?.taskId, 'xbox-1');
    assert.equal(history.psn?.taskId, 'psn-1');
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

    nextCalled = false;
    const traktCallbackRequest = { headers: {}, method: 'GET', path: '/trakt/callback' } as Request;
    authMiddleware(traktCallbackRequest, response, () => { nextCalled = true; });
    assert.equal(nextCalled, true);

    nextCalled = false;
    const traktCallbackPost = { headers: {}, method: 'POST', path: '/trakt/callback' } as Request;
    authMiddleware(traktCallbackPost, response, () => { nextCalled = true; });
    assert.equal(nextCalled, false);
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
  assert.doesNotThrow(() => assertEmptyTraktImportBody(undefined));
  assert.doesNotThrow(() => assertEmptyTraktImportBody({}));
  assert.throws(() => assertEmptyTraktImportBody({ accessToken: 'secret' }), RequestValidationError);
  assert.throws(() => assertEmptyTraktImportBody([]), RequestValidationError);
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

test('Trakt OAuth state 限时且只能消费一次', () => {
  const stateStore = new TraktOAuthStateStore();
  const state = stateStore.create();
  assert.match(state, /^[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(parseTraktCallbackParameters({ code: ' code-1 ', state }, stateStore), {
    code: 'code-1',
  });
  assert.throws(
    () => parseTraktCallbackParameters({ code: 'code-1', state }, stateStore),
    RequestValidationError,
  );

  const expiredStore = new TraktOAuthStateStore();
  const expiredState = expiredStore.create(0);
  assert.equal(expiredStore.consume(expiredState, 10 * 60 * 1000), false);
  assert.throws(
    () => parseTraktCallbackParameters({ code: 'code-2', state: 'invalid', debug: '1' }, expiredStore),
    RequestValidationError,
  );
});

test('Trakt OAuth 拒绝无效的令牌响应', () => {
  assert.equal(parseTraktAccessToken({ access_token: ' token-123 ' }), 'token-123');
  for (const value of [null, [], {}, { access_token: '' }, { access_token: 123 }]) {
    assert.throws(
      () => parseTraktAccessToken(value),
      (error: unknown) => error instanceof Error
        && (error as Error & { status?: number }).status === 502,
    );
  }
  assert.throws(
    () => parseTraktAccessToken({ access_token: 'x'.repeat(4097) }),
    (error: unknown) => error instanceof Error
      && (error as Error & { status?: number }).status === 502,
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
  assert.equal(parseTraktPageData(new Array(250).fill({})).length, 250);
  assert.throws(
    () => parseTraktPageData(new Array(251).fill({})),
    (error: any) => error.status === 502
      && error.message === 'Trakt 返回的单页数据超出 250 条限制',
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

test('分类转换在源记录已被并发处理时中止事务', () => {
  assert.doesNotThrow(() => assertConvertedSourceDeleted(1));
  assert.throws(
    () => assertConvertedSourceDeleted(0),
    (error: any) => error.status === 409 && error.message === '记录已被其他操作转换，请重新搜索',
  );
});

test('资料库快照保留豆瓣原始字段并生成可移植 JSON', () => {
  const exportedAt = new Date('2026-07-15T08:30:45.123Z');
  const snapshot = buildLibraryExportSnapshot({
    movies: [{
      id: 1n,
      title: '豆瓣电影',
      doubanId: '1292052',
      doubanTitle: '肖申克的救赎',
      doubanComment: '保留原始短评',
    }],
    tvShows: [{ id: 9_007_199_254_740_992n, title: '剧集' }],
    games: [{ id: 3n, title: '游戏' }],
  }, exportedAt);

  assert.deepEqual(snapshot.counts, { movies: 1, tvShows: 1, games: 1, total: 3 });
  assert.equal(snapshot.format, 'pixelreel-library-export');
  assert.equal(snapshot.version, 1);
  assert.equal(snapshot.exportedAt, exportedAt.toISOString());
  assert.equal(libraryExportFilename(exportedAt), 'pixelreel-library-2026-07-15T08-30-45Z.json');

  const parsed = JSON.parse(serializeLibraryExportSnapshot(snapshot));
  assert.equal(parsed.records.movies[0].id, 1);
  assert.equal(parsed.records.tvShows[0].id, '9007199254740992');
  assert.equal(parsed.records.movies[0].doubanId, '1292052');
  assert.equal(parsed.records.movies[0].doubanTitle, '肖申克的救赎');
  assert.equal(parsed.records.movies[0].doubanComment, '保留原始短评');
  assert.deepEqual(Object.keys(parsed), ['format', 'version', 'exportedAt', 'counts', 'records']);
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
  assert.deepEqual(buildGameStatusWhere(RecordStatus.WANT), {
    status: RecordStatus.WANT,
    OR: [{ playtimeMinutes: null }, { playtimeMinutes: { lte: 0 } }],
  });
  assert.deepEqual(buildGameStatusWhere(RecordStatus.IN_PROGRESS), {
    OR: [
      { status: RecordStatus.IN_PROGRESS },
      { status: RecordStatus.WANT, playtimeMinutes: { gt: 0 } },
    ],
  });
});

test('首页与年度分析统一按豆瓣优先判定媒体主来源', () => {
  const records = [
    { doubanId: '1', tmdbId: 1, imdbId: 'tt1', traktId: 1 },
    { doubanId: null, tmdbId: 2, imdbId: 'tt2', traktId: 2 },
    { doubanId: null, tmdbId: null, imdbId: 'tt3', traktId: 3 },
    { doubanId: null, tmdbId: null, imdbId: null, traktId: 4 },
    { doubanId: null, tmdbId: null, imdbId: null, traktId: null },
  ];
  assert.deepEqual(
    Object.fromEntries(buildMovieSourceCounts(records).map(item => [item.key, item.count])),
    { TMDB: 1, DOUBAN: 1, IMDB: 1, TRAKT: 1, MANUAL: 1 },
  );
  assert.deepEqual(
    Object.fromEntries(buildTvShowSourceCounts(records).map(item => [item.key, item.count])),
    { TMDB: 1, DOUBAN: 1, IMDB: 1, TRAKT: 1, MANUAL: 1 },
  );

  const createdAt = new Date('2026-07-15T00:00:00.000Z');
  const breakdown = buildSourceBreakdown(
    records.map(record => ({ ...record, createdAt })),
    [],
    [],
    new Date('2026-01-01T00:00:00.000Z'),
    new Date('2027-01-01T00:00:00.000Z'),
  );
  assert.deepEqual(
    Object.fromEntries(breakdown.movies.map(item => [item.source, item.count])),
    { DOUBAN: 1, TMDB: 1, IMDB: 1, TRAKT: 1, MANUAL: 1 },
  );
});

test('首页行动队列覆盖继续游玩、等待最久和高分未回顾记录', () => {
  const item = (id: number, status: string, createdAt: string, extra = {}) => ({
    id,
    title: `条目 ${id}`,
    posterUrl: null,
    status,
    rating: null,
    createdAt: new Date(createdAt),
    ...extra,
  });
  const queue = buildNextUpQueue(
    [
      item(1, RecordStatus.WANT, '2024-01-01T00:00:00.000Z', { rating: 5 }),
      item(2, RecordStatus.DONE, '2023-01-01T00:00:00.000Z', { rating: 5 }),
      item(3, RecordStatus.DONE, '2026-01-01T00:00:00.000Z', { rating: 4 }),
    ],
    [
      item(10, RecordStatus.WANT, '2025-01-01T00:00:00.000Z', { playtimeMinutes: 30 }),
      item(11, RecordStatus.IN_PROGRESS, '2026-01-01T00:00:00.000Z', { playtimeMinutes: 120 }),
      item(12, RecordStatus.WANT, '2022-01-01T00:00:00.000Z', { playtimeMinutes: 0 }),
    ],
    [
      item(20, RecordStatus.WANT, '2023-01-01T00:00:00.000Z'),
      item(21, RecordStatus.DONE, '2026-02-01T00:00:00.000Z', { rating: 5, shortReview: '已经写过' }),
      item(22, RecordStatus.DONE, '2025-01-01T00:00:00.000Z', { rating: 3 }),
    ],
  );

  assert.deepEqual(queue.resume.map(record => record.id), [11, 10]);
  assert.deepEqual(queue.backlog.map(record => record.id), [12, 20, 1]);
  assert.deepEqual(queue.reflect.map(record => record.id), [2, 3]);
  assert.equal(queue.resume[1].status, RecordStatus.IN_PROGRESS);
});

test('本月回声为每个往年选择本月评分最高的已完成记录', () => {
  const item = (
    id: number,
    status: string,
    doubanDate: string,
    rating: number | null,
  ) => ({
    id,
    title: `回忆 ${id}`,
    posterUrl: null,
    status,
    rating,
    createdAt: new Date(`${doubanDate}T00:00:00.000Z`),
    updatedAt: new Date(`${doubanDate}T12:00:00.000Z`),
    doubanDate,
  });
  const memories = buildMonthlyMemories(
    [
      item(1, RecordStatus.DONE, '2025-07-20', 4),
      item(2, RecordStatus.DONE, '2025-07-10', 5),
      item(3, RecordStatus.WANT, '2024-07-25', 5),
      item(4, RecordStatus.DONE, '2026-07-01', 5),
    ],
    [item(10, RecordStatus.DONE, '2023-07-08', 4)],
    [
      item(20, RecordStatus.DONE, '2024-07-12', 5),
      item(21, RecordStatus.DONE, '2022-06-30', 5),
    ],
    new Date('2026-07-15T00:00:00.000Z'),
  );

  assert.deepEqual(memories.map(record => record.id), [2, 20, 10]);
  assert.deepEqual(memories.map(record => record.yearsAgo), [1, 2, 3]);
  assert.deepEqual(memories.map(record => record.completedAt.slice(0, 10)), [
    '2025-07-10',
    '2024-07-12',
    '2023-07-08',
  ]);
});

test('跨平台评分只聚合本年入库记录并按相同分数组合', () => {
  const yearStart = new Date('2026-01-01T00:00:00.000Z');
  const yearEnd = new Date('2027-01-01T00:00:00.000Z');
  assert.deepEqual(buildCrossPlatformRatings([
    { doubanRating: 5, tmdbVoteAverage: 8.0, createdAt: new Date('2026-02-01T00:00:00.000Z') },
    { doubanRating: 5, tmdbVoteAverage: 8.0, createdAt: new Date('2026-03-01T00:00:00.000Z') },
    { doubanRating: 4, tmdbVoteAverage: 7.5, createdAt: new Date('2026-04-01T00:00:00.000Z') },
    { doubanRating: null, tmdbVoteAverage: 9.0, createdAt: new Date('2026-05-01T00:00:00.000Z') },
    { doubanRating: 1, tmdbVoteAverage: 2.0, createdAt: new Date('2025-12-31T23:59:59.000Z') },
  ], yearStart, yearEnd), [
    { doubanRating: 4, tmdbRating: 3.8, count: 1 },
    { doubanRating: 5, tmdbRating: 4, count: 2 },
  ]);
});

test('年度分析优先使用严格合法的豆瓣标记日期', () => {
  const updatedAt = new Date('2026-05-22T14:18:03.000Z');
  assert.equal(
    resolveCompletionDate({ doubanDate: '2024-11-09', updatedAt })?.toISOString(),
    '2024-11-09T00:00:00.000Z',
  );
  assert.equal(resolveCompletionDate({ doubanDate: null, updatedAt }), updatedAt);
  assert.equal(resolveCompletionDate({ doubanDate: '2024-02-31', updatedAt }), updatedAt);
  assert.equal(resolveCompletionDate({ doubanDate: 'not-a-date', updatedAt }), updatedAt);
});

test('年度分析只列出实际数据年份并保留当前选择', () => {
  assert.deepEqual(collectAvailableAnalyticsYears([
    {
      createdAt: new Date('2026-05-22T00:00:00.000Z'),
      updatedAt: new Date('2026-05-22T00:00:00.000Z'),
      doubanDate: '2019-03-08',
      status: RecordStatus.DONE,
    },
    {
      createdAt: new Date('2025-06-01T00:00:00.000Z'),
      updatedAt: new Date('2025-06-01T00:00:00.000Z'),
      status: RecordStatus.WANT,
    },
  ], 2027), [2027, 2026, 2025, 2019]);
});

test('Steam 搜索失败返回明确提示而不是伪装成空结果', async () => {
  const mutableConfig = config as unknown as { steam: { apiKey: string } };
  const originalApiKey = mutableConfig.steam.apiKey;
  const axiosClient = axios as unknown as { get: typeof axios.get };
  const originalGet = axiosClient.get;

  try {
    mutableConfig.steam.apiKey = 'test-key';
    axiosClient.get = async () => { throw new Error('Steam unavailable'); };
    const result = await new SteamGameSearchProvider().search('Portal', 1);
    assert.equal(result.enabled, true);
    assert.equal(result.message, '搜索失败: Steam unavailable');
    assert.deepEqual(result.results, []);
  } finally {
    axiosClient.get = originalGet;
    mutableConfig.steam.apiKey = originalApiKey;
  }
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

test('统一同步任务在取消后阻止继续调用外部服务或写库', () => {
  const controller = new AbortController();
  controller.abort();
  assert.throws(() => assertTaskActive(controller.signal), /任务已取消/);
  assert.doesNotThrow(() => assertTaskActive(new AbortController().signal));
});

test('同步任务将完整失败与空账号数据、部分成功明确区分', () => {
  assert.equal(getImportSummaryFailure({
    total: 0,
    imported: 0,
    updated: 0,
    skipped: 0,
    errors: ['  OpenXBL 请求失败  '],
  }), 'OpenXBL 请求失败');
  assert.equal(getImportSummaryFailure({
    total: 0,
    imported: 0,
    updated: 0,
    skipped: 0,
    errors: [],
  }), null);
  assert.equal(getImportSummaryFailure({
    total: 3,
    imported: 1,
    updated: 1,
    skipped: 0,
    errors: ['一个条目解析失败'],
  }), null);
});

test('外部平台标识可识别历史导入游戏', () => {
  assert.equal(isImportedGame({ steamAppId: 10n }), true);
  assert.equal(isImportedGame({ xboxId: 'xbox-id' }), true);
  assert.equal(isImportedGame({ importedAt: new Date() }), true);
  assert.equal(isImportedGame({}), false);
});
