# Analytics Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an independent `/analytics` page with yearly reports, monthly trends, rating distributions, source breakdowns, cross-platform rating comparisons, and a top-rated list.

**Architecture:** Backend adds a single `GET /api/analytics?year=` endpoint that returns all analytics data in one response. Frontend uses Recharts for chart rendering with the existing cyberpunk theme. Data is aggregated from the existing Movie/TvShow/Game tables using `updatedAt` as the completion-time proxy.

**Tech Stack:** Express 5, TypeScript, Prisma 6, React 18, Zustand, Recharts, TailwindCSS

---

## File Map

### New Files

| File | Responsibility |
|------|---------------|
| `express-backend/src/dto/analytics.ts` | Type definitions for `AnalyticsResponse` |
| `express-backend/src/services/AnalyticsService.ts` | Data aggregation logic (year filtering, distributions, cross-platform) |
| `express-backend/src/routes/analytics.ts` | Express route handler |
| `frontend/src/stores/analyticsStore.ts` | Zustand store for analytics data |
| `frontend/src/pages/AnalyticsPage.tsx` | Page container with year selector |
| `frontend/src/components/analytics/OverviewCards.tsx` | Summary stat cards |
| `frontend/src/components/analytics/MonthlyChart.tsx` | Stacked bar chart for monthly completion |
| `frontend/src/components/analytics/RatingChart.tsx` | Grouped bar chart for rating distribution |
| `frontend/src/components/analytics/SourcePieChart.tsx` | Pie charts for source/platform breakdown |
| `frontend/src/components/analytics/CrossPlatformChart.tsx` | Scatter plot for Douban vs TMDB ratings |
| `frontend/src/components/analytics/TopRatedList.tsx` | Top 10 rated items list |

### Modified Files

| File | Change |
|------|--------|
| `express-backend/src/routes/index.ts` | Register analytics route |
| `frontend/src/App.tsx` | Add `/analytics` route |
| `frontend/src/components/AppShell.tsx` | Add analytics nav item |
| `frontend/src/stores/i18nStore.ts` | Add analytics i18n keys |
| `frontend/package.json` | Add `recharts` dependency |

---

### Task 1: Install Recharts

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Install recharts**

```bash
cd "/Users/zaynzhu/code/claude code/project/pixelreel/frontend" && npm install recharts
```

Expected: `recharts` added to `dependencies` in `package.json`.

- [ ] **Step 2: Verify build still works**

```bash
cd "/Users/zaynzhu/code/claude code/project/pixelreel/frontend" && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd "/Users/zaynzhu/code/claude code/project/pixelreel" && git add frontend/package.json frontend/package-lock.json && git commit -m "deps: 添加 recharts 图表库"
```

---

### Task 2: Backend DTO Types

**Files:**
- Create: `express-backend/src/dto/analytics.ts`

- [ ] **Step 1: Create the analytics DTO**

```typescript
// 分析接口响应类型
export interface AnalyticsResponse {
  year: number

  overview: {
    completedThisYear: number
    completedLastYear: number
    avgRatingThisYear: number | null
    ratedThisYear: number
    reviewedThisYear: number
    totalInLibrary: number
  }

  monthlyCompletion: Array<{
    month: string     // "01" ~ "12"
    movies: number
    games: number
    tvShows: number
  }>

  ratingDistribution: {
    movies: Array<{ rating: number; count: number }>
    games: Array<{ rating: number; count: number }>
    tvShows: Array<{ rating: number; count: number }>
  }

  sourceBreakdown: {
    movies: Array<{ source: string; label: string; count: number }>
    games: Array<{ platform: string; label: string; count: number }>
    tvShows: Array<{ source: string; label: string; count: number }>
  }

  crossPlatformRatings: Array<{
    title: string
    doubanRating: number
    tmdbRating: number
  }>

  topRated: Array<{
    category: string     // "movie" | "game" | "tv_show"
    id: number
    title: string
    posterUrl: string | null
    rating: number
    shortReview: string | null
    source: string
  }>
}
```

- [ ] **Step 2: Commit**

```bash
cd "/Users/zaynzhu/code/claude code/project/pixelreel" && git add express-backend/src/dto/analytics.ts && git commit -m "feat: 添加 analytics DTO 类型定义"
```

---

### Task 3: Backend Analytics Service

**Files:**
- Create: `express-backend/src/services/AnalyticsService.ts`

This service reuses the same source/platform inference functions from `ProfileSummaryService.ts`.

- [ ] **Step 1: Create AnalyticsService with all aggregation logic**

