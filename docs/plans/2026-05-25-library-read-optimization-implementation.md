# Library Read Optimization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement four follow-up optimizations for PixelReel library/timeline reads: server-side filtering, a lightweight timeline API, safer timeline rendering, and poster image cache/proxy improvements.

**Architecture:** Keep `/api/library` as the full record workbench API, and add a narrower `/api/timeline` API for scroll-heavy timeline rendering. Move filtering that reduces result size to the backend, keep timeline list payload small, load rich details on demand for the popup, defer full virtual scrolling until layout risk is proven acceptable, and enhance the existing image proxy instead of creating a second proxy endpoint.

**Tech Stack:** Express 5, TypeScript, Prisma 6, MySQL, React 18, Zustand, Vite, TailwindCSS. Add test tooling only if needed and keep it minimal.

---

## Current Context

Relevant existing files:

- `express-backend/src/routes/library.ts` exposes `GET /api/library`.
- `express-backend/src/services/LibraryService.ts` merges `movie`, `game`, and `tv_show` records with cursor pagination.
- `express-backend/prisma/schema.prisma` already has `(createdAt, id)` indexes for `movie`, `game`, and `tv_show`.
- `frontend/src/stores/libraryStore.ts` owns current paginated library state.
- `frontend/src/pages/TimelinePage.tsx` currently uses `useLibraryStore()` and filters records on the client.
- `frontend/src/pages/LibraryPage.tsx` also uses `useLibraryStore()`.
- `frontend/src/components/ImgWithFallback.tsx` renders images with fallback handling.
- `frontend/src/api.ts` wraps authenticated API calls.

Important constraints:

- Do not break the existing `/api/library` response shape for current Library page usage.
- Keep `/api/library` compatible with existing callers.
- Do not implement multi-user behavior as part of this plan.
- Do not introduce a large caching service or external dependency unless local code is insufficient.
- Keep changes incremental and verifiable.
- `category=media` explicitly means `movie + tv_show` in this plan. Document that in backend code because it is a product convention, not a database category.
- Do not ship a timeline page state where the popup loses rich fields. The lightweight list API and full-detail popup loading must be verified together.
- Do not introduce a second image proxy route while `/api/search/proxy/image?url=` exists. Reuse or refactor the existing route.

## Task 1: Add Backend Filter Types And Query Parsing

**Files:**

- Modify: `express-backend/src/services/LibraryService.ts`
- Modify: `express-backend/src/routes/library.ts`
- Test manually: `GET /api/library?category=media&year=2026&limit=20`

**Step 1: Extend list options**

In `express-backend/src/services/LibraryService.ts`, extend `ListRecordsOptions`:

```ts
export type LibraryCategoryFilter = 'all' | 'media' | 'movie' | 'tv_show' | 'game';

export interface ListRecordsOptions {
  cursor?: string;
  limit?: number;
  includeTotals?: boolean;
  category?: LibraryCategoryFilter;
  year?: number;
  status?: RecordStatus;
}
```

**Step 2: Add helpers for query filters**

Add helpers near `parseCursor`:

```ts
function normalizeCategory(value?: string): LibraryCategoryFilter {
  // Product convention: media means movie + tv_show, not game.
  if (value === 'movie' || value === 'tv_show' || value === 'game' || value === 'media') {
    return value;
  }
  return 'all';
}

function parseYear(value?: string): number | undefined {
  if (!value) return undefined;
  const year = Number(value);
  if (!Number.isInteger(year) || year < 1900 || year > 3000) return undefined;
  return year;
}

function yearRange(year?: number) {
  if (!year) return undefined;
  return {
    gte: new Date(`${year}-01-01T00:00:00.000Z`),
    lt: new Date(`${year + 1}-01-01T00:00:00.000Z`),
  };
}

function normalizeStatus(value?: string): RecordStatus | undefined {
  if (!value) return undefined;
  return parseRecordStatus(value);
}
```

**Step 3: Parse filters in route**

In `express-backend/src/routes/library.ts`, parse:

