import { Router, Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import cron from 'node-cron';
import { validateAuthConfiguration } from '../config';
import { assertNoQueryParameters, RequestValidationError } from './request-validation';

const router = Router();

const ENV_PATH = path.resolve(__dirname, '../../.env');
const ENV_BACKUP_PATH = path.resolve(__dirname, '../../.env.backup.local');
const ENV_TEMP_PATH = path.resolve(__dirname, '../../.env.tmp.local');
const MAX_TIMER_MILLISECONDS = 2_147_483_647;
const MAX_TIMER_SECONDS = Math.floor(MAX_TIMER_MILLISECONDS / 1000);
const CRON_SETTING_KEYS = new Set(['RADAR_SYNC_CORE_CRON', 'RADAR_SYNC_SCRAPER_CRON']);

// ── 分类定义 ──
interface FieldDef {
  key: string;
  labelZh: string;
  labelEn: string;
  sensitive: boolean;
  type: 'text' | 'boolean' | 'password' | 'number';
  min?: number;
  max?: number;
  integer?: boolean;
}

interface CategoryDef {
  key: string;
  labelZh: string;
  labelEn: string;
  fields: FieldDef[];
}

const SENSITIVE_PATTERNS = [
  'SECRET', 'PASSWORD', 'API_KEY', 'COOKIE', 'ACCESS_TOKEN', 'CLIENT_SECRET',
];

const isSensitive = (key: string): boolean =>
  key === 'DATABASE_URL' || SENSITIVE_PATTERNS.some(p => key.includes(p));

const inferType = (key: string): 'text' | 'boolean' | 'password' | 'number' => {
  if (key.endsWith('_ENABLED') || key === 'AUTH_ENABLED') return 'boolean';
  if (key.includes('PASSWORD')) return 'password';
  return 'text';
};

const CATEGORIES: CategoryDef[] = [
  {
    key: 'general', labelZh: '通用', labelEn: 'General',
    fields: [
      { key: 'DATABASE_URL', labelZh: '数据库连接', labelEn: 'Database URL', sensitive: true, type: 'text' },
      { key: 'HOST', labelZh: '监听地址', labelEn: 'Listen Host', sensitive: false, type: 'text' },
      { key: 'PORT', labelZh: '端口', labelEn: 'Port', sensitive: false, type: 'number', min: 1, max: 65535, integer: true },
      { key: 'CORS_ALLOWED_ORIGINS', labelZh: '允许的前端来源', labelEn: 'Allowed Frontend Origins', sensitive: false, type: 'text' },
      { key: 'IMAGE_PROXY_MAX_BYTES', labelZh: '图片代理最大字节', labelEn: 'Image Proxy Max Bytes', sensitive: false, type: 'number', min: 1, integer: true },
      { key: 'IMAGE_PROXY_CACHE_SECONDS', labelZh: '图片代理缓存(秒)', labelEn: 'Image Proxy Cache (s)', sensitive: false, type: 'number', min: 0, max: MAX_TIMER_MILLISECONDS, integer: true },
    ],
  },
  {
    key: 'proxy', labelZh: '代理', labelEn: 'Proxy',
    fields: [
      { key: 'HTTP_PROXY', labelZh: 'HTTP 代理', labelEn: 'HTTP Proxy', sensitive: false, type: 'text' },
      { key: 'HTTPS_PROXY', labelZh: 'HTTPS 代理', labelEn: 'HTTPS Proxy', sensitive: false, type: 'text' },
    ],
  },
  {
    key: 'auth', labelZh: '认证', labelEn: 'Auth',
    fields: [
      { key: 'JWT_SECRET', labelZh: 'JWT 密钥', labelEn: 'JWT Secret', sensitive: true, type: 'text' },
      { key: 'JWT_USERNAME', labelZh: '用户名', labelEn: 'Username', sensitive: false, type: 'text' },
      { key: 'JWT_PASSWORD', labelZh: '密码', labelEn: 'Password', sensitive: true, type: 'password' },
      { key: 'AUTH_ENABLED', labelZh: '启用认证', labelEn: 'Auth Enabled', sensitive: false, type: 'boolean' },
    ],
  },
  {
    key: 'tmdb', labelZh: 'TMDB', labelEn: 'TMDB',
    fields: [
      { key: 'TMDB_API_KEY', labelZh: 'API 密钥', labelEn: 'API Key', sensitive: true, type: 'text' },
      { key: 'TMDB_BASE_URL', labelZh: 'API 地址', labelEn: 'API Base URL', sensitive: false, type: 'text' },
      { key: 'TMDB_IMAGE_BASE_URL', labelZh: '图片地址', labelEn: 'Image Base URL', sensitive: false, type: 'text' },
    ],
  },
  {
    key: 'omdb', labelZh: 'OMDb', labelEn: 'OMDb',
    fields: [
      { key: 'OMDB_API_KEY', labelZh: 'API 密钥', labelEn: 'API Key', sensitive: true, type: 'text' },
      { key: 'OMDB_BASE_URL', labelZh: 'API 地址', labelEn: 'API Base URL', sensitive: false, type: 'text' },
    ],
  },
  {
    key: 'trakt', labelZh: 'Trakt', labelEn: 'Trakt',
    fields: [
      { key: 'TRAKT_CLIENT_ID', labelZh: 'Client ID', labelEn: 'Client ID', sensitive: true, type: 'text' },
      { key: 'TRAKT_CLIENT_SECRET', labelZh: 'Client Secret', labelEn: 'Client Secret', sensitive: true, type: 'text' },
      { key: 'TRAKT_ACCESS_TOKEN', labelZh: 'Access Token', labelEn: 'Access Token', sensitive: true, type: 'text' },
      { key: 'TRAKT_BASE_URL', labelZh: 'API 地址', labelEn: 'API Base URL', sensitive: false, type: 'text' },
      { key: 'TRAKT_REDIRECT_URI', labelZh: '回调地址', labelEn: 'Redirect URI', sensitive: false, type: 'text' },
    ],
  },
  {
    key: 'douban', labelZh: '豆瓣', labelEn: 'Douban',
    fields: [
      { key: 'DOUBAN_BASE_URL', labelZh: '基础地址', labelEn: 'Base URL', sensitive: false, type: 'text' },
      { key: 'DOUBAN_COOKIE', labelZh: 'Cookie', labelEn: 'Cookie', sensitive: true, type: 'text' },
      { key: 'DOUBAN_USER_ID', labelZh: '用户 ID', labelEn: 'User ID', sensitive: false, type: 'text' },
      { key: 'DOUBAN_DATA_DIR', labelZh: '数据目录', labelEn: 'Data Directory', sensitive: false, type: 'text' },
      { key: 'DOUBAN_HARVEST_ENABLED', labelZh: '启用收割', labelEn: 'Harvest Enabled', sensitive: false, type: 'boolean' },
      { key: 'DOUBAN_HARVEST_HEADLESS', labelZh: '无头模式', labelEn: 'Headless Mode', sensitive: false, type: 'boolean' },
      { key: 'DOUBAN_HARVEST_MAX_PAGES_PER_RUN', labelZh: '单次最大页数', labelEn: 'Max Pages Per Run', sensitive: false, type: 'number', min: 1, max: 1000, integer: true },
      { key: 'DOUBAN_HARVEST_SLEEP_MIN', labelZh: '最小等待(秒)', labelEn: 'Min Sleep (s)', sensitive: false, type: 'number', min: 2, max: MAX_TIMER_SECONDS },
      { key: 'DOUBAN_HARVEST_SLEEP_MAX', labelZh: '最大等待(秒)', labelEn: 'Max Sleep (s)', sensitive: false, type: 'number', min: 2, max: MAX_TIMER_SECONDS },
      { key: 'DOUBAN_HARVEST_LONG_BREAK_EVERY', labelZh: '长休息间隔(页)', labelEn: 'Long Break Every (pages)', sensitive: false, type: 'number', min: 1, integer: true },
      { key: 'DOUBAN_HARVEST_LONG_BREAK_SECONDS', labelZh: '长休息时长(秒)', labelEn: 'Long Break (s)', sensitive: false, type: 'number', min: 2, max: MAX_TIMER_SECONDS },
      { key: 'DOUBAN_HARVEST_NAVIGATION_TIMEOUT_MS', labelZh: '导航超时(ms)', labelEn: 'Navigation Timeout (ms)', sensitive: false, type: 'number', min: 1, max: MAX_TIMER_MILLISECONDS, integer: true },
    ],
  },
  {
    key: 'radar', labelZh: '雷达', labelEn: 'Radar',
    fields: [
      { key: 'RADAR_ENABLED', labelZh: '启用雷达', labelEn: 'Radar Enabled', sensitive: false, type: 'boolean' },
      { key: 'RADAR_CRON_ENABLED', labelZh: '启用定时同步', labelEn: 'Cron Enabled', sensitive: false, type: 'boolean' },
      { key: 'RADAR_SYNC_ON_START', labelZh: '启动时同步', labelEn: 'Sync On Start', sensitive: false, type: 'boolean' },
      { key: 'RADAR_SCRAPERS_ENABLED', labelZh: '启用国内源', labelEn: 'Scrapers Enabled', sensitive: false, type: 'boolean' },
      { key: 'RADAR_IQIYI_ENABLED', labelZh: '启用爱奇艺', labelEn: 'iQIYI Enabled', sensitive: false, type: 'boolean' },
      { key: 'RADAR_PLAYWRIGHT_HEADLESS', labelZh: 'Playwright 无头模式', labelEn: 'Playwright Headless', sensitive: false, type: 'boolean' },
      { key: 'RADAR_SYNC_CORE_CRON', labelZh: '核心源同步 Cron', labelEn: 'Core Sync Cron', sensitive: false, type: 'text' },
      { key: 'RADAR_SYNC_SCRAPER_CRON', labelZh: '附加源同步 Cron', labelEn: 'Scraper Sync Cron', sensitive: false, type: 'text' },
      { key: 'RADAR_REQUEST_TIMEOUT_MS', labelZh: '请求超时(ms)', labelEn: 'Request Timeout (ms)', sensitive: false, type: 'number', min: 1, max: MAX_TIMER_MILLISECONDS, integer: true },
      { key: 'RADAR_WATCH_REGION', labelZh: '流媒体地区', labelEn: 'Watch Region', sensitive: false, type: 'text' },
    ],
  },
  {
    key: 'rawg', labelZh: 'RAWG', labelEn: 'RAWG',
    fields: [
      { key: 'RAWG_API_KEY', labelZh: 'API 密钥', labelEn: 'API Key', sensitive: true, type: 'text' },
      { key: 'RAWG_BASE_URL', labelZh: 'API 地址', labelEn: 'API Base URL', sensitive: false, type: 'text' },
    ],
  },
  {
    key: 'steam', labelZh: 'Steam', labelEn: 'Steam',
    fields: [
      { key: 'STEAM_WEB_API_KEY', labelZh: 'Web API 密钥', labelEn: 'Web API Key', sensitive: true, type: 'text' },
      { key: 'STEAM_DEFAULT_STEAM_ID', labelZh: '默认 Steam ID', labelEn: 'Default Steam ID', sensitive: false, type: 'text' },
      { key: 'STEAM_WEB_API_BASE_URL', labelZh: 'API 地址', labelEn: 'API Base URL', sensitive: false, type: 'text' },
    ],
  },
  {
    key: 'openxbl', labelZh: 'OpenXBL', labelEn: 'OpenXBL',
    fields: [
      { key: 'OPENXBL_API_KEY', labelZh: 'API 密钥', labelEn: 'API Key', sensitive: true, type: 'text' },
      { key: 'OPENXBL_BASE_URL', labelZh: 'API 地址', labelEn: 'API Base URL', sensitive: false, type: 'text' },
      { key: 'OPENXBL_ENABLED', labelZh: '启用 Xbox 同步', labelEn: 'Enable Xbox Sync', sensitive: false, type: 'boolean' },
    ],
  },
  {
    key: 'psn', labelZh: 'PSNProfiles', labelEn: 'PSNProfiles',
    fields: [
      { key: 'PSN_PROFILES_BASE_URL', labelZh: '站点地址', labelEn: 'Site URL', sensitive: false, type: 'text' },
      { key: 'PSN_PROFILES_USER_AGENT', labelZh: 'User-Agent', labelEn: 'User-Agent', sensitive: false, type: 'text' },
      { key: 'PSN_PROFILES_COOKIE', labelZh: 'Cookie', labelEn: 'Cookie', sensitive: true, type: 'text' },
      { key: 'PSN_PROFILES_ENABLED', labelZh: '启用 PSN 同步', labelEn: 'Enable PSN Sync', sensitive: false, type: 'boolean' },
    ],
  },
];

const FIELD_BY_KEY = new Map(CATEGORIES.flatMap(c => c.fields.map(f => [f.key, f] as const)));

export function serializeSettingValue(sensitive: boolean, value: string) {
  return {
    value: sensitive ? '' : value,
    configured: sensitive && Boolean(value),
  };
}

export function parseSettingsUpdateBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RequestValidationError('请求体必须是对象');
  }

  const body = value as Record<string, unknown>;
  const unknownKey = Object.keys(body).find(key => key !== 'values');
  if (unknownKey) throw new RequestValidationError(`未知字段: ${unknownKey}`);

  const values = body.values;
  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    throw new RequestValidationError('缺少 values 参数');
  }
  if (Object.keys(values).length === 0) {
    throw new RequestValidationError('values 不能为空');
  }
  return values as Record<string, unknown>;
}

