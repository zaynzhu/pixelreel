import dotenv from 'dotenv';
dotenv.config();

// 环境变量配置，与 Java 端各 Properties 类对齐
export const config = {
  port: parseInt(process.env.PORT || '18889', 10),

  database: {
    url: process.env.DATABASE_URL || 'mysql://root:password@localhost:3306/pixelreel',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret',
    username: process.env.JWT_USERNAME || 'zaynzhu',
    password: process.env.JWT_PASSWORD || '123456',
  },

  // 是否启用 JWT 鉴权（默认关闭，与 Java 端当前行为保持一致）
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
    baseUrl: process.env.OPENXBL_BASE_URL || 'https://xbl.io/api/v2',
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
} as const;