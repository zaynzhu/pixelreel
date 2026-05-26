# Douban Harvester 集成实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 douban-harvester 集成到 PixelReel Express 后端，实现 JSON 数据导入、TMDB 丰富、增量爬取写库。

**Architecture:** harvester 核心代码搬到 `express-backend/src/services/douban-harvester/`，新增 `import-service.ts` 负责读 JSON → 查重 → TMDB 丰富 → Prisma 写库。新增 API 路由 `POST /api/import/douban-harvest` 和 `GET /api/import/douban-harvest/status`，异步执行+状态轮询。

**Tech Stack:** Express 5, TypeScript, Prisma 6, Playwright, TMDB API

---

## 文件结构

### 新建文件
- `express-backend/src/services/douban-harvester/types.ts` — 从 harvester 搬入，保持不变
- `express-backend/src/services/douban-harvester/parser.ts` — 从 harvester 搬入，保持不变
- `express-backend/src/services/douban-harvester/scraper.ts` — 从 harvester 搬入，适配 import 路径
- `express-backend/src/services/douban-harvester/storage.ts` — 从 harvester 搬入，适配 dataDir
- `express-backend/src/services/douban-harvester/verify.ts` — 从 harvester 搬入，适配 import 路径
- `express-backend/src/services/douban-harvester/tmdb-enrich.ts` — 新文件：TMDB 丰富服务
- `express-backend/src/services/douban-harvester/import-service.ts` — 新文件：核心导入逻辑
- `express-backend/src/services/douban-harvester/task-manager.ts` — 新文件：异步任务管理

### 修改文件
- `express-backend/src/config/index.ts` — 扩展 douban 配置
- `express-backend/src/routes/import.ts` — 新增 douban-harvest 路由
- `express-backend/package.json` — 新增 playwright 依赖

---

## Task 1: 安装 playwright 依赖

**Files:**
- Modify: `express-backend/package.json`

- [ ] **Step 1: 安装 playwright**

```bash
cd express-backend && npm install playwright
```

- [ ] **Step 2: 安装 chromium 浏览器**

```bash
cd express-backend && npx playwright install chromium
```

- [ ] **Step 3: 验证安装**

```bash
cd express-backend && node -e "const { chromium } = require('playwright'); console.log('playwright OK')"
```

Expected: 输出 `playwright OK`

- [ ] **Step 4: Commit**

```bash
git add express-backend/package.json express-backend/package-lock.json
git commit -m "feat: add playwright dependency for douban-harvester"
```

---

## Task 2: 搬入 harvester 核心文件（types, parser, scraper, storage, verify）

把 douban-harvester 的核心代码搬进 express-backend，适配模块系统（ESM → CommonJS）和路径。

**Files:**
- Create: `express-backend/src/services/douban-harvester/types.ts`
- Create: `express-backend/src/services/douban-harvester/parser.ts`
- Create: `express-backend/src/services/douban-harvester/scraper.ts`
- Create: `express-backend/src/services/douban-harvester/storage.ts`
- Create: `express-backend/src/services/douban-harvester/verify.ts`

- [ ] **Step 1: 创建目录并复制文件**

```bash
mkdir -p express-backend/src/services/douban-harvester
```

- [ ] **Step 2: 写入 types.ts**

直接复制 `douban-harvester/src/types.ts`，无需改动（纯类型定义，无 import）。

```typescript
// 评分记录
export interface CollectItem {
  title: string;       // 中文片名（<em>内容）
  altTitle: string;    // 外文名（/后面的部分）
  intro: string;       // 年份/导演/类型等（.intro）
  rating: string;      // 1~5
  date: string;        // 标记日期
  comment: string;     // 短评（可为空）
  link: string;        // 豆瓣条目链接
}

// 影评记录
export interface ReviewItem {
  movie: string;
  title: string;
  rating: string;
  date: string;
  abstract: string;
  link: string;
}

// 断点进度
export interface Progress {
  collectStart: number;
  collectDone: boolean;
  reviewsPage: number;
  reviewsDone: boolean;
}

// 增量同步状态
export interface SyncState {
  lastSyncDate: string | null;
}

// 增量输出
export interface IncrementalData {
  collect: CollectItem[];
  reviews: ReviewItem[];
}
```