```typescript
import { getDb } from '../config/db'
import { AnalyticsResponse } from '../dto/analytics'
import { RecordStatus } from '../enums/RecordStatus'

export async function getAnalytics(year: number): Promise<AnalyticsResponse> {
  const db = getDb()
  const [movies, games, tvShows] = await Promise.all([
    db.movie.findMany({ orderBy: { updatedAt: 'desc' } }),
    db.game.findMany({ orderBy: { updatedAt: 'desc' } }),
    db.tvShow.findMany({ orderBy: { updatedAt: 'desc' } }),
  ])

  const yearStart = new Date(year, 0, 1)
  const yearEnd = new Date(year + 1, 0, 1)
  const lastYearStart = new Date(year - 1, 0, 1)
  const lastYearEnd = new Date(year, 0, 1)

  const inYear = (d: Date | null) => d != null && d >= yearStart && d < yearEnd
  const inLastYear = (d: Date | null) => d != null && d >= lastYearStart && d < lastYearEnd

  // 本年完成的记录
  const doneMoviesThisYear = movies.filter(m => m.status === RecordStatus.DONE && inYear(m.updatedAt))
  const doneGamesThisYear = games.filter(g => g.status === RecordStatus.DONE && inYear(g.updatedAt))
  const doneTvShowsThisYear = tvShows.filter(s => s.status === RecordStatus.DONE && inYear(s.updatedAt))

  // 上年完成的记录
  const doneMoviesLastYear = movies.filter(m => m.status === RecordStatus.DONE && inLastYear(m.updatedAt))
  const doneGamesLastYear = games.filter(g => g.status === RecordStatus.DONE && inLastYear(g.updatedAt))
  const doneTvShowsLastYear = tvShows.filter(s => s.status === RecordStatus.DONE && inLastYear(s.updatedAt))

  const completedThisYear = doneMoviesThisYear.length + doneGamesThisYear.length + doneTvShowsThisYear.length
  const completedLastYear = doneMoviesLastYear.length + doneGamesLastYear.length + doneTvShowsLastYear.length

  // 本年有评分的记录（updatedAt 在该年且 rating 不为 null）
  const ratedMoviesThisYear = movies.filter(m => m.rating != null && inYear(m.updatedAt))
  const ratedGamesThisYear = games.filter(g => g.rating != null && inYear(g.updatedAt))
  const ratedTvShowsThisYear = tvShows.filter(s => s.rating != null && inYear(s.updatedAt))
  const ratedThisYear = ratedMoviesThisYear.length + ratedGamesThisYear.length + ratedTvShowsThisYear.length

  // 本年评分均值
  const allRatingsThisYear = [
    ...ratedMoviesThisYear.map(m => m.rating!),
    ...ratedGamesThisYear.map(g => g.rating!),
    ...ratedTvShowsThisYear.map(s => s.rating!),
  ]
  const avgRatingThisYear = allRatingsThisYear.length > 0
    ? Math.round((allRatingsThisYear.reduce((s, r) => s + r, 0) / allRatingsThisYear.length) * 10) / 10
    : null

  // 本年有短评的记录
  const reviewedMoviesThisYear = movies.filter(m => m.shortReview?.trim() && inYear(m.updatedAt))
  const reviewedGamesThisYear = games.filter(g => g.shortReview?.trim() && inYear(g.updatedAt))
  const reviewedTvShowsThisYear = tvShows.filter(s => s.shortReview?.trim() && inYear(s.updatedAt))
  const reviewedThisYear = reviewedMoviesThisYear.length + reviewedGamesThisYear.length + reviewedTvShowsThisYear.length

  return {
    year,
    overview: {
      completedThisYear,
      completedLastYear,
      avgRatingThisYear,
      ratedThisYear,
      reviewedThisYear,
      totalInLibrary: movies.length + games.length + tvShows.length,
    },
    monthlyCompletion: buildMonthlyCompletion(doneMoviesThisYear, doneGamesThisYear, doneTvShowsThisYear),
    ratingDistribution: buildRatingDistribution(ratedMoviesThisYear, ratedGamesThisYear, ratedTvShowsThisYear),
    sourceBreakdown: buildSourceBreakdown(movies, games, tvShows),
    crossPlatformRatings: buildCrossPlatformRatings(movies),
    topRated: buildTopRated(movies, games, tvShows, yearStart, yearEnd),
  }
}

function buildMonthlyCompletion(
  movies: any[], games: any[], tvShows: any[]
): AnalyticsResponse['monthlyCompletion'] {
  const months: AnalyticsResponse['monthlyCompletion'] = []
  for (let i = 1; i <= 12; i++) {
    const mm = i.toString().padStart(2, '0')
    months.push({
      month: mm,
      movies: movies.filter(m => (m.updatedAt?.getMonth() ?? -1) === i - 1).length,
      games: games.filter(g => (g.updatedAt?.getMonth() ?? -1) === i - 1).length,
      tvShows: tvShows.filter(s => (s.updatedAt?.getMonth() ?? -1) === i - 1).length,
    })
  }
  return months
}

function buildRatingDistribution(
  movies: any[], games: any[], tvShows: any[]
): AnalyticsResponse['ratingDistribution'] {
  const dist = (items: any[]) => {
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    for (const item of items) {
      if (item.rating >= 1 && item.rating <= 5) counts[item.rating]++
    }
    return [1, 2, 3, 4, 5].map(r => ({ rating: r, count: counts[r] }))
  }
  return { movies: dist(movies), games: dist(games), tvShows: dist(tvShows) }
}

function buildSourceBreakdown(
  movies: any[], games: any[], tvShows: any[]
): AnalyticsResponse['sourceBreakdown'] {
  const countBy = (items: any[], fn: (item: any) => string) => {
    const counts: Record<string, number> = {}
    for (const item of items) {
      const key = fn(item)
      counts[key] = (counts[key] || 0) + 1
    }
    return counts
  }

  const movieSourceCounts = countBy(movies, inferMovieSource)
  const movieLabels: Record<string, string> = { TMDB: 'TMDB', DOUBAN: '豆瓣', IMDB: 'IMDb', TRAKT: 'Trakt', MANUAL: '手动' }
  const movieSources = Object.entries(movieSourceCounts)
    .map(([source, count]) => ({ source, label: movieLabels[source] || source, count }))
    .sort((a, b) => b.count - a.count)

  const gamePlatformCounts = countBy(games, inferGamePlatform)
  const gameLabels: Record<string, string> = { STEAM: 'Steam', RAWG: 'RAWG', XBOX: 'Xbox', PSN: 'PSN', MANUAL: '手动' }
  const gamePlatforms = Object.entries(gamePlatformCounts)
    .map(([platform, count]) => ({ platform, label: gameLabels[platform] || platform, count }))
    .sort((a, b) => b.count - a.count)

  const tvSourceCounts = countBy(tvShows, inferTvShowSource)
  const tvLabels: Record<string, string> = { TMDB: 'TMDB', DOUBAN: '豆瓣', IMDB: 'IMDb', TRAKT: 'Trakt', MANUAL: '手动' }
  const tvSources = Object.entries(tvSourceCounts)
    .map(([source, count]) => ({ source, label: tvLabels[source] || source, count }))
    .sort((a, b) => b.count - a.count)

  return { movies: movieSources, games: gamePlatforms, tvShows: tvSources }
}

function buildCrossPlatformRatings(movies: any[]): AnalyticsResponse['crossPlatformRatings'] {
  return movies
    .filter(m => m.doubanRating != null && m.tmdbVoteAverage != null)
    .map(m => ({
      title: m.title,
      doubanRating: m.doubanRating,
      tmdbRating: Math.round((Number(m.tmdbVoteAverage) / 2) * 10) / 10,
    }))
}

function buildTopRated(
  movies: any[], games: any[], tvShows: any[],
  yearStart: Date, yearEnd: Date
): AnalyticsResponse['topRated'] {
  const inYear = (d: Date | null) => d != null && d >= yearStart && d < yearEnd

  const items: AnalyticsResponse['topRated'] = [
    ...movies.filter(m => m.rating != null && inYear(m.updatedAt)).map(m => ({
      category: 'movie' as const,
      id: Number(m.id),
      title: m.title,
      posterUrl: m.posterUrl,
      rating: m.rating!,
      shortReview: m.shortReview,
      source: inferMovieSource(m),
    })),
    ...games.filter(g => g.rating != null && inYear(g.updatedAt)).map(g => ({
      category: 'game' as const,
      id: Number(g.id),
      title: g.title,
      posterUrl: g.posterUrl,
      rating: g.rating!,
      shortReview: g.shortReview,
      source: inferGamePlatform(g),
    })),
    ...tvShows.filter(s => s.rating != null && inYear(s.updatedAt)).map(s => ({
      category: 'tv_show' as const,
      id: Number(s.id),
      title: s.title,
      posterUrl: s.posterUrl,
      rating: s.rating!,
      shortReview: s.shortReview,
      source: inferTvShowSource(s),
    })),
  ]

  return items.sort((a, b) => b.rating - a.rating).slice(0, 10)
}

// 复用 ProfileSummaryService 的来源推断逻辑
function inferMovieSource(movie: any): string {
  if (movie.tmdbId) return 'TMDB'
  if (movie.doubanId) return 'DOUBAN'
  if (movie.imdbId) return 'IMDB'
  if (movie.traktId) return 'TRAKT'
  return 'MANUAL'
}

function inferGamePlatform(game: any): string {
  if (game.platform?.trim()) return game.platform.trim().toUpperCase()
  if (game.steamAppId) return 'STEAM'
  if (game.xboxId) return 'XBOX'
  if (game.psnId) return 'PSN'
  if (game.rawgId) return 'RAWG'
  return 'MANUAL'
}

function inferTvShowSource(show: any): string {
  if (show.tmdbId) return 'TMDB'
  if (show.doubanId) return 'DOUBAN'
  if (show.imdbId) return 'IMDB'
  if (show.traktId) return 'TRAKT'
  return 'MANUAL'
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/zaynzhu/code/claude code/project/pixelreel/express-backend" && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd "/Users/zaynzhu/code/claude code/project/pixelreel" && git add express-backend/src/services/AnalyticsService.ts && git commit -m "feat: 实现 AnalyticsService 数据聚合"
```