export function validateSettingValues(values: Record<string, unknown>): string | null {
  for (const [key, value] of Object.entries(values)) {
    const field = FIELD_BY_KEY.get(key);
    if (!field) return `未知配置项: ${key}`;
    if (typeof value !== 'string') return `${key} 必须是字符串`;
    if (/\r|\n/.test(value)) return `${key} 不能包含换行`;
    if (/['"]/.test(value)) return `${key} 不能包含引号`;
    if (CRON_SETTING_KEYS.has(key) && value !== '' && !cron.validate(value)) {
      return `${key} 不是有效的 Cron 表达式`;
    }

    if (field.type === 'boolean' && value !== 'true' && value !== 'false') {
      return `${key} 必须是 true 或 false`;
    }

    if (field.type === 'number') {
      const numberValue = Number(value);
      if (value.trim() === '' || !Number.isFinite(numberValue) || numberValue < 0) {
        return `${key} 必须是非负数字`;
      }
      if (field.integer && !Number.isSafeInteger(numberValue)) {
        if (key === 'PORT') return 'PORT 必须是 1 到 65535 之间的整数';
        return `${key} 必须是安全整数`;
      }
      if (field.min !== undefined && field.max !== undefined
        && (numberValue < field.min || numberValue > field.max)) {
        if (key === 'PORT') return 'PORT 必须是 1 到 65535 之间的整数';
        return `${key} 必须在 ${field.min} 到 ${field.max} 之间`;
      }
      if (field.min !== undefined && numberValue < field.min) {
        return `${key} 必须大于等于 ${field.min}`;
      }
      if (field.max !== undefined && numberValue > field.max) {
        return `${key} 必须小于等于 ${field.max}`;
      }
    }
  }

  return null;
}

export function formatEnvLine(key: string, value: string): string {
  const formattedValue = /\s|#/.test(value) ? `"${value}"` : value;
  return `${key}=${formattedValue}`;
}

// ── 解析 .env 文件 ──
function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    // 去掉引号包裹
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

export function validateAuthSettingValues(
  currentValues: Record<string, string>,
  updates: Record<string, unknown>,
): string | null {
  const mergedValues = { ...currentValues, ...updates } as Record<string, string>;
  return validateAuthConfiguration({
    enabled: mergedValues.AUTH_ENABLED === 'true',
    secret: mergedValues.JWT_SECRET ?? '',
    username: mergedValues.JWT_USERNAME ?? '',
    password: mergedValues.JWT_PASSWORD ?? '',
  });
}

// ── GET /api/settings ──
router.get('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    assertNoQueryParameters(req.query);
    if (!fs.existsSync(ENV_PATH)) {
      next(new Error('.env 文件不存在'));
      return;
    }
    const content = fs.readFileSync(ENV_PATH, 'utf-8');
    const envValues = parseEnvFile(content);

    const categories = CATEGORIES.map(cat => ({
      key: cat.key,
      labelZh: cat.labelZh,
      labelEn: cat.labelEn,
      fields: cat.fields.map(f => ({
        key: f.key,
        labelZh: f.labelZh,
        labelEn: f.labelEn,
        ...serializeSettingValue(f.sensitive, envValues[f.key] ?? ''),
        sensitive: f.sensitive,
        type: f.type,
      })),
    }));

    res.json({ categories });
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/settings ──
router.put('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    assertNoQueryParameters(req.query);
    const values = parseSettingsUpdateBody(req.body);

    const validationError = validateSettingValues(values);
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }

    if (!fs.existsSync(ENV_PATH)) {
      next(new Error('.env 文件不存在'));
      return;
    }

    const content = fs.readFileSync(ENV_PATH, 'utf-8');
    const authValidationError = validateAuthSettingValues(parseEnvFile(content), values);
    if (authValidationError) {
      res.status(400).json({ error: authValidationError });
      return;
    }

    // 备份
    fs.copyFileSync(ENV_PATH, ENV_BACKUP_PATH);

    let updated = content;

    for (const [key, rawValue] of Object.entries(values)) {
      const value = rawValue as string;
      // 转义正则特殊字符
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`^${escapedKey}=.*$`, 'm');
      const newLine = formatEnvLine(key, value);

      if (regex.test(updated)) {
        updated = updated.replace(regex, newLine);
      } else {
        // key 不存在，追加到文件末尾
        updated = updated.trimEnd() + '\n' + newLine + '\n';
      }
    }

    // 同目录写入临时文件后原子替换，避免中途失败破坏现有配置
    fs.writeFileSync(ENV_TEMP_PATH, updated, 'utf-8');
    fs.renameSync(ENV_TEMP_PATH, ENV_PATH);

    res.json({ success: true, restartRequired: true });
  } catch (err) {
    next(err);
  }
});

export default router;
