import { config } from '../../config';

export const USER_ID = config.douban.userId;

export const HARVEST_ENABLED = config.douban.harvestEnabled;
export const HARVEST_HEADLESS = config.douban.headless;
export const SLEEP_MIN = config.douban.sleepMin;
export const SLEEP_MAX = config.douban.sleepMax;
export const LONG_BREAK_EVERY = config.douban.longBreakEvery;
export const LONG_BREAK_SECONDS = config.douban.longBreakSeconds;
export const MAX_PAGES_PER_RUN = config.douban.maxPagesPerRun;
export const NAVIGATION_TIMEOUT_MS = config.douban.navigationTimeoutMs;

export const PIXELREEL_BASE_URL = `http://localhost:${config.port}`;
export const PIXELREEL_TOKEN = '';
export const AUTO_PUSH = true;