---

### Task 4: Backend Route

**Files:**
- Create: `express-backend/src/routes/analytics.ts`
- Modify: `express-backend/src/routes/index.ts`

- [ ] **Step 1: Create the analytics route**

```typescript
import { Router, Request, Response } from 'express'
import { getAnalytics } from '../services/AnalyticsService'

const router = Router()

// GET /api/analytics?year=2026 — 年度分析数据
router.get('/', async (req: Request, res: Response) => {
  try {
    const year = parseInt(req.query.year as string) || new Date().getFullYear()
    const data = await getAnalytics(year)
    res.json(data)
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
})

export default router
```

- [ ] **Step 2: Register route in index.ts**

In `express-backend/src/routes/index.ts`, add after the existing imports:

```typescript
import analyticsRoutes from '../routes/analytics';
```

And add after the activity routes line:

```typescript
router.use('/analytics', analyticsRoutes);
```

- [ ] **Step 3: Verify backend compiles and starts**

```bash
cd "/Users/zaynzhu/code/claude code/project/pixelreel/express-backend" && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd "/Users/zaynzhu/code/claude code/project/pixelreel" && git add express-backend/src/routes/analytics.ts express-backend/src/routes/index.ts && git commit -m "feat: 添加 /api/analytics 路由"
```

---

### Task 5: Backend Manual Smoke Test

**Files:** None (verification only)

- [ ] **Step 1: Start the backend and test the endpoint**

```bash
cd "/Users/zaynzhu/code/claude code/project/pixelreel/express-backend" && npm run dev &
sleep 3
curl -s "http://localhost:18889/api/analytics?year=2026" | head -c 500
```

Expected: JSON response with `year`, `overview`, `monthlyCompletion`, etc. No 500 error.

- [ ] **Step 2: Stop the backend**

```bash
kill %1 2>/dev/null; true
```

---

### Task 6: i18n Keys

**Files:**
- Modify: `frontend/src/stores/i18nStore.ts`

- [ ] **Step 1: Add analytics keys to the English dictionary**

Find the line `"showcase.kicker": "SHOWCASE // EXHIBITION",` in the `en` dictionary (around line 246) and add these keys BEFORE it:

```typescript
    // Analytics
    "analytics.kicker": "ANALYTICS // INSIGHTS",
    "analytics.title": "ANALYTICS",
    "analytics.year": "YEAR",
    "analytics.overview.completed": "COMPLETED",
    "analytics.overview.avg_rating": "AVG RATING",
    "analytics.overview.rated": "RATED",
    "analytics.overview.reviewed": "REVIEWED",
    "analytics.overview.total": "TOTAL",
    "analytics.overview.vs_last_year": "vs Last Year",
    "analytics.monthly.title": "MONTHLY COMPLETION",
    "analytics.rating.title": "RATING DISTRIBUTION",
    "analytics.source.title": "SOURCE BREAKDOWN",
    "analytics.source.movies": "MOVIES",
    "analytics.source.games": "GAMES",
    "analytics.source.tvshows": "TV SHOWS",
    "analytics.cross.title": "CROSS-PLATFORM RATINGS",
    "analytics.cross.douban": "DOUBAN",
    "analytics.cross.tmdb": "TMDB",
    "analytics.cross.empty": "No movies with both Douban and TMDB ratings",
    "analytics.top.title": "TOP RATED",
    "analytics.top.empty": "No rated items this year",
    "nav.analytics": "ANALYTICS",
```

