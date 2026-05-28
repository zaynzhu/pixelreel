import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

const router = Router();

const ENV_PATH = path.resolve(__dirname, '../../.env');
const ENV_BACKUP_PATH = path.resolve(__dirname, '../../.env.backup.local');

// ── 分类定义 ──
interface FieldDef {
  key: string;
  labelZh: string;
  labelEn: string;
  sensitive: boolean;
  type: 'text' | 'boolean' | 'password' | 'number';
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
      { key: 'PORT', labelZh: '端口', labelEn: 'Port', sensitive: false, type: 'text' },
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
      { key: 'DOUBAN_HARVEST_MAX_PAGES_PER_RUN', labelZh: '单次最大页数', labelEn: 'Max Pages Per Run', sensitive: false, type: 'number' },
      { key: 'DOUBAN_HARVEST_SLEEP_MIN', labelZh: '最小等待(秒)', labelEn: 'Min Sleep (s)', sensitive: false, type: 'number' },
      { key: 'DOUBAN_HARVEST_SLEEP_MAX', labelZh: '最大等待(秒)', labelEn: 'Max Sleep (s)', sensitive: false, type: 'number' },
      { key: 'DOUBAN_HARVEST_LONG_BREAK_EVERY', labelZh: '长休息间隔(页)', labelEn: 'Long Break Every (pages)', sensitive: false, type: 'number' },
      { key: 'DOUBAN_HARVEST_LONG_BREAK_SECONDS', labelZh: '长休息时长(秒)', labelEn: 'Long Break (s)', sensitive: false, type: 'number' },
      { key: 'DOUBAN_HARVEST_NAVIGATION_TIMEOUT_MS', labelZh: '导航超时(ms)', labelEn: 'Navigation Timeout (ms)', sensitive: false, type: 'number' },
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
      { key: 'RADAR_REQUEST_TIMEOUT_MS', labelZh: '请求超时(ms)', labelEn: 'Request Timeout (ms)', sensitive: false, type: 'number' },
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
      { key: 'OPENXBL_ENABLED', labelZh: '启用', labelEn: 'Enabled', sensitive: false, type: 'boolean' },
    ],
  },
  {
    key: 'psn', labelZh: 'PSN', labelEn: 'PSN',
    fields: [
      { key: 'PSN_PROFILES_BASE_URL', labelZh: '基础地址', labelEn: 'Base URL', sensitive: false, type: 'text' },
      { key: 'PSN_PROFILES_USER_AGENT', labelZh: 'User Agent', labelEn: 'User Agent', sensitive: false, type: 'text' },
      { key: 'PSN_PROFILES_COOKIE', labelZh: 'Cookie', labelEn: 'Cookie', sensitive: true, type: 'text' },
      { key: 'PSN_PROFILES_ENABLED', labelZh: '启用', labelEn: 'Enabled', sensitive: false, type: 'boolean' },
    ],
  },
];

// 所有已知 key 的集合，用于验证 PUT 请求
const KNOWN_KEYS = new Set(CATEGORIES.flatMap(c => c.fields.map(f => f.key)));

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

// ── GET /api/settings ──
router.get('/', (_req: Request, res: Response) => {
  try {
    if (!fs.existsSync(ENV_PATH)) {
      res.status(500).json({ error: '.env 文件不存在' });
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
        value: envValues[f.key] ?? '',
        sensitive: f.sensitive,
        type: f.type,
      })),
    }));

    res.json({ categories });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /api/settings ──
router.put('/', (req: Request, res: Response) => {
  try {
    const { values } = req.body as { values: Record<string, string> };
    if (!values || typeof values !== 'object') {
      res.status(400).json({ error: '缺少 values 参数' });
      return;
    }

    // 验证：只接受已知 key
    const unknownKeys = Object.keys(values).filter(k => !KNOWN_KEYS.has(k));
    if (unknownKeys.length > 0) {
      res.status(400).json({ error: `未知配置项: ${unknownKeys.join(', ')}` });
      return;
    }

    if (!fs.existsSync(ENV_PATH)) {
      res.status(500).json({ error: '.env 文件不存在' });
      return;
    }

    // 备份
    fs.copyFileSync(ENV_PATH, ENV_BACKUP_PATH);

    const content = fs.readFileSync(ENV_PATH, 'utf-8');
    let updated = content;

    for (const [key, value] of Object.entries(values)) {
      // 转义正则特殊字符
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`^${escapedKey}=.*$`, 'm');
      const newLine = `${key}=${value.includes(' ') || value.includes('#') ? `"${value}"` : value}`;

      if (regex.test(updated)) {
        updated = updated.replace(regex, newLine);
      } else {
        // key 不存在，追加到文件末尾
        updated = updated.trimEnd() + '\n' + newLine + '\n';
      }
    }

    fs.writeFileSync(ENV_PATH, updated, 'utf-8');

    res.json({ success: true, restartRequired: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;