- [ ] **Step 3: 写入 parser.ts**

复制 `douban-harvester/src/parser.ts`，将 ESM import `.js` 后缀去掉（CommonJS 不需要）：

把 `import type { CollectItem, ReviewItem } from "./types.js";` 改为 `import type { CollectItem, ReviewItem } from "./types";`
把 `import type { Page } from "playwright";` 保持不变。

其余内容完全不变。

- [ ] **Step 4: 写入 scraper.ts**

复制 `douban-harvester/src/scraper.ts`，做以下适配：

1. ESM import 去掉 `.js` 后缀：
   - `import { ... } from "./config.js"` → `import { ... } from "./config"`
   - 但 config 不再是独立文件，而是从 `../../config` 导入，所以改为：
     `import { USER_ID, SLEEP_MIN, SLEEP_MAX, LONG_BREAK_EVERY, LONG_BREAK_SECONDS, MAX_PAGES_PER_RUN } from "../../config";`
   - 等等 — 这里需要重新考虑。config 里的值在原 harvester 里是直接导出的常量，但在 express-backend 里是 `config.douban.xxx` 的结构。
   
   **决策：** 保留 harvester 目录下的独立 `config.ts`，但让它从 express-backend 的总 config 中取值。

2. 创建 `express-backend/src/services/douban-harvester/config.ts`：

```typescript
import { config } from '../../config';

export const USER_ID = config.douban.userId;

export const SLEEP_MIN = 3.0;
export const SLEEP_MAX = 7.0;
export const LONG_BREAK_EVERY = 40;
export const LONG_BREAK_SECONDS = 180;
export const MAX_PAGES_PER_RUN = 200;

export const PIXELREEL_BASE_URL = `http://localhost:${config.port}`;
export const PIXELREEL_TOKEN = '';
export const AUTO_PUSH = true; // 集成后总是推送（写库）
```

这样 scraper.ts 只需要改 import 路径（去掉 `.js`），config.ts 作为桥接层。

3. scraper.ts 的 import 改为：
```typescript
import { USER_ID, SLEEP_MIN, SLEEP_MAX, LONG_BREAK_EVERY, LONG_BREAK_SECONDS, MAX_PAGES_PER_RUN } from "./config";
import { loadData, saveData, saveProgress, dedupByLink } from "./storage";
import { parseCollectPage, parseReviewsPage } from "./parser";
import type { CollectItem, ReviewItem, Progress } from "./types";
```

4. `makeBrowser` 不再导出 `PIXELREEL_BASE_URL` 等常量（已在 config 中）。

5. `pixelreel.ts` 和 `main.ts` 不搬入——由 import-service.ts 替代。

- [ ] **Step 5: 写入 storage.ts**

复制 `douban-harvester/src/storage.ts`，做以下适配：

1. import 路径去掉 `.js`
2. 文件路径改为从 config 读取 dataDir：

```typescript
import path from 'path';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import type { Progress, SyncState } from './types';
import { config } from '../../config';

const DATA_DIR = config.douban.dataDir;
const PROGRESS_FILE = path.join(DATA_DIR, 'progress.json');
const SYNC_STATE_FILE = path.join(DATA_DIR, 'sync_state.json');

export function loadProgress(): Progress {
  if (existsSync(PROGRESS_FILE)) {
    return JSON.parse(readFileSync(PROGRESS_FILE, 'utf-8'));
  }
  return {
    collectStart: 0,
    collectDone: false,
    reviewsPage: 1,
    reviewsDone: false,
  };
}

export function saveProgress(progress: Progress): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2), 'utf-8');
}

export function loadData<T>(filename: string): T[] {
  const fullPath = path.isAbsolute(filename) ? filename : path.join(DATA_DIR, filename);
  if (existsSync(fullPath)) {
    return JSON.parse(readFileSync(fullPath, 'utf-8'));
  }
  return [];
}

export function saveData(filename: string, data: unknown): void {
  const fullPath = path.isAbsolute(filename) ? filename : path.join(DATA_DIR, filename);
  mkdirSync(path.dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, JSON.stringify(data, null, 2), 'utf-8');
}