- [ ] **Step 2: Add analytics keys to the Chinese dictionary**

Find the line `"showcase.kicker": "展示",` in the `zh` dictionary and add these keys BEFORE it:

```typescript
    // Analytics
    "analytics.kicker": "数据分析 // 洞察",
    "analytics.title": "数据分析",
    "analytics.year": "年份",
    "analytics.overview.completed": "完成",
    "analytics.overview.avg_rating": "均分",
    "analytics.overview.rated": "有评分",
    "analytics.overview.reviewed": "有短评",
    "analytics.overview.total": "库总量",
    "analytics.overview.vs_last_year": "较去年",
    "analytics.monthly.title": "月度完成趋势",
    "analytics.rating.title": "评分分布",
    "analytics.source.title": "来源分布",
    "analytics.source.movies": "电影",
    "analytics.source.games": "游戏",
    "analytics.source.tvshows": "剧集",
    "analytics.cross.title": "跨平台评分对比",
    "analytics.cross.douban": "豆瓣",
    "analytics.cross.tmdb": "TMDB",
    "analytics.cross.empty": "暂无同时有豆瓣和 TMDB 评分的电影",
    "analytics.top.title": "Top 评分榜",
    "analytics.top.empty": "本年暂无评分记录",
    "nav.analytics": "分析",
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd "/Users/zaynzhu/code/claude code/project/pixelreel/frontend" && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd "/Users/zaynzhu/code/claude code/project/pixelreel" && git add frontend/src/stores/i18nStore.ts && git commit -m "feat: 添加 analytics 相关 i18n key"
```

---

### Task 7: Frontend Store and Types

**Files:**
- Create: `frontend/src/stores/analyticsStore.ts`
- Create: `frontend/src/types/analytics.ts`

- [ ] **Step 1: Create the analytics types file**

```typescript
export interface AnalyticsData {
  year: number
  overview: {
    completedThisYear: number
    completedLastYear: number
    avgRatingThisYear: number | null
    ratedThisYear: number
    reviewedThisYear: number
    totalInLibrary: number
  }
  monthlyCompletion: Array<{
    month: string
    movies: number
    games: number
    tvShows: number
  }>
  ratingDistribution: {
    movies: Array<{ rating: number; count: number }>
    games: Array<{ rating: number; count: number }>
    tvShows: Array<{ rating: number; count: number }>
  }
  sourceBreakdown: {
    movies: Array<{ source: string; label: string; count: number }>
    games: Array<{ platform: string; label: string; count: number }>
    tvShows: Array<{ source: string; label: string; count: number }>
  }
  crossPlatformRatings: Array<{
    title: string
    doubanRating: number
    tmdbRating: number
  }>
  topRated: Array<{
    category: string
    id: number
    title: string
    posterUrl: string | null
    rating: number
    shortReview: string | null
    source: string
  }>
}
```

- [ ] **Step 2: Create the analytics store**

```typescript
import { create } from "zustand"
import type { AnalyticsData } from "../types/analytics"
import { apiFetch } from "../api"

type AnalyticsState = {
  data: AnalyticsData | null
  year: number
  loading: boolean
  error: string | null
  setYear: (year: number) => void
  fetchAnalytics: (year?: number) => Promise<void>
}

export const useAnalyticsStore = create<AnalyticsState>((set, get) => ({
  data: null,
  year: new Date().getFullYear(),
  loading: false,
  error: null,

  setYear: (year) => set({ year }),

  fetchAnalytics: async (year) => {
    const y = year ?? get().year
    set({ loading: true, error: null, year: y })
    try {
      const payload = await apiFetch<AnalyticsData>(`/analytics?year=${y}`)
      set({ data: payload, loading: false })
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : "获取分析数据失败",
        loading: false,
      })
    }
  },
}))
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd "/Users/zaynzhu/code/claude code/project/pixelreel/frontend" && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd "/Users/zaynzhu/code/claude code/project/pixelreel" && git add frontend/src/types/analytics.ts frontend/src/stores/analyticsStore.ts && git commit -m "feat: 添加 analytics store 和类型定义"
```

---

### Task 8: OverviewCards Component

**Files:**
- Create: `frontend/src/components/analytics/OverviewCards.tsx`

- [ ] **Step 1: Create OverviewCards**