```ts
const category = req.query.category as string | undefined;
const year = req.query.year as string | undefined;
const status = req.query.status as string | undefined;
```

Pass normalized values to `listRecords`. Do not pass arbitrary status strings directly into Prisma filters.

**Step 4: Run backend build**

Run:

```bash
cd express-backend
npm run build
```

Expected: PASS.

**Step 5: Commit**

```bash
git add express-backend/src/routes/library.ts express-backend/src/services/LibraryService.ts
git commit -m "feat: parse library read filters"
```

## Task 2: Apply Server-Side Filters To `/api/library`

**Files:**

- Modify: `express-backend/src/services/LibraryService.ts`
- Test manually: `GET /api/library?category=game&year=2026&status=DONE&limit=20`

**Step 1: Build shared where filters**

Add:

```ts
function buildBaseWhere(options: ListRecordsOptions) {
  const createdAtRange = yearRange(options.year);
  return {
    ...(createdAtRange ? { createdAt: createdAtRange } : {}),
    ...(options.status ? { status: options.status } : {}),
  };
}
```

Status must already be normalized with `parseRecordStatus`. If the query value is not a known status, treat it as undefined instead of filtering by an arbitrary string.

**Step 2: Merge cursor filter with base where**

Replace the current `cursorFilter` with a composed filter:

```ts
const baseWhere = buildBaseWhere(options ?? {});
const cursorWhere = cursorObj
  ? {
      OR: [
        { createdAt: { lt: cursorObj.createdAt } },
        { createdAt: { equals: cursorObj.createdAt }, id: { lt: cursorObj.id } },
      ],
    }
  : {};

const where = {
  AND: [baseWhere, cursorWhere].filter((part) => Object.keys(part).length > 0),
};
```

If `AND` is empty, use `{}`.

**Step 3: Query only selected tables**

Use category to skip unnecessary table queries:

```ts
const category = options?.category ?? 'all';
// media is a PixelReel UI convention for movie + tv_show.
const includeMovies = category === 'all' || category === 'media' || category === 'movie';
const includeTvShows = category === 'all' || category === 'media' || category === 'tv_show';
const includeGames = category === 'all' || category === 'game';
```

Only call `findMany` for included tables. Return `[]` for excluded tables.

**Step 4: Update totals behavior**

For filtered requests, totals should reflect the same filters. Modify `fetchTotals` to accept `options?: ListRecordsOptions` and apply category/year/status filters.

For `includeTotals=false`, keep returning no totals.

**Step 5: Manual verification**

Start backend normally, then test:

```bash
curl "http://localhost:18889/api/library?category=game&limit=10"
curl "http://localhost:18889/api/library?category=media&limit=10"
curl "http://localhost:18889/api/library?year=2026&limit=10"
curl "http://localhost:18889/api/library?status=DONE&limit=10"
```

Expected:

- `category=game` returns only `game`.
- `category=media` returns only `movie` and `tv_show`.
- `year=2026` returns records whose `createdAt` is in 2026.
- Cursor pagination still returns stable pages.

**Step 6: Commit**

```bash
git add express-backend/src/services/LibraryService.ts
git commit -m "feat: filter library reads on server"
```

## Task 3: Add Lightweight Timeline DTO And Service

**Files:**

- Create: `express-backend/src/dto/timeline.ts`
- Create: `express-backend/src/services/TimelineService.ts`
- Test manually: later via route in Task 4

**Step 1: Create DTO**

Create `express-backend/src/dto/timeline.ts`:

```ts
export interface TimelineRecordResponse {
  id: number;
  category: 'movie' | 'game' | 'tv_show';
  title: string;
  posterUrl: string | null;
  status: string;
  rating: number | null;
  playtimeMinutes: number | null;
  sourceLabel: string | null;
  platformLabel: string | null;
  createdAt: string;
}

export interface TimelinePageResponse {
  records: TimelineRecordResponse[];
  nextCursor: string | null;
  totals?: {
    total: number;
  };
}
```

