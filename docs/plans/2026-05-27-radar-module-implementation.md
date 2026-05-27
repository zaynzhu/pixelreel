# Radar Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/radar` page that aggregates recent/trending movies and TV shows from TMDB, Youku, and Tencent, with one-click "add to library" (with dedup) and "where to watch" links.

**Architecture:** Backend cron syncs TMDB + Youku + Tencent data into a `RadarItem` table; frontend fetches via paginated REST API with category/platform filters. Add-to-library uses a dedicated endpoint that checks for existing records by tmdbId before creating.

**Tech Stack:** Express 5 + Prisma 6 + node-cron (backend), React 18 + Zustand + TailwindCSS (frontend)

**Design spec:** `docs/plans/2026-05-27-radar-module-design-v2.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `express-backend/package.json` | Add `node-cron` dependency |
| Modify | `express-backend/prisma/schema.prisma` | Add `RadarItem` model |
| Create | `express-backend/src/services/radar/types.ts` | Type definitions: RadarItemInput, RadarSourceResult, enums |
| Create | `express-backend/src/services/radar/tmdbRadarService.ts` | Fetch TMDB now_playing/upcoming/trending/on_the_air |
| Create | `express-backend/src/services/radar/youkuRadarService.ts` | Fetch Youku latest movies via JSON API |
| Create | `express-backend/src/services/radar/tencentRadarService.ts` | Fetch Tencent latest movies via JSON API |
| Create | `express-backend/src/services/radar/radarSyncService.ts` | Orchestrate sources, upsert, lock, status |
| Create | `express-backend/src/routes/radar.ts` | GET /api/radar, GET /api/radar/status, POST /api/radar/sync, POST /api/radar/sync/:source, POST /api/radar/add-to-library |
| Modify | `express-backend/src/routes/index.ts` | Mount `/radar` routes |
| Modify | `express-backend/src/server.ts` | Register cron jobs + startup sync |
| Create | `frontend/src/types/radar.ts` | RadarItem, RadarListResponse, RadarStatusResponse interfaces |
| Create | `frontend/src/stores/radarStore.ts` | Zustand store: fetch items, sync, add-to-library |
| Modify | `frontend/src/stores/i18nStore.ts` | Add all `nav.radar` + `radar.*` keys to en/zh |
| Create | `frontend/src/pages/RadarPage.tsx` | Category tabs, platform chips, card grid, add-to-library |
| Modify | `frontend/src/components/AppShell.tsx` | Add radar nav item |
| Modify | `frontend/src/App.tsx` | Add `/radar` route |
| Modify | `frontend/src/imageProxy.ts` | Add Youku/Tencent CDN hosts |

---

## Task 1: Add node-cron dependency + RadarItem Prisma model

**Files:**
- Modify: `express-backend/package.json`
- Modify: `express-backend/prisma/schema.prisma`

- [ ] **Step 1: Install node-cron**

Run: `cd express-backend && npm install node-cron && npm install -D @types/node-cron`

- [ ] **Step 2: Add RadarItem model to schema.prisma**

Append after the `ActivityLog` model:

```prisma
model RadarItem {
  id           BigInt   @id @default(autoincrement())
  sourceKey    String   @unique @db.VarChar(255) @map("source_key")
  source       String   @db.VarChar(30)
  sourceId     String?  @db.VarChar(120) @map("source_id")
  sourceUrl    String?  @db.VarChar(500) @map("source_url")

  tmdbId       BigInt?  @map("tmdb_id")
  doubanId     String?  @db.VarChar(30) @map("douban_id")
  type         String   @db.VarChar(20)
  title        String   @db.VarChar(255)
  titleZh      String?  @db.VarChar(255) @map("title_zh")
  overview     String?  @db.Text
  posterPath   String?  @db.VarChar(500) @map("poster_path")
  releaseDate  String?  @db.VarChar(20) @map("release_date")

  platform     String?  @db.VarChar(50)
  category     String   @db.VarChar(30)
  voteAverage  Decimal? @db.Decimal(3,1) @map("vote_average")

  lastSyncedAt DateTime @map("last_synced_at") @db.DateTime(0)
  createdAt    DateTime @default(now()) @map("created_at") @db.DateTime(0)

  @@index([category, type], map: "idx_radar_category_type")
  @@index([platform], map: "idx_radar_platform")
  @@index([lastSyncedAt], map: "idx_radar_last_synced")
  @@index([tmdbId], map: "idx_radar_tmdb_id")
  @@map("radar_item")
}
```

- [ ] **Step 3: Push schema to database and generate client**

Run: `cd express-backend && npx prisma db push && npx prisma generate`

Expected: `🚀 Your database is now in sync with your Prisma schema.`

- [ ] **Step 4: Commit**

```bash
git add express-backend/package.json express-backend/package-lock.json express-backend/prisma/schema.prisma
git commit -m "feat(radar): add node-cron + RadarItem Prisma model"
```

---

## Task 2: Radar service types

**Files:**
- Create: `express-backend/src/services/radar/types.ts`

- [ ] **Step 1: Create types.ts**

```typescript
export type RadarSource = 'tmdb' | 'youku' | 'tencent' | 'douban';
export type RadarCategory = 'now_playing' | 'upcoming' | 'trending' | 'on_the_air';
export type RadarType = 'movie' | 'tv';

