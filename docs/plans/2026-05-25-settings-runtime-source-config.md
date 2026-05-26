# Settings Runtime Source Config Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expose Douban harvester, Playwright, and Radar optional-source runtime controls in the existing Settings page so deployment-sensitive behavior is explicit and configurable.

**Architecture:** Keep the current `.env`-backed settings system. Add typed config values in `express-backend/src/config/index.ts`, expose the new keys through `express-backend/src/routes/settings.ts`, and update the Douban harvester to read those values instead of hard-coded constants. Do not build Radar itself in this plan; only add the planned Radar runtime toggles so the future module can consume them.

**Tech Stack:** Express 5, TypeScript, dotenv, Playwright, React 18, Zustand, Vite, TailwindCSS.

---

## Context

PixelReel has an existing Settings page:

- Backend settings API: `express-backend/src/routes/settings.ts`
- Backend runtime config: `express-backend/src/config/index.ts`
- Frontend settings page: `frontend/src/pages/SettingsPage.tsx`
- Frontend i18n labels: `frontend/src/stores/i18nStore.ts`

Settings currently reads and writes `express-backend/.env`, validates keys against a hard-coded category list, and returns `restartRequired: true` after saving.

The Douban harvester currently uses Playwright:

- Integrated backend copy: `express-backend/src/services/douban-harvester/scraper.ts`
- Harvester task orchestration: `express-backend/src/services/douban-harvester/import-service.ts`
- Harvester constants: `express-backend/src/services/douban-harvester/config.ts`
- Import route: `express-backend/src/routes/import.ts`

The current deployment risk is `headless: false` in `scraper.ts`. Docker normally has no GUI, so production should default to headless mode. Full/incremental browser scraping should also be explicitly disableable while leaving JSON import available.

There is no test framework in this repo. Use TypeScript builds and focused manual API checks as verification. Do not add Jest/Vitest for this small change.

## Target Settings

Add these keys to Settings.

Douban category:

```env
DOUBAN_DATA_DIR=
DOUBAN_HARVEST_ENABLED=true
DOUBAN_HARVEST_HEADLESS=true
DOUBAN_HARVEST_MAX_PAGES_PER_RUN=200
DOUBAN_HARVEST_SLEEP_MIN=3
DOUBAN_HARVEST_SLEEP_MAX=7
DOUBAN_HARVEST_LONG_BREAK_EVERY=40
DOUBAN_HARVEST_LONG_BREAK_SECONDS=180
DOUBAN_HARVEST_NAVIGATION_TIMEOUT_MS=30000
```

Radar category:

```env
RADAR_ENABLED=true
RADAR_CRON_ENABLED=true
RADAR_SYNC_ON_START=true
RADAR_SCRAPERS_ENABLED=true
RADAR_IQIYI_ENABLED=false
RADAR_PLAYWRIGHT_HEADLESS=true
RADAR_SYNC_CORE_CRON=0 * * * *
RADAR_SYNC_SCRAPER_CRON=0 */6 * * *
RADAR_REQUEST_TIMEOUT_MS=15000
```

Only the Douban keys are consumed in this plan. Radar keys are exposed now for future Radar implementation.

---

### Task 1: Add Typed Runtime Config Values

**Files:**
- Modify: `express-backend/src/config/index.ts`

**Step 1: Add parsing helpers near the top of the file**

Insert after `dotenv.config();`:

```ts
const parseBoolean = (value: string | undefined, defaultValue: boolean): boolean => {
  if (value == null || value === '') return defaultValue;
  return value === 'true';
};

const parseNumber = (value: string | undefined, defaultValue: number): number => {
  if (value == null || value === '') return defaultValue;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
};
```

**Step 2: Extend `config.douban`**

Replace the current `douban` object with:

```ts
  douban: {
    baseUrl: process.env.DOUBAN_BASE_URL || 'https://movie.douban.com',
    cookie: process.env.DOUBAN_COOKIE || '',
    userId: process.env.DOUBAN_USER_ID || '',
    dataDir: process.env.DOUBAN_DATA_DIR || path.resolve(__dirname, '../../data/douban-harvester'),
    harvestEnabled: parseBoolean(process.env.DOUBAN_HARVEST_ENABLED, true),
    harvestHeadless: parseBoolean(process.env.DOUBAN_HARVEST_HEADLESS, true),
    harvestMaxPagesPerRun: parseNumber(process.env.DOUBAN_HARVEST_MAX_PAGES_PER_RUN, 200),
    harvestSleepMin: parseNumber(process.env.DOUBAN_HARVEST_SLEEP_MIN, 3),
    harvestSleepMax: parseNumber(process.env.DOUBAN_HARVEST_SLEEP_MAX, 7),
    harvestLongBreakEvery: parseNumber(process.env.DOUBAN_HARVEST_LONG_BREAK_EVERY, 40),
    harvestLongBreakSeconds: parseNumber(process.env.DOUBAN_HARVEST_LONG_BREAK_SECONDS, 180),
    harvestNavigationTimeoutMs: parseNumber(process.env.DOUBAN_HARVEST_NAVIGATION_TIMEOUT_MS, 30000),
  },
```

**Step 3: Add `config.radar`**

Insert before `rawg`:

```ts
  radar: {
    enabled: parseBoolean(process.env.RADAR_ENABLED, true),
    cronEnabled: parseBoolean(process.env.RADAR_CRON_ENABLED, true),
    syncOnStart: parseBoolean(process.env.RADAR_SYNC_ON_START, true),
    scrapersEnabled: parseBoolean(process.env.RADAR_SCRAPERS_ENABLED, true),
    iqiyiEnabled: parseBoolean(process.env.RADAR_IQIYI_ENABLED, false),
    playwrightHeadless: parseBoolean(process.env.RADAR_PLAYWRIGHT_HEADLESS, true),
    syncCoreCron: process.env.RADAR_SYNC_CORE_CRON || '0 * * * *',
    syncScraperCron: process.env.RADAR_SYNC_SCRAPER_CRON || '0 */6 * * *',
    requestTimeoutMs: parseNumber(process.env.RADAR_REQUEST_TIMEOUT_MS, 15000),
  },
```

**Step 4: Verify TypeScript compile**

Run:

```bash
cd express-backend
npm run build
```

Expected: PASS.

**Step 5: Commit**

```bash
git add express-backend/src/config/index.ts
git commit -m "feat: add runtime source config"
```

---

### Task 2: Expose New Keys in Backend Settings API

**Files:**
- Modify: `express-backend/src/routes/settings.ts`

**Step 1: Add Douban harvester fields**

In the existing `douban` category fields, append:

```ts
      { key: 'DOUBAN_DATA_DIR', sensitive: false, type: 'text' },
      { key: 'DOUBAN_HARVEST_ENABLED', sensitive: false, type: 'boolean' },
      { key: 'DOUBAN_HARVEST_HEADLESS', sensitive: false, type: 'boolean' },
      { key: 'DOUBAN_HARVEST_MAX_PAGES_PER_RUN', sensitive: false, type: 'text' },
      { key: 'DOUBAN_HARVEST_SLEEP_MIN', sensitive: false, type: 'text' },
      { key: 'DOUBAN_HARVEST_SLEEP_MAX', sensitive: false, type: 'text' },
      { key: 'DOUBAN_HARVEST_LONG_BREAK_EVERY', sensitive: false, type: 'text' },
      { key: 'DOUBAN_HARVEST_LONG_BREAK_SECONDS', sensitive: false, type: 'text' },
      { key: 'DOUBAN_HARVEST_NAVIGATION_TIMEOUT_MS', sensitive: false, type: 'text' },
```

**Step 2: Add a Radar category**

Insert after the `douban` category:

```ts
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
      { key: 'RADAR_REQUEST_TIMEOUT_MS', sensitive: false, type: 'text' },
    ],
  },
```

**Step 3: Verify unknown-key validation includes new keys**

No separate code change is needed because `KNOWN_KEYS` is derived from `CATEGORIES`.

**Step 4: Build backend**

Run:

```bash
cd express-backend
npm run build
```

Expected: PASS.

**Step 5: Manual API check**

Start backend if it is not running:

```bash
cd express-backend
npm run dev
```

In a separate shell, request settings:

```bash
curl http://localhost:18889/api/settings
```

Expected:

- Response includes category key `radar`.
- Douban category includes `DOUBAN_HARVEST_HEADLESS`.
- Sensitive values such as `DOUBAN_COOKIE` are still marked `sensitive: true`.

**Step 6: Commit**

```bash
git add express-backend/src/routes/settings.ts
git commit -m "feat: expose source runtime settings"
```

---

### Task 3: Wire Douban Harvester Constants to Runtime Config

**Files:**
- Modify: `express-backend/src/services/douban-harvester/config.ts`
- Modify: `express-backend/src/services/douban-harvester/scraper.ts`

**Step 1: Replace hard-coded constants**

In `express-backend/src/services/douban-harvester/config.ts`, replace the exported constants with:

```ts
import { config } from '../../config';

export const USER_ID = config.douban.userId;

export const HARVEST_ENABLED = config.douban.harvestEnabled;
export const HARVEST_HEADLESS = config.douban.harvestHeadless;
export const SLEEP_MIN = config.douban.harvestSleepMin;
export const SLEEP_MAX = config.douban.harvestSleepMax;
export const LONG_BREAK_EVERY = config.douban.harvestLongBreakEvery;
export const LONG_BREAK_SECONDS = config.douban.harvestLongBreakSeconds;
export const MAX_PAGES_PER_RUN = config.douban.harvestMaxPagesPerRun;
export const NAVIGATION_TIMEOUT_MS = config.douban.harvestNavigationTimeoutMs;

export const PIXELREEL_BASE_URL = `http://localhost:${config.port}`;
export const PIXELREEL_TOKEN = '';
export const AUTO_PUSH = true;
```

**Step 2: Import new constants in scraper**

In `express-backend/src/services/douban-harvester/scraper.ts`, update the import block to include:

```ts
  HARVEST_HEADLESS, NAVIGATION_TIMEOUT_MS,
```

The import should include:

```ts
import {
  USER_ID, SLEEP_MIN, SLEEP_MAX,
  LONG_BREAK_EVERY, LONG_BREAK_SECONDS, MAX_PAGES_PER_RUN,
  HARVEST_HEADLESS, NAVIGATION_TIMEOUT_MS,
} from "./config";
```

**Step 3: Use configurable headless mode**

Replace:

```ts
    headless: false, // 调试期用有头；稳定后可改 true
```

with:

```ts
    headless: HARVEST_HEADLESS,
```

**Step 4: Use configurable navigation timeout**

Replace all Douban page navigation timeout values:

```ts
timeout: 30_000
```

with:

```ts
timeout: NAVIGATION_TIMEOUT_MS
```

This includes `page.goto` calls in `scrapeCollect` and `scrapeReviews`, including retry paths.

**Step 5: Build backend**

Run:

```bash
cd express-backend
npm run build
```

Expected: PASS.

**Step 6: Commit**

```bash
git add express-backend/src/services/douban-harvester/config.ts express-backend/src/services/douban-harvester/scraper.ts
git commit -m "feat: configure douban harvester browser runtime"
```

---

### Task 4: Gate Browser-Based Douban Harvest Routes

**Files:**
- Modify: `express-backend/src/routes/import.ts`
- Modify: `express-backend/src/services/douban-harvester/import-service.ts`

**Step 1: Add route-level disabled behavior**

In `express-backend/src/routes/import.ts`, inside the `full` and `incremental` cases, check `config.douban.harvestEnabled` before checking `DOUBAN_USER_ID`.

Use this response:

```ts
      if (!config.douban.harvestEnabled) {
        res.status(403).json({ error: '豆瓣浏览器收割已关闭，可使用 mode=json 导入已有数据' });
        return;
      }