**Step 2: Extract shared library read helpers**

Before creating `TimelineService.ts`, avoid duplicating source detection and label code. In `express-backend/src/services/LibraryService.ts`, export the small helpers currently used by `toMovieRecord`, `toGameRecord`, and `toTvShowRecord`:

```ts
export function detectMovieSource(movie: any): string { /* existing body */ }
export function detectGameSource(game: any): string { /* existing body */ }
export function detectTvShowSource(show: any): string { /* existing body */ }
export function movieSourceLabel(sourceKey: string): string { /* existing body */ }
export function gameSourceLabel(sourceKey: string): string { /* existing body */ }
export function tvShowSourceLabel(sourceKey: string): string { /* existing body */ }
```

Do not refactor the whole service in this task. Only export the existing helpers so the timeline service can reuse them.

**Step 3: Create timeline service**

Create `express-backend/src/services/TimelineService.ts`. Import the exported source detection and label helpers from `LibraryService.ts`.

The service should export:

```ts
export interface ListTimelineOptions {
  cursor?: string;
  limit?: number;
  includeTotals?: boolean;
  category?: 'all' | 'media' | 'movie' | 'tv_show' | 'game';
  year?: number;
  status?: string;
}

export async function listTimelineRecords(options?: ListTimelineOptions): Promise<TimelinePageResponse> {
  // Query selected tables with select fields only.
}
```

Validate `category` and `status` in the same way as `/api/library`; do not pass arbitrary query strings directly into Prisma.

**Step 4: Use Prisma `select`**

For movie/tv_show, select only:

```ts
{
  id: true,
  title: true,
  posterUrl: true,
  status: true,
  rating: true,
  createdAt: true,
  doubanId: true,
  tmdbId: true,
  imdbId: true,
  traktId: true,
}
```

For game, select only:

```ts
{
  id: true,
  title: true,
  posterUrl: true,
  status: true,
  rating: true,
  playtimeMinutes: true,
  platform: true,
  createdAt: true,
  psnId: true,
  xboxId: true,
  steamAppId: true,
  rawgId: true,
}
```

**Step 5: Build response mapping**

Map to lightweight timeline records. Do not include long fields such as overview, shortReview, doubanIntro, TMDB metadata, or platform ratings.

**Step 6: Run backend build**

Run:

```bash
cd express-backend
npm run build
```

Expected: PASS.

**Step 7: Commit**

```bash
git add express-backend/src/dto/timeline.ts express-backend/src/services/TimelineService.ts express-backend/src/services/LibraryService.ts
git commit -m "feat: add lightweight timeline service"
```

## Task 4: Expose `/api/timeline`

**Files:**

- Create: `express-backend/src/routes/timeline.ts`
- Modify: `express-backend/src/routes/index.ts`
- Test manually: `GET /api/timeline?category=media&limit=96`

**Step 1: Create route**

Create `express-backend/src/routes/timeline.ts`:

```ts
import { Router, Request, Response } from 'express';
import { listTimelineRecords } from '../services/TimelineService';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
  const parsedLimit = parseInt(req.query.limit as string, 10);
  const limit = Math.min(Math.max(Number.isFinite(parsedLimit) ? parsedLimit : 96, 1), 200);
  const parsedYear = parseInt(req.query.year as string, 10);

  const result = await listTimelineRecords({
    cursor: req.query.cursor as string | undefined,
    limit,
    includeTotals: req.query.includeTotals !== 'false',
    category: normalizeTimelineCategory(req.query.category as string | undefined),
    year: Number.isFinite(parsedYear) ? parsedYear : undefined,
    status: normalizeTimelineStatus(req.query.status as string | undefined),
  });

  res.json(result);
});

export default router;
```

Add the small route-level normalizers or import them from `TimelineService.ts`. Unknown category should become `all`; unknown status should become `undefined`.

**Step 2: Register route**

In `express-backend/src/routes/index.ts`:

```ts
import timelineRoutes from '../routes/timeline';
```