export interface RadarItemInput {
  sourceKey: string;
  source: RadarSource;
  sourceId?: string;
  sourceUrl?: string;
  tmdbId?: number;
  doubanId?: string;
  type: RadarType;
  title: string;
  titleZh?: string;
  overview?: string;
  posterPath?: string;
  releaseDate?: string;
  platform?: string;
  category: RadarCategory;
  voteAverage?: number;
}

export interface RadarSourceResult {
  source: RadarSource;
  ok: boolean;
  count: number;
  warning?: string;
}

export const CRITICAL_SOURCES: RadarSource[] = ['tmdb'];
export const OPTIONAL_SOURCES: RadarSource[] = ['youku', 'tencent'];
```

- [ ] **Step 2: Commit**

```bash
git add express-backend/src/services/radar/types.ts
git commit -m "feat(radar): add radar service type definitions"
```

---

## Task 3: TMDB radar service

**Files:**
- Create: `express-backend/src/services/radar/tmdbRadarService.ts`

- [ ] **Step 1: Create tmdbRadarService.ts**

```typescript
import axios from 'axios';
import { config } from '../../config';
import { RadarItemInput, RadarCategory } from './types';

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const proxyUrl = process.env.HTTPS_PROXY || process.env.https_proxy || '';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { HttpsProxyAgent } = require('https-proxy-agent');
const axiosProxyOpts: any = proxyUrl
  ? { proxy: false, httpsAgent: new HttpsProxyAgent(proxyUrl) }
  : {};

const tmdbAuthHeaders: Record<string, string> = config.tmdb.apiKey
  ? { Authorization: `Bearer ${config.tmdb.apiKey}` }
  : {};

interface TmdbEndpoint {
  path: string;
  category: RadarCategory;
  type: 'movie' | 'tv';
  titleField: string;
  dateField: string;
}

const TMDB_ENDPOINTS: TmdbEndpoint[] = [
  { path: '/movie/now_playing', category: 'now_playing', type: 'movie', titleField: 'title', dateField: 'release_date' },
  { path: '/movie/upcoming', category: 'upcoming', type: 'movie', titleField: 'title', dateField: 'release_date' },
  { path: '/trending/movie/week', category: 'trending', type: 'movie', titleField: 'title', dateField: 'release_date' },
  { path: '/trending/tv/week', category: 'trending', type: 'tv', titleField: 'name', dateField: 'first_air_date' },
  { path: '/tv/on_the_air', category: 'on_the_air', type: 'tv', titleField: 'name', dateField: 'first_air_date' },
];

async function fetchTmdbEndpoint(endpoint: TmdbEndpoint, retryCount = 0): Promise<any[]> {
  const url = `${config.tmdb.baseUrl}${endpoint.path}`;
  try {
    const response = await axios.get(url, {
      params: { language: 'zh-CN', page: 1 },
      headers: tmdbAuthHeaders,
      timeout: config.radar.requestTimeoutMs,
      ...axiosProxyOpts,
    });
    return response.data?.results ?? [];
  } catch (err: any) {
    if (err.response?.status === 429 && retryCount < 2) {
      const retryAfter = err.response.headers['retry-after'];
      const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : 3000;
      await delay(waitTime);
      return fetchTmdbEndpoint(endpoint, retryCount + 1);
    }
    throw err;
  }
}

function mapTmdbItem(item: any, endpoint: TmdbEndpoint): RadarItemInput {
  return {
    sourceKey: `tmdb:${endpoint.type}:${item.id}`,
    source: 'tmdb',
    sourceId: String(item.id),
    tmdbId: item.id,
    type: endpoint.type,
    title: item[endpoint.titleField] ?? '',
    titleZh: item[endpoint.titleField] ?? '',
    overview: item.overview ?? undefined,
    posterPath: item.poster_path ? config.tmdb.imageBaseUrl + item.poster_path : undefined,
    releaseDate: item[endpoint.dateField] ?? undefined,
    category: endpoint.category,
    voteAverage: item.vote_average ?? undefined,
  };
}

export async function fetchTmdbRadar(): Promise<RadarItemInput[]> {
  const allItems: RadarItemInput[] = [];
  for (const endpoint of TMDB_ENDPOINTS) {
    const items = await fetchTmdbEndpoint(endpoint);
    for (const item of items) {
      allItems.push(mapTmdbItem(item, endpoint));
    }
    await delay(250);
  }
  return allItems;
}
```

- [ ] **Step 2: Commit**

```bash
git add express-backend/src/services/radar/tmdbRadarService.ts
git commit -m "feat(radar): add TMDB radar service — now_playing/upcoming/trending/on_the_air"
```

---

## Task 4: Youku radar service

**Files:**
- Create: `express-backend/src/services/radar/youkuRadarService.ts`

- [ ] **Step 1: Create youkuRadarService.ts**

```typescript
import axios from 'axios';
import { config } from '../../config';
import { RadarItemInput } from './types';