export function loadSyncState(): SyncState {
  if (existsSync(SYNC_STATE_FILE)) {
    return JSON.parse(readFileSync(SYNC_STATE_FILE, 'utf-8'));
  }
  return { lastSyncDate: null };
}

export function saveSyncState(dateStr: string): void {
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(SYNC_STATE_FILE, JSON.stringify({ lastSyncDate: dateStr }, null, 2), 'utf-8');
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function dedupByLink<T extends { link: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter(item => {
    if (seen.has(item.link)) return false;
    seen.add(item.link);
    return true;
  });
}

export function ensureOutputDir(): void {
  mkdirSync(path.join(DATA_DIR, '..', 'output'), { recursive: true });
  mkdirSync(DATA_DIR, { recursive: true });
}
```

- [ ] **Step 6: 写入 verify.ts**

复制 `douban-harvester/src/verify.ts`，适配 import 路径（去掉 `.js`）。

- [ ] **Step 7: Commit**

```bash
git add express-backend/src/services/douban-harvester/
git commit -m "feat: copy douban-harvester core files into express-backend"
```

---

## Task 3: 扩展 config 配置

**Files:**
- Modify: `express-backend/src/config/index.ts`

- [ ] **Step 1: 在 douban 字段中添加 userId 和 dataDir**

在 `config/index.ts` 的 `douban` 对象中新增两个字段：

```typescript
douban: {
  baseUrl: process.env.DOUBAN_BASE_URL || 'https://movie.douban.com',
  cookie: process.env.DOUBAN_COOKIE || '',
  userId: process.env.DOUBAN_USER_ID || '',
  dataDir: process.env.DOUBAN_DATA_DIR || path.resolve(__dirname, '../../data/douban-harvester'),
},
```

注意需要在文件顶部添加 `import path from 'path';`（如果还没有的话）。

- [ ] **Step 2: 验证 TypeScript 编译通过**

```bash
cd express-backend && npx tsc --noEmit
```

Expected: 无报错

- [ ] **Step 3: Commit**

```bash
git add express-backend/src/config/index.ts
git commit -m "feat: add douban userId and dataDir to config"
```

---

## Task 4: 创建 TMDB 丰富服务 (tmdb-enrich.ts)

这是核心新增文件，负责用片名搜索 TMDB，判断 movie/tv 类型，返回丰富后的数据。

**Files:**
- Create: `express-backend/src/services/douban-harvester/tmdb-enrich.ts`

- [ ] **Step 1: 写入 tmdb-enrich.ts**

```typescript
import axios from 'axios';
import { config } from '../../config';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// TMDB 搜索结果
export interface TmdbEnrichResult {
  type: 'movie' | 'tv' | 'unknown';
  tmdbId: number | null;
  posterUrl: string | null;
  releaseDate: string | null;   // 电影: release_date, 电视剧: first_air_date
  overview: string | null;
  title: string | null;          // TMDB 返回的原始标题
}

// 标题相似度计算（简单的包含 + 长度比较）
function titleSimilarity(a: string, b: string): number {
  const na = a.toLowerCase().trim();
  const nb = b.toLowerCase().trim();
  if (na === nb) return 1.0;
  if (na.includes(nb) || nb.includes(na)) return 0.7;
  // 编辑距离太重，用前缀匹配
  const minLen = Math.min(na.length, nb.length);
  let match = 0;
  for (let i = 0; i < minLen; i++) {
    if (na[i] === nb[i]) match++;
  }
  return match / Math.max(na.length, nb.length);
}

interface TmdbSearchHit {
  tmdbId: number;
  title: string;
  posterUrl: string | null;
  releaseDate: string | null;
  overview: string | null;
  popularity: number;
  similarity: number;
}

async function searchTmdb(
  query: string,
  type: 'movie' | 'tv',
  retryCount = 0,
): Promise<TmdbSearchHit[]> {
  const endpoint = type === 'movie' ? '/search/movie' : '/search/tv';
  const titleField = type === 'movie' ? 'title' : 'name';

  try {
    const response = await axios.get(`${config.tmdb.baseUrl}${endpoint}`, {
      params: { api_key: config.tmdb.apiKey, query, page: 1 },
      timeout: 10000,
    });

    const items = response.data?.results ?? [];
    return items.map((item: any) => ({
      tmdbId: item.id,
      title: item[titleField] ?? '',
      posterUrl: item.poster_path ? config.tmdb.imageBaseUrl + item.poster_path : null,
      releaseDate: type === 'movie'
        ? (item.release_date ?? null)
        : (item.first_air_date ?? null),
      overview: item.overview ?? null,
      popularity: item.popularity ?? 0,
      similarity: titleSimilarity(query, item[titleField] ?? ''),
    }));
  } catch (err: any) {
    if (err.response?.status === 429 && retryCount < 2) {
      const retryAfter = err.response.headers['retry-after'];
      const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : 3000;
      await delay(waitTime);
      return searchTmdb(query, type, retryCount + 1);
    }
    return [];
  }
}

/**
 * 用片名搜索 TMDB，返回最佳匹配及类型判断。
 * 同时搜索 movie 和 tv，选相似度 + popularity 最高的。
 * 间隔 250ms 防限速。
 */
export async function enrichFromTmdb(title: string): Promise<TmdbEnrichResult> {
  if (!config.tmdb.apiKey) {
    return { type: 'unknown', tmdbId: null, posterUrl: null, releaseDate: null, overview: null, title: null };
  }

  const [movieHits, tvHits] = await Promise.all([
    searchTmdb(title, 'movie'),
    searchTmdb(title, 'tv'),
  ]);

  await delay(250);

  // 过滤低相似度结果（阈值 0.4）
  const goodMovies = movieHits.filter(h => h.similarity >= 0.4);
  const goodTvs = tvHits.filter(h => h.similarity >= 0.4);

  // 各取最佳
  const bestMovie = goodMovies.length > 0
    ? goodMovies.reduce((a, b) => (a.similarity * 10 + a.popularity) > (b.similarity * 10 + b.popularity) ? a : b)
    : null;
  const bestTv = goodTvs.length > 0
    ? goodTvs.reduce((a, b) => (a.similarity * 10 + a.popularity) > (b.similarity * 10 + b.popularity) ? a : b)
    : null;

  // 比较 movie 和 tv 的最佳匹配
  const movieScore = bestMovie ? bestMovie.similarity * 10 + bestMovie.popularity / 100 : 0;
  const tvScore = bestTv ? bestTv.similarity * 10 + bestTv.popularity / 100 : 0;

  if (movieScore === 0 && tvScore === 0) {
    return { type: 'unknown', tmdbId: null, posterUrl: null, releaseDate: null, overview: null, title: null };
  }

  if (movieScore >= tvScore && bestMovie) {
    return {
      type: 'movie',
      tmdbId: bestMovie.tmdbId,
      posterUrl: bestMovie.posterUrl,
      releaseDate: bestMovie.releaseDate,
      overview: bestMovie.overview,
      title: bestMovie.title,
    };
  }

  if (bestTv) {
    return {
      type: 'tv',
      tmdbId: bestTv.tmdbId,
      posterUrl: bestTv.posterUrl,
      releaseDate: bestTv.releaseDate,
      overview: bestTv.overview,
      title: bestTv.title,
    };
  }

  return { type: 'unknown', tmdbId: null, posterUrl: null, releaseDate: null, overview: null, title: null };
}

/**
 * 批量丰富，带进度回调。
 * 每条间隔 250ms 防限速。
 */
export async function enrichBatch(
  titles: string[],
  onProgress?: (index: number, total: number, title: string) => void,
): Promise<Map<string, TmdbEnrichResult>> {
  const results = new Map<string, TmdbEnrichResult>();
  for (let i = 0; i < titles.length; i++) {
    const title = titles[i];
    if (onProgress) onProgress(i, titles.length, title);
    const result = await enrichFromTmdb(title);
    results.set(title, result);
    await delay(250);
  }
  return results;
}
```

- [ ] **Step 2: Commit**

```bash
git add express-backend/src/services/douban-harvester/tmdb-enrich.ts
git commit -m "feat: add TMDB enrichment service for douban-harvester"
```

---

## Task 5: 创建异步任务管理器 (task-manager.ts)

管理长时间运行的导入/爬取任务，支持状态查询。

**Files:**
- Create: `express-backend/src/services/douban-harvester/task-manager.ts`

- [ ] **Step 1: 写入 task-manager.ts**

```typescript
import { ImportSummary } from '../../dto/import-summary';

export type TaskMode = 'json' | 'full' | 'incremental';
export type TaskStatus = 'running' | 'completed' | 'failed';

export interface TaskProgress {
  processed: number;
  total: number;
  currentTitle: string;
}

export interface HarvestTask {
  taskId: string;
  mode: TaskMode;
  status: TaskStatus;
  progress: TaskProgress;
  result: ImportSummary | null;
  error: string | null;
  startedAt: string;
}

// 内存任务存储（单实例足够）
const tasks = new Map<string, HarvestTask>();

let taskCounter = 0;

export function createTask(mode: TaskMode): HarvestTask {
  taskCounter++;
  const taskId = `douban-harvest-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${taskCounter}`;
  const task: HarvestTask = {
    taskId,
    mode,
    status: 'running',
    progress: { processed: 0, total: 0, currentTitle: '' },
    result: null,
    error: null,
    startedAt: new Date().toISOString(),
  };
  tasks.set(taskId, task);
  return task;
}

export function getTask(taskId: string): HarvestTask | undefined {
  return tasks.get(taskId);
}

export function updateProgress(taskId: string, progress: Partial<TaskProgress>): void {
  const task = tasks.get(taskId);
  if (task) {
    task.progress = { ...task.progress, ...progress };
  }
}

export function completeTask(taskId: string, result: ImportSummary): void {
  const task = tasks.get(taskId);
  if (task) {
    task.status = 'completed';
    task.result = result;
    task.progress.currentTitle = '';
  }
}

export function failTask(taskId: string, error: string): void {
  const task = tasks.get(taskId);
  if (task) {
    task.status = 'failed';
    task.error = error;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add express-backend/src/services/douban-harvester/task-manager.ts
git commit -m "feat: add async task manager for douban-harvester"
```

---

## Task 6: 创建核心导入服务 (import-service.ts)

最核心的文件：读 JSON → 提取 doubanId → 查重 → TMDB 丰富 → 写库。

**Files:**
- Create: `express-backend/src/services/douban-harvester/import-service.ts`

- [ ] **Step 1: 写入 import-service.ts**

```typescript
import path from 'path';
import { prisma } from '../../config/db';
import { ImportSummary } from '../../dto/import-summary';
import { RecordStatus } from '../../enums/RecordStatus';
import { config } from '../../config';
import { loadData } from './storage';
import { enrichFromTmdb, type TmdbEnrichResult } from './tmdb-enrich';
import type { CollectItem } from './types';
import {
  createTask, getTask, updateProgress, completeTask, failTask,
  type TaskMode, type HarvestTask,
} from './task-manager';
import { scrapeCollect, scrapeReviews, makeBrowser } from './scraper';
import { loadProgress, saveProgress, saveSyncState, todayStr } from './storage';

// 从豆瓣链接提取 doubanId
function extractDoubanId(link: string): string | null {
  const idx = link.indexOf('/subject/');
  if (idx < 0) return null;
  let tail = link.substring(idx + 9);
  const slash = tail.indexOf('/');
  if (slash > 0) tail = tail.substring(0, slash);
  return tail || null;
}

// 豆瓣 1-5 评分 → 2-10（与 DoubanCsvImportService 一致）
function convertRating(rating: string): number | null {
  const n = parseFloat(rating);
  if (isNaN(n) || n <= 0) return null;
  // 豆瓣是 1-5 星，转换到 2-10
  const converted = n * 2;
  const rounded = Math.round(converted);
  return rounded > 10 ? 10 : rounded;
}

// 从 CollectItem 的 intro 中提取年份
function extractYear(intro: string): string | null {
  const match = intro.match(/(\d{4})/);
  return match ? match[1] : null;
}

// 从 CollectItem 的 intro 中检测是否可能是电视剧/综艺
function mightBeTvShow(item: CollectItem): boolean {
  const intro = item.intro || '';
  // 含"集"或"季"的通常是电视剧/综艺
  if (/集|季/.test(intro)) return true;
  // 时长含"分钟"通常是电影，否则可能是剧
  if (!/分钟/.test(intro) && /类型/.test(intro)) return false;
  return false;
}

/**
 * mode=json: 读现有 collect.json 导入
 */
export async function importFromJson(
  dataDir?: string,
  onProgress?: (processed: number, total: number, currentTitle: string) => void,
): Promise<ImportSummary> {
  const dir = dataDir || config.douban.dataDir;
  const collectPath = path.join(dir, 'collect.json');
  const items: CollectItem[] = loadData<CollectItem>(collectPath);

  const summary: ImportSummary = { total: 0, imported: 0, skipped: 0, errors: [] };

  if (items.length === 0) {
    summary.errors.push(`未找到数据文件: ${collectPath}`);
    return summary;
  }

  // 批量查已有记录
  const doubanIds = items.map(i => extractDoubanId(i.link)).filter((id): id is string => id !== null);
  const existingDoubanMovies = doubanIds.length > 0
    ? new Map((await prisma.movie.findMany({ where: { doubanId: { in: doubanIds } } })).map(m => [m.doubanId!, m]))
    : new Map<string, any>();
  const existingDoubanTvShows = doubanIds.length > 0
    ? new Map((await prisma.tvShow.findMany({ where: { doubanId: { in: doubanIds } } })).map(s => [s.doubanId!, s]))
    : new Map<string, any>();

  summary.total = items.length;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const currentTitle = item.title;
    if (onProgress) onProgress(i, items.length, currentTitle);

    try {
      const doubanId = extractDoubanId(item.link);

      // 按 doubanId 查重
      if (doubanId) {
        if (existingDoubanMovies.has(doubanId) || existingDoubanTvShows.has(doubanId)) {
          summary.skipped++;
          continue;
        }
      }

      // TMDB 丰富
      const enrich = await enrichFromTmdb(item.title);

      // 评分转换
      const rating = convertRating(item.rating);
      const watchedDate = item.date ? new Date(item.date + 'T00:00:00.000Z') : undefined;

      // 判断类型并写入对应表
      if (enrich.type === 'tv' || (enrich.type === 'unknown' && mightBeTvShow(item))) {
        // 检查 tmdbId 去重
        if (enrich.tmdbId) {
          const existing = await prisma.tvShow.findUnique({ where: { tmdbId: enrich.tmdbId } });
          if (existing) {
            // 补充 doubanId
            if (!existing.doubanId && doubanId) {
              await prisma.tvShow.update({ where: { id: existing.id }, data: { doubanId } });
            }
            summary.skipped++;
            continue;
          }
        }

        await prisma.tvShow.create({
          data: {
            doubanId: doubanId,
            tmdbId: enrich.tmdbId ?? undefined,
            title: item.title,
            posterUrl: enrich.posterUrl,
            firstAirDate: enrich.releaseDate ?? extractYear(item.intro),
            overview: enrich.overview,
            status: RecordStatus.DONE,
            rating,
            shortReview: item.comment || null,
            createdAt: watchedDate,
          },
        });
      } else {
        // 默认归入 Movie 表
        if (enrich.tmdbId) {
          const existing = await prisma.movie.findUnique({ where: { tmdbId: enrich.tmdbId } });
          if (existing) {
            if (!existing.doubanId && doubanId) {
              await prisma.movie.update({ where: { id: existing.id }, data: { doubanId } });
            }
            summary.skipped++;
            continue;
          }
        }

        await prisma.movie.create({
          data: {
            doubanId: doubanId,
            tmdbId: enrich.tmdbId ?? undefined,
            title: item.title,
            posterUrl: enrich.posterUrl,
            status: RecordStatus.DONE,
            rating,
            shortReview: item.comment || null,
            createdAt: watchedDate,
          },
        });
      }

      summary.imported++;
    } catch (ex: any) {
      summary.errors.push(`导入失败: ${item.title} — ${ex.message}`);
      summary.skipped++;
    }
  }

  return summary;
}

/**
 * 启动异步导入任务
 */
export function startJsonImportTask(dataDir?: string): HarvestTask {
  const task = createTask('json');

  // 异步执行，不阻塞 API 响应
  (async () => {
    try {
      const result = await importFromJson(dataDir, (processed, total, currentTitle) => {
        updateProgress(task.taskId, { processed, total, currentTitle });
      });
      completeTask(task.taskId, result);
    } catch (ex: any) {
      failTask(task.taskId, ex.message);
    }
  })();

  return task;
}

/**
 * mode=full: 全量爬取 + 写库
 */
export function startFullHarvestTask(): HarvestTask {
  const task = createTask('full');

  (async () => {
    try {
      const progress = loadProgress();
      const { browser, context } = await makeBrowser();
      try {
        const collectResult = await scrapeCollect(context, progress);
        if (!collectResult.ok) {
          failTask(task.taskId, '爬取被风控中止');
          return;
        }
        // 爬取成功，导入数据
        updateProgress(task.taskId, { processed: 0, total: collectResult.newItems.length, currentTitle: '正在导入...' });
        const result = await importFromJson(undefined, (processed, total, currentTitle) => {
          updateProgress(task.taskId, { processed, total, currentTitle });
        });
        completeTask(task.taskId, result);
        saveProgress(progress);
        if (progress.collectDone) {
          saveSyncState(todayStr());
        }
      } finally {
        await context.close();
        await browser.close();
      }
    } catch (ex: any) {
      failTask(task.taskId, ex.message);
    }
  })();

  return task;
}

/**
 * mode=incremental: 增量爬取 + 写库
 */
export function startIncrementalHarvestTask(): HarvestTask {
  const task = createTask('incremental');

  (async () => {
    try {
      const syncState = { lastSyncDate: null } as any;
      // 从 sync_state.json 读上次同步日期
      const state = loadData<{ lastSyncDate: string | null }>('sync_state.json');
      const lastSync = state?.lastSyncDate || state?.[0]?.lastSyncDate;
      if (!lastSync) {
        failTask(task.taskId, '从未同步过，请先使用全量模式');
        return;
      }

      const progress = loadProgress();
      const { browser, context } = await makeBrowser();
      try {
        const collectResult = await scrapeCollect(context, progress, lastSync);
        if (!collectResult.ok) {
          failTask(task.taskId, '爬取被风控中止');
          return;
        }

        // 将增量数据写入 collect.json 后导入
        const existing = loadData<CollectItem>('collect.json');
        const all = [...existing, ...collectResult.newItems];
        // 去重（按 link）
        const seen = new Set<string>();
        const deduped = all.filter(item => {
          if (seen.has(item.link)) return false;
          seen.add(item.link);
          return true;
        });
        // 保存合并后的数据
        const fs = await import('fs');
        const dir = config.douban.dataDir;
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'collect.json'), JSON.stringify(deduped, null, 2), 'utf-8');

        // 导入
        updateProgress(task.taskId, { processed: 0, total: collectResult.newItems.length, currentTitle: '正在导入增量数据...' });
        const result = await importFromJson(undefined, (processed, total, currentTitle) => {
          updateProgress(task.taskId, { processed, total, currentTitle });
        });
        completeTask(task.taskId, result);
        saveSyncState(todayStr());
      } finally {
        await context.close();
        await browser.close();
      }
    } catch (ex: any) {
      failTask(task.taskId, ex.message);
    }
  })();

  return task;
}