Register:

```ts
router.use('/timeline', timelineRoutes);
```

**Step 3: Manual verification**

Run:

```bash
curl "http://localhost:18889/api/timeline?limit=5"
curl "http://localhost:18889/api/timeline?category=game&limit=5"
curl "http://localhost:18889/api/timeline?category=media&limit=5"
```

Expected:

- Response includes `records` and `nextCursor`.
- Record payload is much smaller than `/api/library`.
- Filtering works.

**Step 4: Commit**

```bash
git add express-backend/src/routes/timeline.ts express-backend/src/routes/index.ts
git commit -m "feat: expose timeline read API"
```

## Task 5: Add Frontend Timeline Types And Store

**Files:**

- Create: `frontend/src/types/timeline.ts`
- Create: `frontend/src/stores/timelineStore.ts`
- Modify: none yet in page

**Step 1: Create timeline types**

Create `frontend/src/types/timeline.ts`:

```ts
import type { LibraryCategory, RecordStatus } from './library';

export type TimelineCategoryFilter = 'media' | 'game' | 'all';

export type TimelineRecord = {
  id: number;
  category: LibraryCategory;
  title: string;
  posterUrl?: string | null;
  sourceLabel?: string | null;
  platformLabel?: string | null;
  status: RecordStatus;
  rating?: number | null;
  playtimeMinutes?: number | null;
  createdAt: string;
};

export type TimelinePageResponse = {
  records: TimelineRecord[];
  nextCursor: string | null;
  totals?: {
    total: number;
  };
};
```

**Step 2: Create timeline store**

Create `frontend/src/stores/timelineStore.ts` with:

- `records`
- `nextCursor`
- `loading`
- `loadingMore`
- `error`
- `filters`
- `fetchRecords`
- `fetchMore`
- `setFilters`

Use the same request sequencing, cursor validation, and append de-duping pattern already used in `libraryStore.ts`.

**Step 3: Build query helper**

Add:

```ts
function buildTimelineQuery(params: {
  cursor?: string | null;
  limit: number;
  category: TimelineCategoryFilter;
  year: number | 'ALL';
  includeTotals: boolean;
}) {
  const search = new URLSearchParams();
  search.set('limit', String(params.limit));
  search.set('category', params.category);
  search.set('includeTotals', String(params.includeTotals));
  if (params.cursor) search.set('cursor', params.cursor);
  if (params.year !== 'ALL') search.set('year', String(params.year));
  return `/timeline?${search.toString()}`;
}
```

**Step 4: Run frontend type check**

Run:

```bash
cd frontend
npx tsc --noEmit
```

Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/types/timeline.ts frontend/src/stores/timelineStore.ts
git commit -m "feat: add timeline data store"
```

## Task 6: Move Timeline Page To Lightweight API

**Files:**

- Modify: `frontend/src/pages/TimelinePage.tsx`
- Test: Browser manual test on `/timeline`

**Execution dependency:** Complete Task 11 and Task 7 before shipping this task. The task number is kept for document continuity, but implementation order must run years endpoint and detail-on-demand first. The timeline page must have a complete year list and full-detail popup loading before it switches away from `libraryStore`.

**Step 1: Replace store import**

Replace:

```ts
import { useLibraryStore } from "../stores/libraryStore";
import type { LibraryRecord, LibraryCategory, RecordStatus } from "../types/library";
```

With:

```ts
import { useTimelineStore } from "../stores/timelineStore";
import type { TimelineRecord } from "../types/timeline";
import type { LibraryCategory, RecordStatus } from "../types/library";
```

Use `TimelineRecord` instead of `LibraryRecord` for timeline list rendering.

**Step 2: Fetch by current filters**

On initial load and filter changes, call:

```ts
void fetchRecords({
  limit: 96,
  category: selectedCategory,
  year: selectedYear,
});
```

**Step 3: Remove client-side category/year filtering**

Remove the current `filteredRecords` filters for category and year. Backend now returns the filtered data.

Keep grouping by month on the records returned from the timeline API.

**Step 4: Use timeline years from store**

Do not build year options only from currently loaded filtered records, because backend filtering means only one year or one page may be loaded.

Use `years` from `timelineStore`, populated by `GET /api/timeline/years`.

Keep a defensive fallback only for temporary local development:

```ts
const yearOptions = years.length > 0
  ? years
  : [...new Set(records.map((record) => getYear(record.createdAt)))].sort((a, b) => b - a);
