import { config } from '../../config';

export const USER_ID = config.douban.userId;

export const SLEEP_MIN = 3.0;
export const SLEEP_MAX = 7.0;
export const LONG_BREAK_EVERY = 40;
export const LONG_BREAK_SECONDS = 180;
export const MAX_PAGES_PER_RUN = 200;

export const PIXELREEL_BASE_URL = `http://localhost:${config.port}`;
export const PIXELREEL_TOKEN = '';
export const AUTO_PUSH = true;