```

Place it in both `case 'full':` and `case 'incremental':`.

**Step 2: Add service-level guard for safety**

In `express-backend/src/services/douban-harvester/import-service.ts`, import `config` already exists at the top. At the start of `startFullHarvestTask()` and `startIncrementalHarvestTask()`, after creating the task, add:

```ts
  if (!config.douban.harvestEnabled) {
    failTask(task.taskId, '豆瓣浏览器收割已关闭');
    return task;
  }
```

This protects any future code path that calls the task functions directly.

**Step 3: Build backend**

Run:

```bash
cd express-backend
npm run build
```

Expected: PASS.

**Step 4: Manual disabled check**

Set in `express-backend/.env`:

```env
DOUBAN_HARVEST_ENABLED=false
```

Restart backend, then run:

```bash
curl -X POST "http://localhost:18889/api/import/douban-harvest?mode=full"
```

Expected: HTTP 403 with:

```json
{"error":"豆瓣浏览器收割已关闭，可使用 mode=json 导入已有数据"}
```

Run:

```bash
curl -X POST "http://localhost:18889/api/import/douban-harvest?mode=json"
```

Expected: still creates a task or returns the existing JSON import error if no JSON data exists. It must not be blocked by `DOUBAN_HARVEST_ENABLED=false`.

**Step 5: Restore local `.env` if changed manually**

If this plan is executed in the user's active workspace, restore the previous local value after manual testing. Do not commit `.env`.

**Step 6: Commit**

```bash
git add express-backend/src/routes/import.ts express-backend/src/services/douban-harvester/import-service.ts
git commit -m "feat: gate browser douban harvest"
```

---

### Task 5: Add Frontend Labels for New Settings Categories

**Files:**
- Modify: `frontend/src/stores/i18nStore.ts`

**Step 1: Add English category label**

In the English dictionary near existing `settings.cat.douban`, add:

```ts
    "settings.cat.radar": "RADAR",
```

**Step 2: Add Chinese category label**

In the Chinese dictionary near existing `settings.cat.douban`, add:

```ts
    "settings.cat.radar": "雷达",
```

**Step 3: Type-check frontend**

Run:

```bash
cd frontend
npx tsc --noEmit
```

Expected: PASS.

**Step 4: Build frontend if environment allows**

Run:

```bash
cd frontend
npm run build
```

Expected: PASS.

Known caveat: this environment previously saw Vite/esbuild `EPERM` under sandboxed execution. If that happens, record the failure and rely on `npx tsc --noEmit` for this task.

**Step 5: Commit**

```bash
git add frontend/src/stores/i18nStore.ts
git commit -m "feat: label radar settings"
```

---

### Task 6: Document Docker and Runtime Behavior

**Files:**
- Modify: `docs/plans/2026-05-25-radar-module-design.md`
- Create: `docs/plans/2026-05-25-runtime-source-settings.md`

**Step 1: Create runtime settings note**

Create `docs/plans/2026-05-25-runtime-source-settings.md`:

```md
# PixelReel Runtime Source Settings

> **日期：** 2026-05-25
>
> **目标：** 记录豆瓣收割机、Playwright 和雷达数据源在本地与 Docker 部署中的配置边界。

## 豆瓣收割机

`mode=json` 只读取已有 JSON 数据，不启动 Chromium。

`mode=full` 和 `mode=incremental` 会启动 Playwright Chromium。部署环境应保持：

```env
DOUBAN_HARVEST_HEADLESS=true
```

如需完全关闭浏览器收割：

```env
DOUBAN_HARVEST_ENABLED=false
```

关闭后，JSON 导入仍可使用。