```

Do not rely on this fallback as the shipped behavior. If `fetchYears` fails, the store should set an `yearsError` state so the UI can show a warning instead of silently falling back to an incomplete year list derived from only-loaded records. The fallback is only for temporary local development before the years endpoint is deployed.

**Step 5: Popup behavior**

The current `TimelinePopup` expects full `LibraryRecord` fields. Do not ship an adapter that fills rich fields with `null`, because that is a visible user-facing regression.

Use the detail store from Task 7:

- Clicked card sets the selected lightweight timeline record.
- Detail store fetches `/api/library/:category/:id`.
- Popup opens with a loading state and then renders the full record.
- If detail fetch fails, show a small error state and keep the lightweight card selection; do not render a misleading half-empty detail view.

**Step 6: Manual verification**

Run backend and frontend, then test `/timeline`:

- Initial load shows records.
- Category switch triggers a fresh backend request.
- Year switch triggers a fresh backend request.
- Infinite scroll keeps working.
- Network panel shows `/api/timeline`, not `/api/library`.
- Clicking a card still shows shortReview, Douban/TMDB metadata, and platform ratings after the detail request resolves.

**Step 7: Commit**

```bash
git add frontend/src/pages/TimelinePage.tsx
git commit -m "feat: use lightweight timeline API"
```

## Task 7: Add Timeline Detail Fetch On Popup Open

**Files:**

- Create: `frontend/src/stores/timelineDetailStore.ts`
- Modify: `frontend/src/pages/TimelinePage.tsx`
- Optional modify: `express-backend/src/routes/library.ts`

**Step 1: Prefer existing full record source**

Use existing full record endpoints if available. If no `GET /api/library/:category/:id` exists, add one:

```text
GET /api/library/:category/:id
```

This endpoint should return one full `LibraryRecordResponse`.

**Step 2: Add backend endpoint if missing**

In `express-backend/src/services/LibraryService.ts`, add:

```ts
export async function getRecord(category: string, id: number): Promise<LibraryRecordResponse> {
  // Find by category and id, map through existing toMovieRecord/toGameRecord/toTvShowRecord.
}
```

In `express-backend/src/routes/library.ts`, add the route before `PATCH /:category/:id`:

```ts
router.get('/:category/:id', async (req, res) => {
  const result = await getRecord(req.params.category, Number(req.params.id));
  res.json(result);
});
```

Route order requirement:

- Keep `GET /random` before `GET /:category/:id`.
- Keep `GET /:category/:id` before `PATCH /:category/:id`.
- Otherwise `/random` can be accidentally interpreted as a category path segment.

**Step 3: Create detail store**

Create `frontend/src/stores/timelineDetailStore.ts`:

- Cache by `category:id`.
- Track loading/error per selected record.
- Fetch from `/library/${category}/${id}`.

**Step 4: Use full record in popup**

In `TimelinePage.tsx`, when clicking a timeline record:

- Set selected lightweight record immediately.
- Trigger detail fetch.
- Render popup with full record when loaded.
- While loading, popup can show the lightweight record with skeleton/partial content.

**Step 5: Manual verification**

Click several timeline cards:

- Popup opens quickly.
- Full metadata appears after detail fetch.
- Clicking same record again uses cache.

**Step 6: Commit**

```bash
git add express-backend/src/routes/library.ts express-backend/src/services/LibraryService.ts frontend/src/stores/timelineDetailStore.ts frontend/src/pages/TimelinePage.tsx
git commit -m "feat: load timeline details on demand"
```

## Task 8: Defer Full Virtualization And Add Safe Group-Level Lazy Rendering

**Files:**

- Modify: `frontend/src/pages/TimelinePage.tsx`
- Test: Browser manual scroll test

**Why full virtualization is deferred**

Do not introduce TanStack Virtual in this pass. The current timeline layout has variable month-group heights, CSS Grid poster layout, and a special first poster with `col-span-2 row-span-2`. Height estimation will be unstable before measurement and can create visible jumps or blank space.

The safer first improvement is to reduce how much expensive card content mounts at once while preserving natural document flow.

**Step 1: Extract month section component**

In `TimelinePage.tsx`, extract the current month section markup into:

```ts
function MonthGroupSection({ group, groupIndex, onSelectRecord }: Props) {
  // Existing section markup.
}
```

Keep this in the same file. This is only to isolate rendering cost and make later experiments easier.

**Step 2: Add visible group window state**

Add:

```ts
const INITIAL_VISIBLE_GROUPS = 8;
const GROUP_INCREMENT = 4;
const [visibleGroupCount, setVisibleGroupCount] = useState(INITIAL_VISIBLE_GROUPS);
```

Render:

```ts
const visibleMonthGroups = monthGroups.slice(0, visibleGroupCount);
```

**Step 3: Increase visible groups near page bottom**

Use a second sentinel after visible groups. Guard against expanding when data is still loading:

```ts
if (entries[0].isIntersecting && !loadingMore) {
  setVisibleGroupCount((count) => Math.min(count + GROUP_INCREMENT, monthGroups.length));
}
```

This is not true virtualization. It avoids disrupting layout while preventing the page from mounting every month group immediately.

The group-expansion sentinel and the `nextCursor` infinite-scroll sentinel must not interfere. The group sentinel only controls how many already-loaded month groups are rendered; the `nextCursor` sentinel controls fetching more data. Expanding visible groups while `loadingMore` is true would show empty month groups (data not yet arrived), so the guard on `!loadingMore` prevents that.

**Step 4: Reset visible group count on filter changes**

When category or year changes, reset:

```ts
setVisibleGroupCount(INITIAL_VISIBLE_GROUPS);
```

**Step 5: Manual verification**

Test:

- Scroll from top to bottom.
- Month groups stay in normal document flow.
- No visible blank space or jumping caused by estimated row heights.
- Infinite loading still triggers before the end.
- Popup still opens.
- Mobile layout still works.

**Step 6: Run checks**

```bash
cd frontend
npx tsc --noEmit
npm run build
```

Expected: PASS.

**Step 7: Commit**

```bash
git add frontend/src/pages/TimelinePage.tsx
git commit -m "perf: lazy mount timeline month groups"
```

## Task 9: Enhance Existing Image Proxy With Cache Controls

**Files:**

- Modify: existing route that handles `GET /api/search/proxy/image?url=...`
- Modify: `express-backend/src/routes/search.ts`
- Modify: `express-backend/src/config/index.ts`
- Test manually: `GET /api/search/proxy/image?url=...`

**Important:** Do not create a new `/api/images/proxy` route in this task. The project already has `/api/search/proxy/image?url=...` for image proxying. Improve that route so the app has one image proxy path instead of two overlapping implementations.

**Step 1: Add config**

In `express-backend/src/config/index.ts`, add:

```ts
imageProxy: {
  maxBytes: parseInt(process.env.IMAGE_PROXY_MAX_BYTES || String(5 * 1024 * 1024), 10),
  cacheSeconds: parseInt(process.env.IMAGE_PROXY_CACHE_SECONDS || String(60 * 60 * 24 * 7), 10),
},
```

**Step 2: Add URL allowlist to existing proxy**

In the existing image proxy route, allow only known poster hosts:

```ts
const ALLOWED_HOSTS = new Set([
  'image.tmdb.org',
  'media.themoviedb.org',
  'steamcdn-a.akamaihd.net',
  'cdn.cloudflare.steamstatic.com',
  'cdn.akamai.steamstatic.com',      // Steam legacy CDN
  'shared.akamai.steamstatic.com',    // Steam new-format CDN (poster hashes)
  'media.rawg.io',
  'img1.doubanio.com',
  'img2.doubanio.com',
  'img3.doubanio.com',
]);
```

Reject:

- missing URL
- invalid URL
- non-http/https protocols
- unknown hosts
- private IP addresses if hostname resolves locally in a future hardening pass

**Step 3: Preserve existing behavior and add cache headers**

Use axios with:

- `responseType: 'stream'`
- timeout
- max content length
- content-type validation for `image/*`

Set headers:

```ts
res.setHeader('Cache-Control', `public, max-age=${config.imageProxy.cacheSeconds}, immutable`);
res.setHeader('Content-Type', contentType);
```

Pipe stream to response.

**Step 4: Manual verification**

Run:

```bash
curl -I "http://localhost:18889/api/search/proxy/image?url=https%3A%2F%2Fimage.tmdb.org%2Ft%2Fp%2Fw500%2Fexample.jpg"
```

Expected:

- Known hosts are proxied.
- Unknown hosts return `400`.
- Response includes `Cache-Control`.
- Existing Douban image proxy behavior still works.

**Step 5: Commit**

```bash
git add express-backend/src/config/index.ts express-backend/src/routes/search.ts
git commit -m "perf: cache image proxy responses"
```

## Task 10: Use Image Proxy In Timeline Images

**Files:**

- Modify: `frontend/src/components/ImgWithFallback.tsx`
- Modify: `frontend/src/pages/TimelinePage.tsx`
- Optional create: `frontend/src/imageProxy.ts`

**Step 1: Add helper**

Create `frontend/src/imageProxy.ts`:

```ts
const PROXYABLE_HOSTS = new Set([
  'image.tmdb.org',
  'media.themoviedb.org',
  'steamcdn-a.akamaihd.net',
  'cdn.cloudflare.steamstatic.com',
  'cdn.akamai.steamstatic.com',
  'shared.akamai.steamstatic.com',
  'media.rawg.io',
  'img1.doubanio.com',
  'img2.doubanio.com',
  'img3.doubanio.com',
]);

export function proxiedImageUrl(url?: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!PROXYABLE_HOSTS.has(parsed.hostname)) return url;
    return `/api/search/proxy/image?url=${encodeURIComponent(url)}`;
  } catch {
    return url;
  }
}
```

**Step 2: Use helper in timeline poster card**

In `TimelinePage.tsx`, derive:

```ts
const posterUrl = proxiedImageUrl(record.posterUrl);
```

Use `posterUrl` for the `<img src>`.

**Step 3: Optionally use helper in `ImgWithFallback`**

If the proxy proves stable, use it inside `ImgWithFallback` so Library page and popup also benefit.

Recommended first version:

- Only apply proxy in timeline.
- Avoid changing all images until the endpoint is verified.

**Step 4: Manual verification**

Open browser devtools on `/timeline`:

- Timeline image requests should hit `/api/search/proxy/image`.
- Images should still fallback if proxy fails.
- Scrolling should reuse browser cache for repeated URLs.

**Step 5: Commit**

```bash
git add frontend/src/imageProxy.ts frontend/src/pages/TimelinePage.tsx
git commit -m "feat: proxy timeline poster images"
```

## Task 11: Add Timeline Years Endpoint

**Files:**

- Modify: `express-backend/src/routes/timeline.ts`
- Modify: `express-backend/src/services/TimelineService.ts`
- Modify: `frontend/src/stores/timelineStore.ts`
- Modify: `frontend/src/pages/TimelinePage.tsx`

**Execution order:** Run this before Task 6. Server-side filtering makes record-derived year options incomplete, so the timeline page migration depends on this endpoint.

**Step 1: Backend service**

Add:

```ts
export async function listTimelineYears(category: ListTimelineOptions['category'] = 'all'): Promise<number[]> {
  // Query createdAt from selected tables.
  // Extract years.
  // Return unique years sorted desc.
}
```

Keep it simple. If there are thousands of records, selecting only `createdAt` is acceptable for now.

**Step 2: Backend route**

Add before `router.get('/')`:

```ts
router.get('/years', async (req, res) => {
  const years = await listTimelineYears(normalizeTimelineCategory(req.query.category as string | undefined));
  res.json({ years });
});
```

**Step 3: Frontend store**

Add:

- `years: number[]`
- `fetchYears(category)`

**Step 4: Timeline page**

Use store years for the year selector instead of deriving years from currently loaded records.

When category changes:

- Fetch years for that category.
- Reset selected year to `ALL` if the current year is not available.

**Step 5: Manual verification**

Test:

- `MOVIE + TV` shows media years.
- `GAMES` shows game years.
- `ALL` shows all years.
- Selecting a year loads records from that year.

**Step 6: Commit**

```bash
git add express-backend/src/routes/timeline.ts express-backend/src/services/TimelineService.ts frontend/src/stores/timelineStore.ts frontend/src/pages/TimelinePage.tsx
git commit -m "feat: add timeline year filters"
```

## Task 12: Final Verification And Documentation

**Files:**

- Modify: `docs/PROJECT_STATUS.md`
- Modify: `README.md`
- Optional modify: `docs/plans/2026-05-25-library-read-performance-and-robustness.md`

**Step 1: Run backend build**

```bash
cd express-backend
npm run build
```

Expected: PASS.

**Step 2: Run frontend type check**

```bash
cd frontend
npx tsc --noEmit
```

Expected: PASS.

**Step 3: Run frontend build**

```bash
cd frontend
npm run build
```

Expected: PASS in a normal local shell. If sandbox blocks esbuild with `EPERM`, record that separately and run outside the sandbox.

**Step 4: Manual browser verification**

Start backend and frontend:

```bash
cd express-backend
npm run dev
```

```bash
cd frontend
npm run dev
```

Test:

- `/timeline` initial load.
- Switch category filters.
- Switch year filters.
- Scroll to load several pages.
- Open popup on multiple records.
- Check network payload for `/api/timeline`.
- Confirm `/api/library` still works on Library page.
- Confirm proxied images load and cache headers are present.

**Step 5: Update docs**

Update `docs/PROJECT_STATUS.md` with:

- `/api/timeline` endpoint
- `/api/timeline/years` endpoint
- cache-aware `/api/search/proxy/image` behavior
- timeline now uses lightweight API
- server-side library filters

Update `README.md` API section if still current.

**Step 6: Commit**

```bash
git add README.md docs/PROJECT_STATUS.md docs/plans/2026-05-25-library-read-performance-and-robustness.md
git commit -m "docs: document timeline read optimizations"
```

## Risk Notes

- Full virtual scrolling is intentionally deferred. The current month layout has variable heights, an oversized first card, and CSS Grid behavior that makes row estimation unreliable.
- Image proxy must not become SSRF-prone. Keep a strict allowlist and reject unknown hosts.
- Do not create a second image proxy endpoint while `/api/search/proxy/image` exists.
- Timeline lightweight records are not enough for the existing rich popup. Add on-demand detail loading before the page migration is considered complete.
- Server-side year filtering currently uses `createdAt`. If product meaning changes to watched date or imported date, update both backend and UI labels.
- Route order matters: `/api/library/random` must remain before `/api/library/:category/:id`.

## Recommended Implementation Order

1. Server-side filtering.
2. Lightweight timeline API.
3. Timeline frontend store.
4. Timeline years endpoint.
5. Detail-on-demand for popup.
6. Timeline page migration to the lightweight API.
7. Enhance existing image proxy/cache behavior.
8. Apply safe group-level lazy rendering only if timeline DOM size still hurts.
9. Docs and final verification.

This order reduces payload and query cost first, prevents the year selector from becoming incomplete, preserves popup richness during the migration, and avoids risky full virtualization until simpler measures are proven insufficient.