```typescript
import { useI18nStore } from "../../stores/i18nStore"
import type { AnalyticsData } from "../../types/analytics"

interface Props {
  overview: AnalyticsData["overview"]
}

export function OverviewCards({ overview }: Props) {
  const { t } = useI18nStore()

  const changePercent = overview.completedLastYear > 0
    ? Math.round(((overview.completedThisYear - overview.completedLastYear) / overview.completedLastYear) * 100)
    : overview.completedThisYear > 0 ? 100 : 0

  const cards = [
    {
      label: t("analytics.overview.completed"),
      value: overview.completedThisYear,
      suffix: changePercent !== 0 ? `${changePercent > 0 ? "+" : ""}${changePercent}%` : undefined,
      accent: true,
    },
    {
      label: t("analytics.overview.avg_rating"),
      value: overview.avgRatingThisYear?.toFixed(1) ?? "—",
      suffix: "/5",
      accent: false,
    },
    {
      label: t("analytics.overview.rated"),
      value: overview.ratedThisYear,
      accent: false,
    },
    {
      label: t("analytics.overview.reviewed"),
      value: overview.reviewedThisYear,
      accent: false,
    },
    {
      label: t("analytics.overview.total"),
      value: overview.totalInLibrary,
      accent: false,
    },
  ]

  return (
    <div className="grid grid-cols-5 gap-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className="showcase-panel p-4 flex flex-col items-center justify-center text-center"
        >
          <span className="text-[10px] uppercase tracking-widest" style={{ color: "var(--muted)" }}>
            {card.label}
          </span>
          <span
            className={`showcase-number text-4xl mt-2 ${card.accent ? "" : ""}`}
            style={card.accent ? undefined : { color: "var(--ink)", textShadow: "none" }}
          >
            {typeof card.value === "number" ? card.value.toLocaleString() : card.value}
          </span>
          {card.suffix && (
            <span className="text-[10px] mt-1 font-bold" style={{
              color: card.suffix.startsWith("+") ? "var(--accent)" : card.suffix.startsWith("-") ? "var(--accent-deep)" : "var(--muted)"
            }}>
              {card.suffix}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/zaynzhu/code/claude code/project/pixelreel/frontend" && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd "/Users/zaynzhu/code/claude code/project/pixelreel" && git add frontend/src/components/analytics/OverviewCards.tsx && git commit -m "feat: 添加 OverviewCards 分析总览卡片"
```

---

### Task 9: MonthlyChart Component

**Files:**
- Create: `frontend/src/components/analytics/MonthlyChart.tsx`

- [ ] **Step 1: Create MonthlyChart**

```typescript
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts"
import { useI18nStore } from "../../stores/i18nStore"
import type { AnalyticsData } from "../../types/analytics"

interface Props {
  data: AnalyticsData["monthlyCompletion"]
}

const COLORS = {
  movies: "#d4ff00",
  games: "#ff4400",
  tvShows: "#00d4ff",
}

export function MonthlyChart({ data }: Props) {
  const { t } = useI18nStore()

  return (
    <div className="showcase-panel p-5">
      <div className="section-kicker mb-4">{t("analytics.monthly.title")}</div>
      <div style={{ height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="month"
              tick={{ fill: "#888", fontSize: 10, fontFamily: "JetBrains Mono" }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#888", fontSize: 10, fontFamily: "JetBrains Mono" }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid rgba(212,255,0,0.3)",
                borderRadius: 0,
                fontSize: 11,
                fontFamily: "JetBrains Mono",
                color: "var(--ink)",
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 10, fontFamily: "JetBrains Mono" }}
            />
            <Bar dataKey="movies" name={t("analytics.source.movies")} stackId="a" fill={COLORS.movies} radius={[0, 0, 0, 0]} />
            <Bar dataKey="tvShows" name={t("analytics.source.tvshows")} stackId="a" fill={COLORS.tvShows} />
            <Bar dataKey="games" name={t("analytics.source.games")} stackId="a" fill={COLORS.games} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/zaynzhu/code/claude code/project/pixelreel/frontend" && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd "/Users/zaynzhu/code/claude code/project/pixelreel" && git add frontend/src/components/analytics/MonthlyChart.tsx && git commit -m "feat: 添加 MonthlyChart 月度趋势图"
```

---

### Task 10: RatingChart Component

**Files:**
- Create: `frontend/src/components/analytics/RatingChart.tsx`

- [ ] **Step 1: Create RatingChart**

```typescript
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts"
import { useI18nStore } from "../../stores/i18nStore"
import type { AnalyticsData } from "../../types/analytics"

interface Props {
  data: AnalyticsData["ratingDistribution"]
}

const COLORS = {
  movies: "#d4ff00",
  games: "#ff4400",
  tvShows: "#00d4ff",
}

export function RatingChart({ data }: Props) {
  const { t } = useI18nStore()

  // 合并三个分类为一个数组
  const merged = [1, 2, 3, 4, 5].map((rating) => {
    const movie = data.movies.find((d) => d.rating === rating)
    const game = data.games.find((d) => d.rating === rating)
    const tvShow = data.tvShows.find((d) => d.rating === rating)
    return {
      rating: `${rating}★`,
      movies: movie?.count ?? 0,
      games: game?.count ?? 0,
      tvShows: tvShow?.count ?? 0,
    }
  })

  return (
    <div className="showcase-panel p-5">
      <div className="section-kicker mb-4">{t("analytics.rating.title")}</div>
      <div style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={merged} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="rating"
              tick={{ fill: "#888", fontSize: 10, fontFamily: "JetBrains Mono" }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#888", fontSize: 10, fontFamily: "JetBrains Mono" }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid rgba(212,255,0,0.3)",
                borderRadius: 0,
                fontSize: 11,
                fontFamily: "JetBrains Mono",
                color: "var(--ink)",
              }}
            />
            <Legend wrapperStyle={{ fontSize: 10, fontFamily: "JetBrains Mono" }} />
            <Bar dataKey="movies" name={t("analytics.source.movies")} fill={COLORS.movies} radius={[2, 2, 0, 0]} />
            <Bar dataKey="tvShows" name={t("analytics.source.tvshows")} fill={COLORS.tvShows} radius={[2, 2, 0, 0]} />
            <Bar dataKey="games" name={t("analytics.source.games")} fill={COLORS.games} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/zaynzhu/code/claude code/project/pixelreel/frontend" && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd "/Users/zaynzhu/code/claude code/project/pixelreel" && git add frontend/src/components/analytics/RatingChart.tsx && git commit -m "feat: 添加 RatingChart 评分分布图"
```

---

### Task 11: SourcePieChart Component

**Files:**
- Create: `frontend/src/components/analytics/SourcePieChart.tsx`

- [ ] **Step 1: Create SourcePieChart**

