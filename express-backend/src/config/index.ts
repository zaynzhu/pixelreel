import dotenv from 'dotenv';
import path from 'path';
dotenv.config();

const parseBoolean = (value: string | undefined, defaultValue: boolean): boolean => {
  if (value == null || value === '') return defaultValue;
  return value === 'true';
};

const parseNumber = (value: string | undefined, defaultValue: number): number => {
  if (value == null || value === '') return defaultValue;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
};

interface AuthConfiguration {
  enabled: boolean;
  secret: string;
  username: string;
  password: string;
}

const INSECURE_JWT_SECRETS = new Set(['dev-secret', 'your-jwt-secret-here']);
const INSECURE_JWT_PASSWORDS = new Set(['123456']);

export function validateAuthConfiguration(auth: AuthConfiguration): string | null {
  if (!auth.enabled) return null;
  if (auth.secret.trim().length < 32 || INSECURE_JWT_SECRETS.has(auth.secret)) {
    return '启用认证前必须设置至少 32 个字符的 JWT_SECRET，且不能使用示例值';
  }
  if (!auth.username.trim()) return '启用认证前必须设置 JWT_USERNAME';
  if (auth.password.trim().length < 8 || INSECURE_JWT_PASSWORDS.has(auth.password)) {
    return '启用认证前必须设置至少 8 个字符的 JWT_PASSWORD，且不能使用默认密码';
  }
  return null;
}

// 环境变量配置
export const config = {
  port: parseInt(process.env.PORT || '18889', 10),
  host: process.env.HOST || '127.0.0.1',

  cors: {
    allowedOrigins: (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:18888,http://127.0.0.1:18888')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  },

  database: {
    url: process.env.DATABASE_URL || 'mysql://root:password@localhost:3306/pixelreel',
  },

  jwt: {
    secret: process.env.JWT_SECRET || '',
    username: process.env.JWT_USERNAME || 'zaynzhu',
    password: process.env.JWT_PASSWORD || '',
  },

  // 是否启用 JWT 鉴权（默认关闭）
  authEnabled: process.env.AUTH_ENABLED === 'true',

  tmdb: {
    apiKey: process.env.TMDB_API_KEY || '',
    baseUrl: process.env.TMDB_BASE_URL || 'https://api.themoviedb.org/3',
    imageBaseUrl: process.env.TMDB_IMAGE_BASE_URL || 'https://image.tmdb.org/t/p/w500',
  },

  omdb: {
    apiKey: process.env.OMDB_API_KEY || '',
    baseUrl: process.env.OMDB_BASE_URL || 'https://www.omdbapi.com',
  },

  trakt: {
    clientId: process.env.TRAKT_CLIENT_ID || '',
    clientSecret: process.env.TRAKT_CLIENT_SECRET || '',
    accessToken: process.env.TRAKT_ACCESS_TOKEN || '',
    baseUrl: process.env.TRAKT_BASE_URL || 'https://api.trakt.tv',
    redirectUri: process.env.TRAKT_REDIRECT_URI || 'http://localhost:18889/api/trakt/callback',
  },

  douban: {
    baseUrl: process.env.DOUBAN_BASE_URL || 'https://movie.douban.com',
    cookie: process.env.DOUBAN_COOKIE || '',
    userId: process.env.DOUBAN_USER_ID || '',
    dataDir: process.env.DOUBAN_DATA_DIR || path.resolve(__dirname, '../../data/douban-harvester'),
    harvestEnabled: parseBoolean(process.env.DOUBAN_HARVEST_ENABLED, true),
    headless: parseBoolean(process.env.DOUBAN_HARVEST_HEADLESS, true),
    maxPagesPerRun: parseNumber(process.env.DOUBAN_HARVEST_MAX_PAGES_PER_RUN, 200),
    sleepMin: parseNumber(process.env.DOUBAN_HARVEST_SLEEP_MIN, 3),
    sleepMax: parseNumber(process.env.DOUBAN_HARVEST_SLEEP_MAX, 7),
    longBreakEvery: parseNumber(process.env.DOUBAN_HARVEST_LONG_BREAK_EVERY, 40),
    longBreakSeconds: parseNumber(process.env.DOUBAN_HARVEST_LONG_BREAK_SECONDS, 180),
    navigationTimeoutMs: parseNumber(process.env.DOUBAN_HARVEST_NAVIGATION_TIMEOUT_MS, 30000),
  },

  radar: {
    enabled: parseBoolean(process.env.RADAR_ENABLED, false),
    cronEnabled: parseBoolean(process.env.RADAR_CRON_ENABLED, true),
    syncOnStart: parseBoolean(process.env.RADAR_SYNC_ON_START, true),
    scrapersEnabled: parseBoolean(process.env.RADAR_SCRAPERS_ENABLED, true),
    iqiyiEnabled: parseBoolean(process.env.RADAR_IQIYI_ENABLED, false),
    playwrightHeadless: parseBoolean(process.env.RADAR_PLAYWRIGHT_HEADLESS, true),
    syncCoreCron: process.env.RADAR_SYNC_CORE_CRON || '0 * * * *',
    syncScraperCron: process.env.RADAR_SYNC_SCRAPER_CRON || '0 */6 * * *',
    requestTimeoutMs: parseNumber(process.env.RADAR_REQUEST_TIMEOUT_MS, 15000),
    watchRegion: process.env.RADAR_WATCH_REGION || 'TW',
  },

  rawg: {
    apiKey: process.env.RAWG_API_KEY || '',
    baseUrl: process.env.RAWG_BASE_URL || 'https://api.rawg.io/api',
  },

  steam: {
    apiKey: process.env.STEAM_WEB_API_KEY || '',
    defaultSteamId: process.env.STEAM_DEFAULT_STEAM_ID || '',
    baseUrl: process.env.STEAM_WEB_API_BASE_URL || 'https://api.steampowered.com',
  },

  openxbl: {
    apiKey: process.env.OPENXBL_API_KEY || '',
    baseUrl: process.env.OPENXBL_BASE_URL || 'https://api.xbl.io/v2',
    enabled: process.env.OPENXBL_ENABLED === 'true',
  },

  psnProfiles: {
    baseUrl: process.env.PSN_PROFILES_BASE_URL || 'https://psnprofiles.com',
    userAgent:
      process.env.PSN_PROFILES_USER_AGENT ||
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    cookie: process.env.PSN_PROFILES_COOKIE || '',
    enabled: process.env.PSN_PROFILES_ENABLED === 'true',
  },

  imageProxy: {
    maxBytes: parseInt(process.env.IMAGE_PROXY_MAX_BYTES || String(5 * 1024 * 1024), 10),
    cacheSeconds: parseInt(process.env.IMAGE_PROXY_CACHE_SECONDS || String(60 * 60 * 24 * 7), 10),
  },
} as const;
