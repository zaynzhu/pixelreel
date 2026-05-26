import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

const router = Router();

const ENV_PATH = path.resolve(__dirname, '../../.env');
const ENV_BACKUP_PATH = path.resolve(__dirname, '../../.env.backup.local');

// ── 分类定义 ──
interface FieldDef {
  key: string;
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
      { key: 'DATABASE_URL', sensitive: true, type: 'text' },
      { key: 'PORT', sensitive: false, type: 'text' },
      { key: 'HTTPS_PROXY', sensitive: false, type: 'text' },
    ],
  },
  {
    key: 'auth', labelZh: '认证', labelEn: 'Auth',
    fields: [
      { key: 'JWT_SECRET', sensitive: true, type: 'text' },
      { key: 'JWT_USERNAME', sensitive: false, type: 'text' },
      { key: 'JWT_PASSWORD', sensitive: true, type: 'password' },
      { key: 'AUTH_ENABLED', sensitive: false, type: 'boolean' },
    ],
  },
  {
    key: 'tmdb', labelZh: 'TMDB', labelEn: 'TMDB',
    fields: [
      { key: 'TMDB_API_KEY', sensitive: true, type: 'text' },
      { key: 'TMDB_BASE_URL', sensitive: false, type: 'text' },
      { key: 'TMDB_IMAGE_BASE_URL', sensitive: false, type: 'text' },
    ],
  },
  {
    key: 'omdb', labelZh: 'OMDb', labelEn: 'OMDb',
    fields: [
      { key: 'OMDB_API_KEY', sensitive: true, type: 'text' },
      { key: 'OMDB_BASE_URL', sensitive: false, type: 'text' },
    ],
  },
  {
    key: 'trakt', labelZh: 'Trakt', labelEn: 'Trakt',
    fields: [
      { key: 'TRAKT_CLIENT_ID', sensitive: true, type: 'text' },
      { key: 'TRAKT_CLIENT_SECRET', sensitive: true, type: 'text' },
      { key: 'TRAKT_ACCESS_TOKEN', sensitive: true, type: 'text' },
      { key: 'TRAKT_BASE_URL', sensitive: false, type: 'text' },
      { key: 'TRAKT_REDIRECT_URI', sensitive: false, type: 'text' },
    ],
  },
  {
    key: 'douban', labelZh: '豆瓣', labelEn: 'Douban',
    fields: [
      { key: 'DOUBAN_BASE_URL', sensitive: false, type: 'text' },
      { key: 'DOUBAN_COOKIE', sensitive: true, type: 'text' },
      { key: 'DOUBAN_USER_ID', sensitive: false, type: 'text' },
      { key: 'DOUBAN_DATA_DIR', sensitive: false, type: 'text' },
      { key: 'DOUBAN_HARVEST_ENABLED', sensitive: false, type: 'boolean' },
      { key: 'DOUBAN_HARVEST_HEADLESS', sensitive: false, type: 'boolean' },
      { key: 'DOUBAN_HARVEST_MAX_PAGES_PER_RUN', sensitive: false, type: 'number' },
      { key: 'DOUBAN_HARVEST_SLEEP_MIN', sensitive: false, type: 'number' },
      { key: 'DOUBAN_HARVEST_SLEEP_MAX', sensitive: false, type: 'number' },
      { key: 'DOUBAN_HARVEST_LONG_BREAK_EVERY', sensitive: false, type: 'number' },
      { key: 'DOUBAN_HARVEST_LONG_BREAK_SECONDS', sensitive: false, type: 'number' },
      { key: 'DOUBAN_HARVEST_NAVIGATION_TIMEOUT_MS', sensitive: false, type: 'number' },
    ],
  },
  {
    key: 'radar', labelZh: '雷达', labelEn: 'Radar',
    fields: [
      { key: 'RADAR_ENABLED', sensitive: false, type: 'boolean' },
      { key: 'RADAR_CRON_ENABLED', sensitive: false, type: 'boolean' },
      { key: 'RADAR_SYNC_ON_START', sensitive: false, type: 'boolean' },
      { key: 'RADAR_SCRAPERS_ENABLED', sensitive: false, type: 'boolean' },
      { key: 'RADAR_IQIYI_ENABLED', sensitive: false, type: 'boolean' },
      { key: 'RADAR_PLAYWRIGHT_HEADLESS', sensitive: false, type: 'boolean' },
      { key: 'RADAR_SYNC_CORE_CRON', sensitive: false, type: 'text' },
      { key: 'RADAR_SYNC_SCRAPER_CRON', sensitive: false, type: 'text' },
      { key: 'RADAR_REQUEST_TIMEOUT_MS', sensitive: false, type: 'number' },
    ],
  },
  {
    key: 'rawg', labelZh: 'RAWG', labelEn: 'RAWG',
    fields: [
      { key: 'RAWG_API_KEY', sensitive: true, type: 'text' },
      { key: 'RAWG_BASE_URL', sensitive: false, type: 'text' },
    ],
  },
  {
    key: 'steam', labelZh: 'Steam', labelEn: 'Steam',
    fields: [
      { key: 'STEAM_WEB_API_KEY', sensitive: true, type: 'text' },
      { key: 'STEAM_DEFAULT_STEAM_ID', sensitive: false, type: 'text' },
      { key: 'STEAM_WEB_API_BASE_URL', sensitive: false, type: 'text' },
    ],
  },
  {
    key: 'openxbl', labelZh: 'OpenXBL', labelEn: 'OpenXBL',
    fields: [
      { key: 'OPENXBL_API_KEY', sensitive: true, type: 'text' },
      { key: 'OPENXBL_BASE_URL', sensitive: false, type: 'text' },
      { key: 'OPENXBL_ENABLED', sensitive: false, type: 'boolean' },
    ],
  },
  {
    key: 'psn', labelZh: 'PSN', labelEn: 'PSN',
    fields: [
      { key: 'PSN_PROFILES_BASE_URL', sensitive: false, type: 'text' },
      { key: 'PSN_PROFILES_USER_AGENT', sensitive: false, type: 'text' },
      { key: 'PSN_PROFILES_COOKIE', sensitive: true, type: 'text' },
      { key: 'PSN_PROFILES_ENABLED', sensitive: false, type: 'boolean' },
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