## Docker

启用浏览器收割或未来爱奇艺 Radar 源时，镜像需要安装 Chromium 依赖：

```dockerfile
RUN npx playwright install --with-deps chromium
```

如果不启用任何 Playwright 源，可以不触发 Chromium 运行路径。

## 数据目录

容器部署时建议把 `DOUBAN_DATA_DIR` 指向持久化 volume，例如：

```env
DOUBAN_DATA_DIR=/data/douban-harvester
```

否则容器重建后 `collect.json`、进度和同步状态会丢失。

## 雷达

Radar 的国内页面爬虫和爱奇艺 Playwright 源应为 optional source：

```env
RADAR_SCRAPERS_ENABLED=true
RADAR_IQIYI_ENABLED=false
```

第一版 Radar 不应因为 optional source 失败而影响 TMDB 和豆瓣核心数据展示。
```

**Step 2: Update Radar design doc**

In `docs/plans/2026-05-25-radar-module-design.md`, ensure the config section lists:

```env
RADAR_ENABLED=true
RADAR_CRON_ENABLED=true
RADAR_SYNC_ON_START=true
RADAR_SCRAPERS_ENABLED=true
RADAR_IQIYI_ENABLED=false
RADAR_PLAYWRIGHT_HEADLESS=true
RADAR_SYNC_CORE_CRON=0 * * * *
RADAR_SYNC_SCRAPER_CRON=0 */6 * * *
RADAR_REQUEST_TIMEOUT_MS=15000
```

If the doc already has these values, only add a sentence linking to `2026-05-25-runtime-source-settings.md`.

**Step 3: Commit**

```bash
git add docs/plans/2026-05-25-radar-module-design.md docs/plans/2026-05-25-runtime-source-settings.md
git commit -m "docs: document runtime source settings"
```

---

### Task 7: Final Verification

**Files:**
- No code changes unless verification finds a problem.

**Step 1: Backend build**

Run:

```bash
cd express-backend
npm run build
```

Expected: PASS.

**Step 2: Frontend type-check**

Run:

```bash
cd frontend
npx tsc --noEmit
```

Expected: PASS.

**Step 3: Settings API smoke test**

Run backend:

```bash
cd express-backend
npm run dev
```

Request:

```bash
curl http://localhost:18889/api/settings
```

Expected:

- Existing categories still present.
- `douban` contains `DOUBAN_HARVEST_HEADLESS`.
- `radar` category exists.
- Sensitive flags unchanged for existing secret fields.

**Step 4: Browser harvest disabled smoke test**

Temporarily set:

```env
DOUBAN_HARVEST_ENABLED=false
```

Restart backend and run:

```bash
curl -X POST "http://localhost:18889/api/import/douban-harvest?mode=full"
```

Expected: HTTP 403.

Run:

```bash
curl -X POST "http://localhost:18889/api/import/douban-harvest?mode=json"
```

Expected: Not blocked by the disabled browser-harvest flag.

**Step 5: Final status check**

Run:

```bash
git status --short
```

Expected: only intentional files are changed. Do not revert unrelated user changes.

**Step 6: Final commit**

If any verification-only fixes were needed:

```bash
git add <changed-files>
git commit -m "fix: stabilize runtime settings verification"
```

Otherwise no commit is needed.

---

## Implementation Notes

- Do not commit `.env` or `.env.backup`.
- Do not add a test framework for this change.
- Do not enable Radar sync jobs yet. This plan only exposes future Radar runtime settings.
- Keep `DOUBAN_HARVEST_HEADLESS=true` as the default. Docker should not need a GUI display.
- Keep `DOUBAN_HARVEST_ENABLED=true` as the default to preserve local behavior.
- Keep `RADAR_IQIYI_ENABLED=false` as the default because it will require Playwright and is optional.
- If Playwright full/incremental mode is run in Docker, the image must install Chromium dependencies with `npx playwright install --with-deps chromium`.
