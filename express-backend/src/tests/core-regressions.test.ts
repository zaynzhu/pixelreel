import assert from 'node:assert/strict';
import test from 'node:test';
import type { Request, Response } from 'express';
import { config } from '../config';
import { authMiddleware } from '../middlewares/auth';
import { getAuthStatus } from '../routes/auth';
import { formatEnvLine, serializeSettingValue, validateSettingValues } from '../routes/settings';
import { effectiveGameStatus, isImportedGame } from '../services/ProfileSummaryService';
import { resolveSteamImportStatus } from '../services/import/SteamOwnedGamesImportService';

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