```typescript
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts"
import { useI18nStore } from "../../stores/i18nStore"
import type { AnalyticsData } from "../../types/analytics"

interface Props {
  data: AnalyticsData["sourceBreakdown"]
}

const MOVIE_COLORS = ["#d4ff00", "#aaff00", "#88dd00", "#66bb00", "#448800"]
const GAME_COLORS = ["#ff4400", "#ff6633", "#ff8866", "#ffaa99", "#ffccbb"]
const TV_COLORS = ["#00d4ff", "#33ddff", "#66e6ff", "#99eeff", "#ccf7ff"]

function MiniPie({
  title,
  items,
  colors,
}: {
  title: string
  items: Array<{ label: string; count: number }>
  colors: string[]
}) {
  const total = items.reduce((s, i) => s + i.count, 0)

  return (
    <div className="flex flex-col items-center">
      <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: "var(--muted)" }}>
        {title}
      </div>
      <div style={{ width: 180, height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={items}
              dataKey="count"
              nameKey="label"
              cx="50%"
              cy="50%"
              outerRadius={70}
              innerRadius={35}
              strokeWidth={1}
              stroke="rgba(0,0,0,0.5)"
            >
              {items.map((_, i) => (
                <Cell key={i} fill={colors[i % colors.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid rgba(212,255,0,0.3)",
                borderRadius: 0,
                fontSize: 11,
                fontFamily: "JetBrains Mono",
                color: "var(--ink)",
              }}
              formatter={(value: number) => `${value} (${total > 0 ? Math.round((value / total) * 100) : 0}%)`}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
        {items.map((item, i) => (
          <div key={item.label} className="flex items-center gap-1.5 text-[10px]">
            <div className="w-2 h-2 shrink-0" style={{ background: colors[i % colors.length] }} />
            <span style={{ color: "var(--muted)" }}>{item.label}</span>
            <span className="font-bold ml-auto" style={{ color: "var(--ink)" }}>{item.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function SourcePieChart({ data }: Props) {
  const { t } = useI18nStore()

  return (
    <div className="showcase-panel p-5">
      <div className="section-kicker mb-4">{t("analytics.source.title")}</div>
      <div className="flex justify-around">
        <MiniPie title={t("analytics.source.movies")} items={data.movies} colors={MOVIE_COLORS} />
        <MiniPie title={t("analytics.source.tvshows")} items={data.tvShows} colors={TV_COLORS} />
        <MiniPie title={t("analytics.source.games")} items={data.games} colors={GAME_COLORS} />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/zaynzhu/code/claude code/project/pixelreel/frontend" && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd "/Users/zaynzhu/code/claude code/project/pixelreel" && git add frontend/src/components/analytics/SourcePieChart.tsx && git commit -m "feat: 添加 SourcePieChart 来源分布饼图"
```

---

### Task 12: CrossPlatformChart Component

**Files:**
- Create: `frontend/src/components/analytics/CrossPlatformChart.tsx`

- [ ] **Step 1: Create CrossPlatformChart**

```typescript
import { ScatterChart, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts"
import { useI18nStore } from "../../stores/i18nStore"
import type { AnalyticsData } from "../../types/analytics"

interface Props {
  data: AnalyticsData["crossPlatformRatings"]
}

export function CrossPlatformChart({ data }: Props) {
  const { t } = useI18nStore()

  if (data.length === 0) {
    return (
      <div className="showcase-panel p-5">
        <div className="section-kicker mb-4">{t("analytics.cross.title")}</div>
        <div className="flex items-center justify-center h-[200px]">
          <span className="text-xs uppercase tracking-widest" style={{ color: "var(--muted)" }}>
            {t("analytics.cross.empty")}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="showcase-panel p-5">
      <div className="section-kicker mb-4">{t("analytics.cross.title")}</div>
      <div style={{ height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="doubanRating"
              name={t("analytics.cross.douban")}
              domain={[0, 5]}
              tick={{ fill: "#888", fontSize: 10, fontFamily: "JetBrains Mono" }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }}
              tickLine={false}
              label={{ value: t("analytics.cross.douban"), position: "bottom", fill: "#888", fontSize: 10, fontFamily: "JetBrains Mono" }}
            />
            <YAxis
              dataKey="tmdbRating"
              name={t("analytics.cross.tmdb")}
              domain={[0, 5]}
              tick={{ fill: "#888", fontSize: 10, fontFamily: "JetBrains Mono" }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }}
              tickLine={false}
              label={{ value: t("analytics.cross.tmdb"), angle: -90, position: "insideLeft", fill: "#888", fontSize: 10, fontFamily: "JetBrains Mono" }}
            />
            <Tooltip
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid rgba(212,255,0,0.3)",
                borderRadius: 0,
                fontSize: 11,
                fontFamily: "JetBrains Mono",
                color: "var(--ink)",
              }}
              formatter={(value: number, name: string) => [value.toFixed(1), name]}
              labelFormatter={(label) => ""}
            />
            {/* 对角线参考线：完全一致 */}
            <ReferenceLine
              segment={[{ x: 0, y: 0 }, { x: 5, y: 5 }]}
              stroke="rgba(212,255,0,0.2)"
              strokeDasharray="6 3"
            />
            <Scatter
              data={data}
              fill="#d4ff00"
              opacity={0.7}
              name=""
            >
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
```

Note: Recharts `<Scatter>` doesn't support individual point labels easily. The tooltip shows the title on hover. For the scatter data, each point needs `doubanRating` and `tmdbRating` which come directly from the API response.

The `data` array items already have `doubanRating` and `tmdbRating` as top-level fields, so Recharts can map them directly.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/zaynzhu/code/claude code/project/pixelreel/frontend" && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd "/Users/zaynzhu/code/claude code/project/pixelreel" && git add frontend/src/components/analytics/CrossPlatformChart.tsx && git commit -m "feat: 添加 CrossPlatformChart 跨平台评分散点图"
```

---

### Task 13: TopRatedList Component

**Files:**
- Create: `frontend/src/components/analytics/TopRatedList.tsx`

- [ ] **Step 1: Create TopRatedList**

```typescript
import { useI18nStore } from "../../stores/i18nStore"
import type { AnalyticsData } from "../../types/analytics"
import { ImgWithFallback } from "../ImgWithFallback"