export async function fetchYoukuRadar(): Promise<RadarItemInput[]> {
  try {
    const url = 'https://search.youku.com/api/search';
    const response = await axios.get(url, {
      params: { keyword: '电影', cate: 96, order: 1, pg: 1, pz: 30 },
      timeout: config.radar.requestTimeoutMs,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.youku.com/',
      },
    });

    const items: any[] = response.data?.searchResult ?? [];
    return items.map((item: any) => ({
      sourceKey: `youku:${item.showId}`,
      source: 'youku' as const,
      sourceId: item.showId ?? undefined,
      sourceUrl: item.leftButtonDTO?.action?.value ?? undefined,
      type: 'movie' as const,
      title: item.titleDTO?.displayName ?? '',
      titleZh: item.titleDTO?.displayName ?? undefined,
      posterPath: item.posterDTO?.vThumbUrl ?? undefined,
      releaseDate: undefined,
      platform: '优酷',
      category: 'now_playing' as const,
      voteAverage: undefined,
    }));
  } catch (err: any) {
    console.error('[Radar] Youku fetch error:', err.message);
    return [];
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add express-backend/src/services/radar/youkuRadarService.ts
git commit -m "feat(radar): add Youku radar service — latest movies JSON API"
```

---

## Task 5: Tencent radar service

**Files:**
- Create: `express-backend/src/services/radar/tencentRadarService.ts`

- [ ] **Step 1: Create tencentRadarService.ts**

```typescript
import axios from 'axios';
import { config } from '../../config';
import { RadarItemInput } from './types';

const TENCENT_API_URL = 'https://pbaccess.video.qq.com/trpc.vector_layout.page_view.PageService/getCard?video_appid=3000010&vversion_platform=2';

const TENCENT_REQUEST_BODY = {
  page_params: {
    tab_type: 'new_film',
    tab_name: '最新',
    tab_mvl_sub_mod_id: '792ac_195f1Sub_132',
    page_id: 'scms_shake',
    page_type: 'scms_shake',
    new_mark_label_enabled: '1',
  },
  page_context: { page_index: '1' },
  flip_info: {
    sub_module_id: '20190621006455',
    flip_params: {
      mvl_sub_mod_id: '20190621006455',
      page_id: 'scms_shake',
      page_type: 'scms_shake',
      source_key: '100173',
    },
  },
};

export async function fetchTencentRadar(): Promise<RadarItemInput[]> {
  try {
    const response = await axios.post(TENCENT_API_URL, TENCENT_REQUEST_BODY, {
      timeout: config.radar.requestTimeoutMs,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://v.qq.com/',
      },
    });

    const cards: any[] = response.data?.data?.card?.children_list?.list?.cards ?? [];
    return cards.map((card: any) => {
      const ratingText = card.marklabel_1_prime_text ?? '';
      const ratingVal = parseFloat(ratingText);
      return {
        sourceKey: `tencent:${card.cid}`,
        source: 'tencent' as const,
        sourceId: card.cid ?? undefined,
        sourceUrl: card.video_url ?? undefined,
        type: 'movie' as const,
        title: card.title ?? '',
        titleZh: card.priority_title ?? card.title ?? undefined,
        posterPath: card.pic_276x386 ?? undefined,
        releaseDate: card.publish_date ?? undefined,
        platform: '腾讯视频',
        category: 'now_playing' as const,
        voteAverage: !isNaN(ratingVal) ? ratingVal : undefined,
      };
    });
  } catch (err: any) {
    console.error('[Radar] Tencent fetch error:', err.message);
    return [];
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add express-backend/src/services/radar/tencentRadarService.ts
git commit -m "feat(radar): add Tencent radar service — latest movies JSON API"
```

---

## Task 6: Radar sync service (orchestrator)

**Files:**
- Create: `express-backend/src/services/radar/radarSyncService.ts`

- [ ] **Step 1: Create radarSyncService.ts**

```typescript
import { getDb } from '../../config/db';
import { config } from '../../config';
import { createTask, completeTask, failTask, updateProgress, getTask, listTasks } from '../task-manager';
import { RadarItemInput, RadarSource, RadarSourceResult, CRITICAL_SOURCES, OPTIONAL_SOURCES } from './types';
import { fetchTmdbRadar } from './tmdbRadarService';
import { fetchYoukuRadar } from './youkuRadarService';
import { fetchTencentRadar } from './tencentRadarService';

let syncLock = false;

async function fetchSourceItems(source: RadarSource): Promise<RadarItemInput[]> {
  switch (source) {
    case 'tmdb': return fetchTmdbRadar();
    case 'youku': return fetchYoukuRadar();
    case 'tencent': return fetchTencentRadar();
    default: return [];
  }
}

async function syncSource(source: RadarSource): Promise<RadarSourceResult> {
  const result: RadarSourceResult = { source, ok: true, count: 0 };
  try {
    const items = await fetchSourceItems(source);
    const db = getDb();
    for (const item of items) {
      await db.radarItem.upsert({
        where: { sourceKey: item.sourceKey },
        update: {
          title: item.title,
          titleZh: item.titleZh ?? null,
          overview: item.overview ?? null,
          posterPath: item.posterPath ?? null,
          releaseDate: item.releaseDate ?? null,
          category: item.category,
          voteAverage: item.voteAverage ?? null,
          platform: item.platform ?? null,
          lastSyncedAt: new Date(),
        },
        create: {
          sourceKey: item.sourceKey,
          source: item.source,
          sourceId: item.sourceId ?? null,
          sourceUrl: item.sourceUrl ?? null,
          tmdbId: item.tmdbId ?? null,
          doubanId: item.doubanId ?? null,
          type: item.type,
          title: item.title,
          titleZh: item.titleZh ?? null,
          overview: item.overview ?? null,
          posterPath: item.posterPath ?? null,
          releaseDate: item.releaseDate ?? null,
          platform: item.platform ?? null,
          category: item.category,
          voteAverage: item.voteAverage ?? null,
          lastSyncedAt: new Date(),
        },
      });
    }
    result.count = items.length;
  } catch (err: any) {
    result.ok = false;
    result.warning = err.message;
    console.error(`[Radar] ${source} sync failed:`, err.message);
  }
  return result;
}

export async function runRadarSync(sourceFilter?: string): Promise<{ taskId: string }> {
  if (syncLock) {
    throw new Error('同步正在运行中');
  }

  syncLock = true;
  const task = createTask('radar-sync', '雷达数据同步');

  (async () => {
    try {
      const sources: RadarSource[] = sourceFilter
        ? [sourceFilter as RadarSource]
        : [...CRITICAL_SOURCES, ...(config.radar.scrapersEnabled ? OPTIONAL_SOURCES : [])];

      const results: RadarSourceResult[] = [];
      let totalProcessed = 0;

      for (const source of sources) {
        if (task.abortController.signal.aborted) break;
        updateProgress(task.taskId, {
          processed: totalProcessed,
          total: sources.length,
          currentTitle: `Syncing ${source}...`,
        });
        const result = await syncSource(source);
        results.push(result);
        totalProcessed += result.count;
      }

      completeTask(task.taskId, { total: totalProcessed, imported: totalProcessed, skipped: 0, errors: results.filter(r => !r.ok).map(r => r.warning || 'unknown') });
    } catch (err: any) {
      failTask(task.taskId, err.message);
    } finally {
      syncLock = false;
    }
  })();

  return { taskId: task.taskId };
}

export function isSyncRunning(): boolean {
  return syncLock;
}

export function getRadarSyncStatus() {
  const radarTasks = listTasks().filter(t => t.type === 'radar-sync');
  return radarTasks.length > 0 ? radarTasks[0] : null;
}
```

- [ ] **Step 2: Commit**

```bash
git add express-backend/src/services/radar/radarSyncService.ts
git commit -m "feat(radar): add radar sync service — orchestration, lock, upsert"
```

---

## Task 7: Radar routes

**Files:**
- Create: `express-backend/src/routes/radar.ts`
- Modify: `express-backend/src/routes/index.ts`

- [ ] **Step 1: Create radar.ts routes**

```typescript
import { Router, Request, Response } from 'express';
import { getDb } from '../config/db';
import { runRadarSync, isSyncRunning, getRadarSyncStatus } from '../services/radar/radarSyncService';

const router = Router();

const VALID_CATEGORIES = ['now_playing', 'upcoming', 'trending', 'on_the_air'];
const VALID_TYPES = ['movie', 'tv'];

// GET /api/radar — list with filters
router.get('/', async (req: Request, res: Response) => {
  const category = req.query.category as string | undefined;
  const type = req.query.type as string | undefined;
  const platform = req.query.platform as string | undefined;
  const source = req.query.source as string | undefined;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 40));

  const where: any = {};
  if (category && VALID_CATEGORIES.includes(category)) where.category = category;
  if (type && VALID_TYPES.includes(type)) where.type = type;
  if (platform) where.platform = platform;
  if (source) where.source = source;

  try {
    const db = getDb();
    const [items, total] = await Promise.all([
      db.radarItem.findMany({
        where,
        orderBy: { lastSyncedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.radarItem.count({ where }),
    ]);

    // Batch check inLibrary: collect tmdbIds, query Movie/TvShow once
    const tmdbIds = items
      .filter(i => i.tmdbId !== null)
      .map(i => Number(i.tmdbId));
    const inLibraryMovieIds = new Set<number>();
    const inLibraryTvIds = new Set<number>();
    if (tmdbIds.length > 0) {
      const [movies, tvShows] = await Promise.all([
        db.movie.findMany({ where: { tmdbId: { in: tmdbIds } }, select: { tmdbId: true } }),
        db.tvShow.findMany({ where: { tmdbId: { in: tmdbIds } }, select: { tmdbId: true } }),
      ]);
      movies.forEach(m => m.tmdbId && inLibraryMovieIds.add(Number(m.tmdbId)));
      tvShows.forEach(t => t.tmdbId && inLibraryTvIds.add(Number(t.tmdbId)));
    }

    const itemsWithInLibrary = items.map(item => ({
      ...item,
      inLibrary: item.tmdbId
        ? (item.type === 'movie' ? inLibraryMovieIds : inLibraryTvIds).has(Number(item.tmdbId))
        : false,
    }));

    // Latest sync time
    const latestSync = await db.radarItem.findFirst({
      where: {},
      orderBy: { lastSyncedAt: 'desc' },
      select: { lastSyncedAt: true },
    });

    res.json({
      items: itemsWithInLibrary,
      page,
      limit,
      total,
      lastSyncedAt: latestSync?.lastSyncedAt ?? null,
      warnings: [],
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/radar/status
router.get('/status', (_req: Request, res: Response) => {
  const status = getRadarSyncStatus();
  res.json({ running: isSyncRunning(), lastTask: status });
});

// POST /api/radar/sync — trigger full sync
router.post('/sync', async (_req: Request, res: Response) => {
  if (isSyncRunning()) {
    res.status(409).json({ error: '同步正在运行中' });
    return;
  }
  try {
    const { taskId } = await runRadarSync();
    res.json({ taskId, status: 'running' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/radar/sync/:source — trigger single-source sync
router.post('/sync/:source', async (req: Request, res: Response) => {
  if (isSyncRunning()) {
    res.status(409).json({ error: '同步正在运行中' });
    return;
  }
  const source = req.params.source;
  try {
    const { taskId } = await runRadarSync(source);
    res.json({ taskId, status: 'running' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/radar/add-to-library
router.post('/add-to-library', async (req: Request, res: Response) => {
  const { radarItemId } = req.body;
  if (!radarItemId) {
    res.status(400).json({ error: 'radarItemId required' });
    return;
  }

  try {
    const db = getDb();
    const radarItem = await db.radarItem.findUnique({ where: { id: Number(radarItemId) } });
    if (!radarItem) {
      res.status(404).json({ error: 'RadarItem not found' });
      return;
    }

    const category = radarItem.type === 'tv' ? 'tv_show' : 'movie';

    // Dedup by tmdbId
    if (radarItem.tmdbId) {
      const existing = radarItem.type === 'tv'
        ? await db.tvShow.findFirst({ where: { tmdbId: Number(radarItem.tmdbId) } })
        : await db.movie.findFirst({ where: { tmdbId: Number(radarItem.tmdbId) } });
      if (existing) {
        res.json({ exists: true, recordId: existing.id, category });
        return;
      }
    }

    // Create new record with status=WANT
    if (radarItem.type === 'tv') {
      const show = await db.tvShow.create({
        data: {
          title: radarItem.titleZh || radarItem.title,
          posterUrl: radarItem.posterPath,
          firstAirDate: radarItem.releaseDate,
          overview: radarItem.overview,
          status: 'WANT',
          tmdbId: radarItem.tmdbId ? Number(radarItem.tmdbId) : null,
          tmdbTitle: radarItem.title,
          tmdbPosterUrl: radarItem.posterPath,
          tmdbReleaseDate: radarItem.releaseDate,
          tmdbOverview: radarItem.overview,
          tmdbVoteAverage: radarItem.voteAverage,
        },
      });
      res.json({ exists: false, recordId: show.id, category });
    } else {
      const movie = await db.movie.create({
        data: {
          title: radarItem.titleZh || radarItem.title,
          posterUrl: radarItem.posterPath,
          releaseDate: radarItem.releaseDate,
          overview: radarItem.overview,
          status: 'WANT',
          tmdbId: radarItem.tmdbId ? Number(radarItem.tmdbId) : null,
          tmdbTitle: radarItem.title,
          tmdbPosterUrl: radarItem.posterPath,
          tmdbReleaseDate: radarItem.releaseDate,
          tmdbOverview: radarItem.overview,
          tmdbVoteAverage: radarItem.voteAverage,
        },
      });
      res.json({ exists: false, recordId: movie.id, category });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
```

- [ ] **Step 2: Mount radar routes in routes/index.ts**

Add import and `router.use('/radar', radarRoutes)`.

- [ ] **Step 3: Commit**

```bash
git add express-backend/src/routes/radar.ts express-backend/src/routes/index.ts
git commit -m "feat(radar): add radar API routes — list, status, sync, add-to-library"
```

---

## Task 8: Cron registration in server.ts

**Files:**
- Modify: `express-backend/src/server.ts`

- [ ] **Step 1: Add cron imports and registration**

Add these imports at top of `server.ts`:
```typescript
import cron from 'node-cron';
import { runRadarSync } from './services/radar/radarSyncService';
```

Replace the `app.listen()` block with:
```typescript
app.listen(config.port, () => {
  console.log(`[PixelReel Express] 服务已启动，监听端口 ${config.port}`);
  console.log(`[PixelReel Express] 数据库: ${config.database.url.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);

  // Radar cron + startup sync
  if (config.radar.enabled) {
    if (config.radar.syncOnStart) {
      setTimeout(() => {
        console.log('[Radar] 启动同步...');
        runRadarSync().catch(err => console.error('[Radar] 启动同步失败:', err.message));
      }, 5000);
    }
    if (config.radar.cronEnabled) {
      cron.schedule(config.radar.syncCoreCron, () => {
        console.log('[Radar] 定时同步 TMDB...');
        runRadarSync('tmdb').catch(err => console.error('[Radar] TMDB 同步失败:', err.message));
      });
      if (config.radar.scrapersEnabled) {
        // Scraper cron: full sync (includes TMDB, but TMDB re-upsert is cheap/idempotent)
        cron.schedule(config.radar.syncScraperCron, () => {
          console.log('[Radar] 定时同步所有源...');
          runRadarSync().catch(err => console.error('[Radar] 定时同步失败:', err.message));
        });
      }
    }
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add express-backend/src/server.ts
git commit -m "feat(radar): register cron jobs + startup sync in server.ts"
```

---

## Task 9: Frontend types

**Files:**
- Create: `frontend/src/types/radar.ts`

- [ ] **Step 1: Create radar types**

```typescript
export interface RadarItem {
  id: number;
  sourceKey: string;
  source: string;
  sourceId: string | null;
  sourceUrl: string | null;
  tmdbId: number | null;
  doubanId: string | null;
  type: 'movie' | 'tv';
  title: string;
  titleZh: string | null;
  overview: string | null;
  posterPath: string | null;
  releaseDate: string | null;
  platform: string | null;
  category: string;
  voteAverage: number | null;
  lastSyncedAt: string;
  inLibrary: boolean;
}

export interface RadarListResponse {
  items: RadarItem[];
  page: number;
  limit: number;
  total: number;
  lastSyncedAt: string | null;
  warnings: string[];
}

export interface RadarSyncResponse {
  taskId: string;
  status: string;
}

export interface RadarAddToLibraryResponse {
  exists: boolean;
  recordId: number;
  category: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/types/radar.ts
git commit -m "feat(radar): add frontend radar type definitions"
```

---

## Task 10: Frontend radar store

**Files:**
- Create: `frontend/src/stores/radarStore.ts`

- [ ] **Step 1: Create radarStore.ts**

```typescript
import { create } from 'zustand';
import type { RadarItem, RadarListResponse } from '../types/radar';
import { apiFetch } from '../api';

type RadarCategory = 'now_playing' | 'upcoming' | 'trending' | 'on_the_air';
type RadarType = 'movie' | 'tv';

interface RadarState {
  items: RadarItem[];
  total: number;
  page: number;
  category: RadarCategory | '';
  type: RadarType | '';
  platform: string;
  loading: boolean;
  syncing: boolean;
  error: string | null;
  lastSyncedAt: string | null;
  fetchItems: (overrides?: Partial<{ category: string; type: string; platform: string; page: number }>) => Promise<void>;
  setCategory: (cat: RadarCategory | '') => void;
  setType: (t: RadarType | '') => void;
  setPlatform: (p: string) => void;
  triggerSync: (source?: string) => Promise<void>;
  addToLibrary: (radarItemId: number) => Promise<{ exists: boolean; recordId: number; category: string } | null>;
}

export const useRadarStore = create<RadarState>((set, get) => ({
  items: [],
  total: 0,
  page: 1,
  category: '',
  type: '',
  platform: '',
  loading: false,
  syncing: false,
  error: null,
  lastSyncedAt: null,

  fetchItems: async (overrides) => {
    const { category, type, platform, page } = { ...get(), ...overrides };
    set({ loading: true, error: null });
    try {
      const params = new URLSearchParams();
      if (category) params.set('category', category);
      if (type) params.set('type', type);
      if (platform) params.set('platform', platform);
      params.set('page', String(overrides?.page ?? page));
      params.set('limit', '40');
      const data = await apiFetch<RadarListResponse>(`/radar?${params}`);
      set({
        items: data.items,
        total: data.total,
        page: overrides?.page ?? page,
        lastSyncedAt: data.lastSyncedAt,
        loading: false,
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '获取雷达数据失败', loading: false });
    }
  },

  setCategory: (cat) => {
    set({ category: cat, page: 1 });
    get().fetchItems({ category: cat, page: 1 });
  },

  setType: (t) => {
    set({ type: t, page: 1 });
    get().fetchItems({ type: t, page: 1 });
  },

  setPlatform: (p) => {
    set({ platform: p, page: 1 });
    get().fetchItems({ platform: p, page: 1 });
  },

  triggerSync: async (source) => {
    if (get().syncing) return;
    set({ syncing: true });
    try {
      const url = source ? `/radar/sync/${source}` : '/radar/sync';
      await apiFetch<{ taskId: string }>(url, { method: 'POST' });
      // Poll briefly then refresh items
      setTimeout(() => {
        get().fetchItems();
        set({ syncing: false });
      }, 3000);
    } catch (err) {
      set({ syncing: false, error: err instanceof Error ? err.message : '同步失败' });
    }
  },

  addToLibrary: async (radarItemId) => {
    try {
      const result = await apiFetch<{ exists: boolean; recordId: number; category: string }>('/radar/add-to-library', {
        method: 'POST',
        body: JSON.stringify({ radarItemId }),
      });
      if (!result.exists) {
        set(state => ({
          items: state.items.map(item =>
            item.id === radarItemId ? { ...item, inLibrary: true } : item
          ),
        }));
      }
      return result;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : '加入记录库失败' });
      return null;
    }
  },
}));
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/stores/radarStore.ts
git commit -m "feat(radar): add frontend radar Zustand store"
```

---

## Task 11: Frontend i18n keys

**Files:**
- Modify: `frontend/src/stores/i18nStore.ts`

- [ ] **Step 1: Add radar i18n keys to both en and zh dictionaries**

EN keys:
```
"nav.radar": "RADAR",
"radar.kicker": "RADAR // DETECTION",
"radar.title": "MEDIA RADAR",
"radar.desc": "/// Scanning upcoming and trending media across all sources.",
"radar.lastSync": "Last sync",
"radar.refresh": "SYNC NOW",
"radar.syncing": "SYNCING...",
"radar.nowPlaying": "NOW PLAYING",
"radar.upcoming": "UPCOMING",
"radar.trending": "TRENDING",
"radar.onTheAir": "ON THE AIR",
"radar.all": "ALL",
"radar.addToLibrary": "+ WANT",
"radar.inLibrary": "IN LIBRARY",
"radar.whereToWatch": "WHERE ↗",
"radar.sourceTag.tmdb": "TMDB",
"radar.sourceTag.youku": "YOUKU",
"radar.sourceTag.tencent": "TENCENT",
"radar.noResults": "No items found. Try syncing first.",
```

ZH keys:
```
"nav.radar": "雷达",
"radar.kicker": "雷达 // 探测",
"radar.title": "媒体雷达",
"radar.desc": "/// 扫描所有数据源的即将上线和热门媒体。",
"radar.lastSync": "上次同步",
"radar.refresh": "立即同步",
"radar.syncing": "同步中...",
"radar.nowPlaying": "正在热映",
"radar.upcoming": "即将上映",
"radar.trending": "本周趋势",
"radar.onTheAir": "正在播出",
"radar.all": "全部",
"radar.addToLibrary": "+ 想看",
"radar.inLibrary": "已在库中",
"radar.whereToWatch": "去哪看 ↗",
"radar.sourceTag.tmdb": "TMDB",
"radar.sourceTag.youku": "优酷",
"radar.sourceTag.tencent": "腾讯",
"radar.noResults": "暂无数据，请先同步。",
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/stores/i18nStore.ts
git commit -m "feat(radar): add radar i18n keys for en/zh"
```

---

## Task 12: Frontend RadarPage

**Files:**
- Create: `frontend/src/pages/RadarPage.tsx`

- [ ] **Step 1: Create RadarPage.tsx**

```tsx
import { useEffect } from 'react';
import { useRadarStore } from '../stores/radarStore';
import { useI18nStore } from '../stores/i18nStore';
import { toast } from '../stores/toastStore';
import { proxiedImageUrl } from '../imageProxy';
import ImgWithFallback from '../components/ImgWithFallback';
import type { RadarItem } from '../types/radar';

const CATEGORIES = ['now_playing', 'upcoming', 'trending', 'on_the_air'] as const;
const PLATFORMS = ['', 'Netflix', 'Disney+', 'Apple TV+', 'Max', '优酷', '腾讯视频'];

function formatSyncTime(iso: string | null) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  return `${Math.floor(diff / 86400000)} 天前`;
}

export default function RadarPage() {
  const { items, total, page, category, platform, loading, syncing, lastSyncedAt, fetchItems, setCategory, setPlatform, triggerSync, addToLibrary } = useRadarStore();
  const { t } = useI18nStore();

  useEffect(() => { fetchItems(); }, []);

  const handleAddToLibrary = async (item: RadarItem) => {
    if (item.inLibrary) return;
    const result = await addToLibrary(item.id);
    if (result?.exists) toast(t('radar.inLibrary'), 'error');
    else if (result) toast(t('radar.inLibrary'));
  };

  const justWatchUrl = (item: RadarItem) =>
    `https://www.justwatch.com/cn/搜索?q=${encodeURIComponent(item.titleZh || item.title)}`;

  const catLabel = (cat: string) => {
    const map: Record<string, string> = {
      now_playing: t('radar.nowPlaying'),
      upcoming: t('radar.upcoming'),
      trending: t('radar.trending'),
      on_the_air: t('radar.onTheAir'),
    };
    return map[cat] ?? cat;
  };

  return (
    <div>
      {/* Header */}
      <section className="border border-[var(--line)] bg-[var(--surface)] px-6 py-8 sm:px-8">
        <span className="section-kicker">{t('radar.kicker')}</span>
        <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <h2 className="font-display text-3xl text-white">{t('radar.title')}</h2>
          <div className="flex items-center gap-4 text-xs text-[var(--muted)]">
            <span>{t('radar.lastSync')}: {formatSyncTime(lastSyncedAt)}</span>
            <button
              onClick={() => triggerSync()}
              disabled={syncing}
              className="brutal-btn-accent px-3 py-1 text-xs"
            >
              {syncing ? t('radar.syncing') : t('radar.refresh')}
            </button>
          </div>
        </div>
      </section>

      {/* Category tabs */}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => setCategory('' as any)}
          className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition-all ${
            category === '' ? 'bg-[var(--accent)] text-black' : 'border border-[var(--line)] text-[var(--muted)] hover:text-white'
          }`}
        >
          {t('radar.all')}
        </button>
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setCategory(cat)}
            className={`px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition-all ${
              category === cat ? 'bg-[var(--accent)] text-black' : 'border border-[var(--line)] text-[var(--muted)] hover:text-white'
            }`}
          >
            {catLabel(cat)}
          </button>
        ))}
      </div>

      {/* Platform chips */}
      <div className="mt-3 flex flex-wrap gap-2">
        {PLATFORMS.map(p => (
          <button
            key={p}
            onClick={() => setPlatform(p)}
            className={`px-3 py-1 text-[10px] font-bold uppercase tracking-widest transition-all ${
              platform === p ? 'bg-[var(--accent-deep)] text-white' : 'border border-[var(--line)] text-[var(--muted)] hover:text-white'
            }`}
          >
            {p || t('radar.all')}
          </button>
        ))}
      </div>

      {/* Card grid */}
      {loading ? (
        <p className="mt-8 text-center text-sm text-[var(--muted)]">{t('radar.syncing')}</p>
      ) : items.length === 0 ? (
        <p className="mt-8 text-center text-sm text-[var(--muted)]">{t('radar.noResults')}</p>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {items.map(item => (
            <div key={item.id} className="group border border-[var(--line)] bg-[var(--surface)] overflow-hidden">
              <div className="relative aspect-[2/3] overflow-hidden bg-[var(--surface-hover)]">
                <ImgWithFallback
                  src={proxiedImageUrl(item.posterPath)}
                  alt={item.titleZh || item.title}
                  className="h-full w-full object-cover transition-all group-hover:opacity-80"
                />
                {item.platform && (
                  <span className="absolute top-2 left-2 neo-badge text-[9px]">{item.platform}</span>
                )}
                {item.voteAverage && (
                  <span className="absolute top-2 right-2 neo-badge-accent text-[9px]">
                    {typeof item.voteAverage === 'number' ? item.voteAverage.toFixed(1) : item.voteAverage}
                  </span>
                )}
              </div>
              <div className="p-3">
                <p className="truncate text-sm font-bold text-white">{item.titleZh || item.title}</p>
                <div className="mt-1 flex items-center gap-2 text-[10px] text-[var(--muted)]">
                  {item.releaseDate && <span>{item.releaseDate}</span>}
                  <span className="neo-badge">{t(`radar.sourceTag.${item.source}` as any)}</span>
                </div>
                <div className="mt-2 flex gap-2">
                  {item.inLibrary ? (
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--muted)]">
                      {t('radar.inLibrary')}
                    </span>
                  ) : (
                    <button
                      onClick={() => handleAddToLibrary(item)}
                      className="brutal-btn-accent px-2 py-1 text-[10px]"
                    >
                      {t('radar.addToLibrary')}
                    </button>
                  )}
                  <a
                    href={justWatchUrl(item)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="brutal-btn px-2 py-1 text-[10px]"
                  >
                    {t('radar.whereToWatch')}
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {total > 40 && (
        <div className="mt-6 flex justify-center gap-4">
          <button
            onClick={() => fetchItems({ page: page - 1 })}
            disabled={page <= 1 || loading}
            className="brutal-btn px-4 py-2 text-xs"
          >
            ←
          </button>
          <span className="flex items-center text-xs text-[var(--muted)]">
            {page} / {Math.ceil(total / 40)}
          </span>
          <button
            onClick={() => fetchItems({ page: page + 1 })}
            disabled={page * 40 >= total || loading}
            className="brutal-btn px-4 py-2 text-xs"
          >
            →
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/RadarPage.tsx
git commit -m "feat(radar): add RadarPage with category tabs, platform chips, card grid"
```

---

## Task 13: AppShell nav + App.tsx route

**Files:**
- Modify: `frontend/src/components/AppShell.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add radar nav item to AppShell.tsx**

In `NAV_ITEMS` array, add after the "tv-shows/search" entry:
```ts
{ to: "/radar", label: t("nav.radar") },
```

- [ ] **Step 2: Add radar route to App.tsx**

Import `RadarPage` and add `<Route path="radar" element={<RadarPage />} />` inside the protected routes.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/AppShell.tsx frontend/src/App.tsx
git commit -m "feat(radar): add radar nav item and route"
```

---

## Task 14: Update imageProxy for Youku/Tencent CDN hosts

**Files:**
- Modify: `frontend/src/imageProxy.ts`

- [ ] **Step 1: Add Youku and Tencent CDN hosts to PROXYABLE_HOSTS**

In `frontend/src/imageProxy.ts`, add to the `PROXYABLE_HOSTS` Set:
```ts
'r1.ykimg.com',       // Youku poster CDN
'tv.puui.qpic.cn',    // Tencent poster CDN
```

- [ ] **Step 2: Add backend proxy allowlist for new hosts**

In `express-backend/src/routes/search.ts`, add to the `ALLOWED_HOSTS` Set (line 265):
```ts
'r1.ykimg.com',
'tv.puui.qpic.cn',
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/imageProxy.ts express-backend/src/routes/search.ts
git commit -m "feat(radar): add Youku/Tencent CDN hosts to image proxy allowlist"
```

---

## Task 15: Manual integration test

- [ ] **Step 1: Start backend, verify TMDB sync**

```bash
cd express-backend && npm run dev
```

Check console: `[radar] TMDB sync started` → `TMDB sync complete: N items`

- [ ] **Step 2: Test API endpoints**

```bash
# List items
curl http://localhost:18889/api/radar?category=now_playing&limit=5

# Status
curl http://localhost:18889/api/radar/status

# Manual sync
curl -X POST http://localhost:18889/api/radar/sync
```

- [ ] **Step 3: Start frontend, verify page**

```bash
cd frontend && npm run dev
```

Open `http://localhost:18888/radar`:
- Category tabs switch correctly
- Platform chips filter correctly
- Cards display poster, title, date, rating
- "+ 想看" button works (creates Movie/TvShow with status=WANT)
- "已在库中" shows for items already in library
- "去哪看 ↗" opens JustWatch in new tab
- Sync button triggers backend sync

- [ ] **Step 4: Commit (fix any issues found)**