// 重新导出任务查询
export { getTask, type HarvestTask };
```

- [ ] **Step 2: Commit**

```bash
git add express-backend/src/services/douban-harvester/import-service.ts
git commit -m "feat: add douban import service with JSON/full/incremental modes"
```

---

## Task 7: 添加 API 路由

**Files:**
- Modify: `express-backend/src/routes/import.ts`

- [ ] **Step 1: 在 import.ts 添加 douban-harvest 路由**

在文件顶部添加 import：

```typescript
import {
  startJsonImportTask,
  startFullHarvestTask,
  startIncrementalHarvestTask,
  getTask,
} from '../services/douban-harvester/import-service';
```

在文件底部 `export default router;` 之前添加：

```typescript
// POST /api/import/douban-harvest?mode=json|full|incremental
router.post('/douban-harvest', async (req: Request, res: Response) => {
  const mode = (req.query.mode as string) || 'json';

  if (!config.tmdb.apiKey && mode === 'json') {
    // TMDB API key 可选但建议配置
  }

  let task;
  switch (mode) {
    case 'full':
      if (!config.douban.userId) {
        res.status(400).json({ error: '缺少 DOUBAN_USER_ID 配置' });
        return;
      }
      task = startFullHarvestTask();
      break;
    case 'incremental':
      if (!config.douban.userId) {
        res.status(400).json({ error: '缺少 DOUBAN_USER_ID 配置' });
        return;
      }
      task = startIncrementalHarvestTask();
      break;
    case 'json':
    default:
      task = startJsonImportTask();
      break;
  }

  res.json({
    taskId: task.taskId,
    status: task.status,
    mode: task.mode,
  });
});