interface Props {
  items: AnalyticsData["topRated"]
}

function categoryIcon(cat: string): string {
  switch (cat) {
    case "movie": return "M"
    case "game": return "G"
    case "tv_show": return "T"
    default: return "?"
  }
}

export function TopRatedList({ items }: Props) {
  const { t } = useI18nStore()

  if (items.length === 0) {
    return (
      <div className="showcase-panel p-5">
        <div className="section-kicker mb-4">{t("analytics.top.title")}</div>
        <div className="flex items-center justify-center h-[120px]">
          <span className="text-xs uppercase tracking-widest" style={{ color: "var(--muted)" }}>
            {t("analytics.top.empty")}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="showcase-panel p-5">
      <div className="section-kicker mb-4">{t("analytics.top.title")}</div>
      <div className="grid grid-cols-5 gap-3">
        {items.map((item, i) => (
          <div
            key={`${item.category}-${item.id}`}
            className="group relative"
            style={{ animation: `poster-enter 0.4s ease-out ${i * 60}ms both` }}
          >
            <div className="showcase-poster" style={{ aspectRatio: "2/3" }}>
              {item.posterUrl ? (
                <ImgWithFallback
                  src={item.posterUrl}
                  alt={item.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center text-[10px] uppercase tracking-wider text-center p-2"
                  style={{ background: "var(--surface-hover)", color: "var(--muted)" }}
                >
                  {item.title}
                </div>
              )}

              {/* 排名角标 */}
              <div
                className="absolute top-1 left-1 w-5 h-5 flex items-center justify-center text-[10px] font-bold"
                style={{
                  background: i < 3 ? "var(--accent)" : "rgba(255,255,255,0.15)",
                  color: i < 3 ? "black" : "var(--muted)",
                }}
              >
                {i + 1}
              </div>

              {/* 分类角标 */}
              <div
                className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center text-[8px] font-bold"
                style={{ background: "rgba(0,0,0,0.6)", color: "var(--accent)" }}
              >
                {categoryIcon(item.category)}
              </div>
            </div>

            <div className="mt-1.5">
              <div className="text-[10px] font-display font-bold truncate" style={{ color: "var(--ink)" }}>
                {item.title}
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-[10px] font-bold" style={{ color: "var(--accent)" }}>
                  {item.rating}★
                </span>
                <span className="text-[9px] uppercase" style={{ color: "var(--muted)" }}>
                  {item.source}
                </span>
              </div>
              {item.shortReview && (
                <div className="text-[9px] mt-0.5 truncate" style={{ color: "var(--muted)" }} title={item.shortReview}>
                  {item.shortReview}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/zaynzhu/code/claude code/project/pixelreel/frontend" && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd "/Users/zaynzhu/code/claude code/project/pixelreel" && git add frontend/src/components/analytics/TopRatedList.tsx && git commit -m "feat: 添加 TopRatedList Top 评分榜"
```

---

### Task 14: AnalyticsPage Container

**Files:**
- Create: `frontend/src/pages/AnalyticsPage.tsx`

- [ ] **Step 1: Create AnalyticsPage**

```typescript
import { useEffect } from "react"
import { useAnalyticsStore } from "../stores/analyticsStore"
import { useI18nStore } from "../stores/i18nStore"
import { OverviewCards } from "../components/analytics/OverviewCards"
import { MonthlyChart } from "../components/analytics/MonthlyChart"
import { RatingChart } from "../components/analytics/RatingChart"
import { SourcePieChart } from "../components/analytics/SourcePieChart"
import { CrossPlatformChart } from "../components/analytics/CrossPlatformChart"
import { TopRatedList } from "../components/analytics/TopRatedList"

export default function AnalyticsPage() {
  const { data, year, loading, error, setYear, fetchAnalytics } = useAnalyticsStore()
  const { t } = useI18nStore()

  useEffect(() => {
    void fetchAnalytics()
  }, [fetchAnalytics])

  const handleYearChange = (delta: number) => {
    const newYear = year + delta
    void fetchAnalytics(newYear)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-sm uppercase tracking-widest animate-pulse" style={{ color: "var(--accent)" }}>
          LOADING...
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-sm uppercase tracking-widest" style={{ color: "var(--accent-deep)" }}>
          ERROR: {error || "No data"}
        </div>
      </div>
    )
  }

  return (
    <div className="analytics-bg flex flex-col gap-4">
      {/* 标题栏 + 年份选择器 */}
      <div className="flex items-center justify-between">
        <div>
          <div className="section-kicker">{t("analytics.kicker")}</div>
          <h1
            className="text-2xl font-display font-bold tracking-tight flex items-center gap-3"
            style={{ color: "var(--ink)" }}
          >
            {t("analytics.title")}
            <span
              className="inline-block w-16 h-px"
              style={{
                background: "linear-gradient(to right, var(--accent), transparent)",
                boxShadow: "0 0 8px rgba(212,255,0,0.3)",
              }}
            />
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            className="text-[10px] uppercase tracking-wider cursor-pointer px-2 py-0.5"
            style={{
              color: "var(--accent)",
              border: "1px solid rgba(212,255,0,0.3)",
              background: "rgba(212,255,0,0.05)",
            }}
            onClick={() => handleYearChange(-1)}
          >
            ←
          </button>
          <span className="showcase-number text-2xl">{year}</span>
          <button
            className="text-[10px] uppercase tracking-wider cursor-pointer px-2 py-0.5"
            style={{
              color: "var(--accent)",
              border: "1px solid rgba(212,255,0,0.3)",
              background: "rgba(212,255,0,0.05)",
            }}
            onClick={() => handleYearChange(1)}
          >
            →
          </button>
        </div>
      </div>

      {/* 总览卡片 */}
      <OverviewCards overview={data.overview} />

      {/* 月度完成趋势 */}
      <MonthlyChart data={data.monthlyCompletion} />

      {/* 评分分布 + 来源饼图 并排 */}
      <div className="grid grid-cols-2 gap-4">
        <RatingChart data={data.ratingDistribution} />
        <SourcePieChart data={data.sourceBreakdown} />
      </div>

      {/* 跨平台评分对比 */}
      <CrossPlatformChart data={data.crossPlatformRatings} />

      {/* Top 评分榜 */}
      <TopRatedList items={data.topRated} />
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/zaynzhu/code/claude code/project/pixelreel/frontend" && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
cd "/Users/zaynzhu/code/claude code/project/pixelreel" && git add frontend/src/pages/AnalyticsPage.tsx && git commit -m "feat: 添加 AnalyticsPage 数据分析页面"
```

---

### Task 15: Wire Up Routing and Navigation

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/AppShell.tsx`

- [ ] **Step 1: Add route in App.tsx**

In `frontend/src/App.tsx`, add the import after the existing page imports:

```typescript
import AnalyticsPage from "./pages/AnalyticsPage";
```

And add the route inside the `<Route>` block, after the showcase route:

```typescript
<Route path="analytics" element={<AnalyticsPage />} />
```

- [ ] **Step 2: Add nav item in AppShell.tsx**

In `frontend/src/components/AppShell.tsx`, add to the `NAV_ITEMS` array after the showcase entry:

```typescript
{ to: "/analytics", label: t("nav.analytics") },
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd "/Users/zaynzhu/code/claude code/project/pixelreel/frontend" && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
cd "/Users/zaynzhu/code/claude code/project/pixelreel" && git add frontend/src/App.tsx frontend/src/components/AppShell.tsx && git commit -m "feat: 注册 /analytics 路由和导航入口"
```

---

### Task 16: Add `analytics-bg` CSS Class

**Files:**
- Modify: `frontend/src/styles.css`

- [ ] **Step 1: Add analytics background class**

In `frontend/src/styles.css`, inside the `@layer components` block (after `.showcase-poster::after`), add:

```css
  .analytics-bg {
    position: relative;
  }
  .analytics-bg::before {
    content: '';
    position: fixed;
    inset: 0;
    background: radial-gradient(
      800px circle at 30% 20%,
      rgba(212,255,0,0.04) 0%,
      transparent 100%
    ),
    radial-gradient(
      600px circle at 70% 80%,
      rgba(0,212,255,0.03) 0%,
      transparent 100%
    );
    pointer-events: none;
    z-index: 0;
  }
  .analytics-bg > * {
    position: relative;
    z-index: 1;
  }
```

- [ ] **Step 2: Commit**

```bash
cd "/Users/zaynzhu/code/claude code/project/pixelreel" && git add frontend/src/styles.css && git commit -m "style: 添加 analytics 页面背景样式"
```

---

### Task 17: End-to-End Smoke Test

**Files:** None (verification only)

- [ ] **Step 1: Start backend**

```bash
cd "/Users/zaynzhu/code/claude code/project/pixelreel/express-backend" && npm run dev &
```

- [ ] **Step 2: Start frontend**

```bash
cd "/Users/zaynzhu/code/claude code/project/pixelreel/frontend" && npm run dev &
```

- [ ] **Step 3: Test the API**

```bash
curl -s "http://localhost:18889/api/analytics?year=2026" | python3 -m json.tool | head -30
```

Expected: JSON with `year: 2026`, `overview`, `monthlyCompletion` (12 entries), `ratingDistribution`, `sourceBreakdown`, `crossPlatformRatings`, `topRated`.

- [ ] **Step 4: Verify frontend loads**

Open `http://localhost:18888/analytics` in browser. Expected:
- Year selector shows 2026 with ← → buttons
- Overview cards show stats
- Monthly chart shows stacked bars
- Rating distribution shows grouped bars
- Source pie charts show 3 donuts
- Cross-platform scatter plot shows dots (if data exists)
- Top rated list shows posters with ratings

- [ ] **Step 5: Test year navigation**

Click ← to go to 2025. Expected: data updates to show 2025 stats. Click → to return to 2026.

- [ ] **Step 6: Stop servers**

```bash
kill %1 %2 2>/dev/null; true
```

---

### Task 18: Final Commit and Documentation Update

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/PROJECT_STATUS.md`
- Modify: `README.md`

- [ ] **Step 1: Update CLAUDE.md route table**

Add to the route table in `CLAUDE.md`:

```
| `/analytics` | `GET /api/analytics?year=` (年度分析数据) |
```

- [ ] **Step 2: Update PROJECT_STATUS.md**

Add to the 已完成功能 section:

```
- [x] 数据分析页面（年度报告、月度趋势、评分分布、来源占比、跨平台评分对比、Top 评分榜）
```

Add to the 当前前端路由 section:

```
- `/analytics`：数据分析页（年度报告 + 习惯洞察）
```

Add to the 关键接口 section:

```
- `GET /api/analytics?year=2026`：年度分析数据（总览、月度趋势、评分分布、来源占比、跨平台评分、Top 评分榜）
```

- [ ] **Step 3: Update README.md**

Add to 已完成功能 list:

```
- 数据分析页（年度报告、月度趋势、评分分布、来源占比、跨平台评分对比、Top 评分榜）
```

Add to 当前前端路由:

```
/analytics           数据分析（年度报告 + 习惯洞察）
```

Add to 主要接口 section after the profile summary:

```
### 数据分析

```text
GET /api/analytics?year=2026   年度分析数据（总览、月度趋势、评分分布、来源占比、跨平台评分、Top 评分榜）
```
```

- [ ] **Step 4: Commit**

```bash
cd "/Users/zaynzhu/code/claude code/project/pixelreel" && git add CLAUDE.md docs/PROJECT_STATUS.md README.md && git commit -m "docs: 添加数据分析页面文档"
```