// GET /api/import/douban-harvest/status?taskId=xxx
router.get('/douban-harvest/status', (req: Request, res: Response) => {
  const taskId = req.query.taskId as string;
  if (!taskId) {
    res.status(400).json({ error: '缺少 taskId 参数' });
    return;
  }
  const task = getTask(taskId);
  if (!task) {
    res.status(404).json({ error: '任务不存在' });
    return;
  }
  res.json({
    taskId: task.taskId,
    status: task.status,
    mode: task.mode,
    progress: task.progress,
    result: task.result,
    error: task.error,
  });
});
```

- [ ] **Step 2: 验证 TypeScript 编译通过**

```bash
cd express-backend && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add express-backend/src/routes/import.ts
git commit -m "feat: add douban-harvest API routes"
```

---

## Task 8: 创建数据目录并复制现有数据

- [ ] **Step 1: 创建数据目录**

```bash
mkdir -p express-backend/data/douban-harvester
```

- [ ] **Step 2: 复制现有爬取数据（如果存在）**

```bash
cp douban-harvester/data/collect.json express-backend/data/douban-harvester/ 2>/dev/null; echo "done"
cp douban-harvester/data/reviews.json express-backend/data/douban-harvester/ 2>/dev/null; echo "done"
cp douban-harvester/data/progress.json express-backend/data/douban-harvester/ 2>/dev/null; echo "done"
cp douban-harvester/data/sync_state.json express-backend/data/douban-harvester/ 2>/dev/null; echo "done"
```

- [ ] **Step 3: 确保 .gitignore 包含数据目录**

检查 `express-backend/.gitignore` 是否包含 `/data/`，如果没有则添加：

```
/data/
```

- [ ] **Step 4: Commit**

```bash
git add express-backend/.gitignore
git commit -m "chore: add data/ to gitignore for douban-harvester data"
```

---

## Task 9: 端到端验证

- [ ] **Step 1: 重启后端**

```bash
cd express-backend && npm run dev
```

- [ ] **Step 2: 测试 mode=json 导入（如果 collect.json 有数据）**

```bash
curl -X POST "http://localhost:18889/api/import/douban-harvest?mode=json"
```

Expected: 返回 `{"taskId": "douban-harvest-...", "status": "running", "mode": "json"}`

- [ ] **Step 3: 查询任务状态**

```bash
curl "http://localhost:18889/api/import/douban-harvest/status?taskId=<上一步返回的taskId>"
```

Expected: 返回 `{"taskId": "...", "status": "completed", "progress": {...}, "result": {"total": N, "imported": M, "skipped": K, "errors": [...]}}`

- [ ] **Step 4: 检查数据库中是否有新记录**

```bash
curl "http://localhost:18889/api/library?category=movie" | head -c 500
```

Expected: 返回包含豆瓣导入的电影数据

- [ ] **Step 5: 最终 Commit**

```bash
git add -A
git commit -m "feat: complete douban-harvester integration with TMDB enrichment"
```