# Showcase 大屏页面实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 PixelReel 新增 `/showcase` 大屏展示页面，支持网格模式和全屏轮播模式。

**Architecture:** 新建 `ShowcasePage.tsx` 作为容器，内含 4 个子组件（StatsPanel、PosterCarousel、TimelineMini、RandomPick）和 1 个控制组件（ShowcaseControls）。数据复用 `profileStore`，随机推荐需要后端新增 `/api/library/random` 接口。

**Tech Stack:** React 18 + Zustand + TailwindCSS + Express + Prisma

---

## 文件结构

### 新建文件
- `express-backend/src/services/LibraryService.ts` — 新增 `getRandomRecord()` 函数
- `express-backend/src/routes/library.ts` — 新增 `GET /random` 路由
- `frontend/src/components/showcase/StatsPanel.tsx`
- `frontend/src/components/showcase/PosterCarousel.tsx`
- `frontend/src/components/showcase/TimelineMini.tsx`
- `frontend/src/components/showcase/RandomPick.tsx`
- `frontend/src/components/showcase/ShowcaseControls.tsx`
- `frontend/src/pages/ShowcasePage.tsx`

### 修改文件
- `frontend/src/stores/i18nStore.ts` — 添加 showcase 相关 i18n keys
- `frontend/src/App.tsx` — 添加 `/showcase` 路由
- `frontend/src/components/AppShell.tsx` — 添加 SHOWCASE 导航链接

---

## Task 1: 后端 — 随机记录接口

**Files:**
- Modify: `express-backend/src/services/LibraryService.ts`
- Modify: `express-backend/src/routes/library.ts`

- [ ] **Step 1: 在 LibraryService 中添加 getRandomRecord 函数**

在 `express-backend/src/services/LibraryService.ts` 的 `updateRecord` 函数之前添加：

```ts
export async function getRandomRecord(): Promise<LibraryRecordResponse | null> {
  const db = getDb();

  const [movieCount, gameCount, tvCount] = await Promise.all([
    db.movie.count(),
    db.game.count(),
    db.tvShow.count(),
  ]);

  const total = movieCount + gameCount + tvCount;
  if (total === 0) return null;

  const offset = Math.floor(Math.random() * total);

  if (offset < movieCount) {
    const movie = (await db.movie.findMany({ skip: offset, take: 1 }))[0];
    return movie ? toMovieRecord(movie) : null;
  } else if (offset < movieCount + gameCount) {
    const game = (await db.game.findMany({ skip: offset - movieCount, take: 1 }))[0];
    return game ? toGameRecord(game) : null;
  } else {
    const show = (await db.tvShow.findMany({ skip: offset - movieCount - gameCount, take: 1 }))[0];
    return show ? toTvShowRecord(show) : null;
  }
}
```

- [ ] **Step 2: 在 library 路由中添加 GET /random 端点**

在 `express-backend/src/routes/library.ts` 的 `GET /` 路由之后、`PATCH /:category/:id` 路由之前添加：

```ts
// GET /api/library/random — 随机获取一条记录
router.get('/random', async (req: Request, res: Response) => {
  try {
    const record = await getRandomRecord();
    if (!record) {
      res.status(404).json({ error: 'No records found' });
      return;
    }
    res.json(record);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
```

同时更新顶部 import：
```ts
import { listRecords, updateRecord, getRandomRecord } from '../services/LibraryService';
```

- [ ] **Step 3: 验证后端编译通过**

Run: `cd "/Users/zaynzhu/code/claude code/project/pixelreel/express-backend" && npx tsc --noEmit`
Expected: 无错误输出

- [ ] **Step 4: 提交**

```bash
cd "/Users/zaynzhu/code/claude code/project/pixelreel"
git add express-backend/src/services/LibraryService.ts express-backend/src/routes/library.ts
git commit -m "feat: 添加 GET /api/library/random 随机记录接口"
```

---

## Task 2: 前端 — i18n 国际化 keys

**Files:**
- Modify: `frontend/src/stores/i18nStore.ts`

- [ ] **Step 1: 添加 showcase 相关 i18n keys**

在 `frontend/src/stores/i18nStore.ts` 的 `dictionaries.en` 中添加（在 `nav.settings` 之后）：

```ts
    // Showcase
    "nav.showcase": "SHOWCASE",
    "showcase.kicker": "SHOWCASE // EXHIBITION",
    "showcase.title": "MEDIA SHOWCASE",
    "showcase.desc": "/// Displaying aggregated media telemetry and entertainment records.",
    "showcase.stats.kicker": "STATS",
    "showcase.stats.total": "TOTAL RECORDS",
    "showcase.stats.completed": "COMPLETED",
    "showcase.stats.avg_rating": "AVG RATING",
    "showcase.stats.movies": "MOVIES",
    "showcase.stats.tvshows": "TV SHOWS",
    "showcase.stats.games": "GAMES",
    "showcase.posters.kicker": "POSTERS",
    "showcase.posters.auto_rotate": "Auto-rotating · 5s/batch",
    "showcase.timeline.kicker": "TIMELINE",
    "showcase.timeline.by_year": "Records by year",
    "showcase.random.kicker": "PICK",
    "showcase.random.btn": "🎲 RANDOM PICK",
    "showcase.random.empty": "No records yet",
    "showcase.random.click_detail": "Click to view details",
    "showcase.mode.grid": "GRID VIEW",
    "showcase.mode.slideshow": "SLIDESHOW",
```

在 `dictionaries.zh` 中添加对应的中文翻译：

```ts
    // Showcase
    "nav.showcase": "展示",
    "showcase.kicker": "展示 // 展览",
    "showcase.title": "媒体展厅",
    "showcase.desc": "/// 正在展示聚合的媒体数据和娱乐记录。",
    "showcase.stats.kicker": "统计",
    "showcase.stats.total": "总记录",
    "showcase.stats.completed": "已完成",
    "showcase.stats.avg_rating": "平均评分",
    "showcase.stats.movies": "电影",
    "showcase.stats.tvshows": "剧集",
    "showcase.stats.games": "游戏",
    "showcase.posters.kicker": "海报",
    "showcase.posters.auto_rotate": "自动轮播 · 5秒/批",
    "showcase.timeline.kicker": "时间线",
    "showcase.timeline.by_year": "按年份统计",
    "showcase.random.kicker": "推荐",
    "showcase.random.btn": "🎲 随机推荐",
    "showcase.random.empty": "暂无记录",
    "showcase.random.click_detail": "点击查看详情",
    "showcase.mode.grid": "网格视图",
    "showcase.mode.slideshow": "幻灯片",
```

- [ ] **Step 2: 验证前端编译通过**

Run: `cd "/Users/zaynzhu/code/claude code/project/pixelreel/frontend" && npx tsc --noEmit`
Expected: 无错误输出

- [ ] **Step 3: 提交**

```bash
cd "/Users/zaynzhu/code/claude code/project/pixelreel"
git add frontend/src/stores/i18nStore.ts
git commit -m "feat: 添加 Showcase 页面 i18n 国际化 keys"
```

---

## Task 3: 前端 — 路由与导航

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/AppShell.tsx`

- [ ] **Step 1: 在 App.tsx 中添加 /showcase 路由**

在 `frontend/src/App.tsx` 中，先添加 import：
```ts
import ShowcasePage from "./pages/ShowcasePage";
```

在 `<AppShell />` 的子路由中，`activity` 路由之后添加：
```tsx
<Route path="showcase" element={<ShowcasePage />} />
```

- [ ] **Step 2: 在 AppShell.tsx 中添加 SHOWCASE 导航链接**

在 `frontend/src/components/AppShell.tsx` 的 `NAV_ITEMS` 数组中，在 `activity` 之后、`settings` 之前添加：
```ts
{ to: "/showcase", label: t("nav.showcase") },
```

- [ ] **Step 3: 创建占位页面**

创建 `frontend/src/pages/ShowcasePage.tsx`：
```tsx
export default function ShowcasePage() {
  return <div>Showcase — WIP</div>;
}
```

- [ ] **Step 4: 验证编译和路由可用**

Run: `cd "/Users/zaynzhu/code/claude code/project/pixelreel/frontend" && npx tsc --noEmit`
Expected: 无错误输出

- [ ] **Step 5: 提交**

```bash
cd "/Users/zaynzhu/code/claude code/project/pixelreel"
git add frontend/src/App.tsx frontend/src/components/AppShell.tsx frontend/src/pages/ShowcasePage.tsx
git commit -m "feat: 添加 /showcase 路由和导航链接"
```

---

## Task 4: 前端 — StatsPanel 组件

**Files:**
- Create: `frontend/src/components/showcase/StatsPanel.tsx`

- [ ] **Step 1: 创建 StatsPanel 组件**

```tsx
import type { ProfileSummary } from "../../types/profile"
import { StarRating } from "../StarRating"
import { useI18nStore } from "../../stores/i18nStore"

interface StatsPanelProps {
  summary: ProfileSummary
  compact?: boolean
}

export function StatsPanel({ summary, compact }: StatsPanelProps) {
  const { t } = useI18nStore()
  const { overview, ratings } = summary

  if (compact) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6">
        <div className="section-kicker">{t("showcase.stats.kicker")}</div>
        <div
          className="text-8xl font-display font-bold tracking-tighter"
          style={{
            color: "var(--accent)",
            textShadow: "0 0 30px rgba(212,255,0,0.5)",
          }}
        >
          {overview.totalRecords}
        </div>
        <div className="text-sm uppercase tracking-widest" style={{ color: "var(--muted)" }}>
          {t("showcase.stats.total")}
        </div>
      </div>
    )
  }

  return (
    <div className="dash-card h-full flex flex-col justify-between p-5 relative overflow-hidden">
      <div className="section-kicker">{t("showcase.stats.kicker")}</div>

      <div className="flex flex-col items-center justify-center flex-1 gap-4">
        <div
          className="text-7xl font-display font-bold tracking-tighter"
          style={{
            color: "var(--accent)",
            textShadow: "0 0 30px rgba(212,255,0,0.5)",
          }}
        >
          {overview.totalRecords}
        </div>
        <div className="text-xs uppercase tracking-widest" style={{ color: "var(--muted)" }}>
          {t("showcase.stats.total")}
        </div>

        <div className="flex gap-6 mt-2">
          <div className="text-center">
            <div className="text-2xl font-display font-bold" style={{ color: "var(--accent)" }}>
              {overview.completedMovies + overview.completedGames + overview.completedTvShows}
            </div>
            <div className="text-[10px] uppercase tracking-widest" style={{ color: "var(--muted)" }}>
              {t("showcase.stats.completed")}
            </div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-display font-bold" style={{ color: "var(--accent)" }}>
              {ratings.overallAverage?.toFixed(1) ?? "—"}
            </div>
            <div className="text-[10px] uppercase tracking-widest" style={{ color: "var(--muted)" }}>
              {t("showcase.stats.avg_rating")}
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-3 mt-4">
        {[
          { label: t("showcase.stats.movies"), avg: ratings.movieAverage },
          { label: t("showcase.stats.tvshows"), avg: ratings.tvShowAverage },
          { label: t("showcase.stats.games"), avg: ratings.gameAverage },
        ].map((item) => (
          <div
            key={item.label}
            className="flex-1 flex items-center gap-2 px-3 py-2"
            style={{ border: "1px solid var(--line)", background: "var(--surface-hover)" }}
          >
            <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--muted)" }}>
              {item.label}
            </span>
            <span className="ml-auto text-sm font-display font-bold" style={{ color: "var(--accent)" }}>
              {item.avg?.toFixed(1) ?? "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 验证编译通过**

Run: `cd "/Users/zaynzhu/code/claude code/project/pixelreel/frontend" && npx tsc --noEmit`
Expected: 无错误输出

- [ ] **Step 3: 提交**

```bash
cd "/Users/zaynzhu/code/claude code/project/pixelreel"
git add frontend/src/components/showcase/StatsPanel.tsx
git commit -m "feat: 添加 Showcase StatsPanel 组件"
```

---

## Task 5: 前端 — PosterCarousel 组件

**Files:**
- Create: `frontend/src/components/showcase/PosterCarousel.tsx`

- [ ] **Step 1: 创建 PosterCarousel 组件**

```tsx
import { useState, useEffect, useCallback } from "react"
import type { RecentRecordItem } from "../../types/profile"
import type { LibraryRecord } from "../../types/library"
import { useI18nStore } from "../../stores/i18nStore"
import { ImgWithFallback } from "../ImgWithFallback"
import TimelinePopup from "../TimelinePopup"
import { apiFetch } from "../../api"

interface PosterCarouselProps {
  items: RecentRecordItem[]
  compact?: boolean
}

export function PosterCarousel({ items, compact }: PosterCarouselProps) {
  const { t } = useI18nStore()
  const [batchIndex, setBatchIndex] = useState(0)
  const [selectedRecord, setSelectedRecord] = useState<LibraryRecord | null>(null)

  const batchSize = compact ? 6 : 15
  const cols = compact ? 3 : 5
  const rows = compact ? 2 : 3
  const totalBatches = Math.ceil(items.length / batchSize) || 1

  useEffect(() => {
    const timer = setInterval(() => {
      setBatchIndex((prev) => (prev + 1) % totalBatches)
    }, 5000)
    return () => clearInterval(timer)
  }, [totalBatches])

  const batch = items.slice(batchIndex * batchSize, batchIndex * batchSize + batchSize)

  const handlePosterClick = useCallback(async (item: RecentRecordItem) => {
    try {
      const record = await apiFetch<LibraryRecord>(`/search/${item.category === "tv_show" ? "tv-shows" : item.category}s/${item.id}`)
      setSelectedRecord(record)
    } catch {
      // 忽略详情获取失败
    }
  }, [])

  return (
    <>
      <div className="dash-card h-full flex flex-col p-5 relative overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <div className="section-kicker">{t("showcase.posters.kicker")}</div>
          <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--muted)" }}>
            {t("showcase.posters.auto_rotate")}
          </div>
        </div>

        <div
          className="flex-1 grid gap-2"
          style={{
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gridTemplateRows: `repeat(${rows}, 1fr)`,
          }}
        >
          {batch.map((item) => (
            <div
              key={`${item.category}-${item.id}`}
              className="relative overflow-hidden cursor-pointer group"
              style={{ border: "1px solid var(--line)" }}
              onClick={() => handlePosterClick(item)}
            >
              {item.posterUrl ? (
                <ImgWithFallback
                  src={item.posterUrl}
                  alt={item.title}
                  className="w-full h-full object-cover grayscale opacity-60 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-300"
                  fallback={<PosterPlaceholder title={item.title} />}
                />
              ) : (
                <PosterPlaceholder title={item.title} />
              )}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.15) 3px, rgba(0,0,0,0.15) 4px)",
                }}
              />
            </div>
          ))}
        </div>
      </div>

      <TimelinePopup record={selectedRecord} onClose={() => setSelectedRecord(null)} />
    </>
  )
}

function PosterPlaceholder({ title }: { title: string }) {
  return (
    <div
      className="w-full h-full flex items-center justify-center text-xs uppercase tracking-wider text-center p-2"
      style={{ background: "var(--surface-hover)", color: "var(--muted)" }}
    >
      {title}
    </div>
  )
}
```

- [ ] **Step 2: 验证编译通过**

Run: `cd "/Users/zaynzhu/code/claude code/project/pixelreel/frontend" && npx tsc --noEmit`
Expected: 无错误输出

- [ ] **Step 3: 提交**

```bash
cd "/Users/zaynzhu/code/claude code/project/pixelreel"
git add frontend/src/components/showcase/PosterCarousel.tsx
git commit -m "feat: 添加 Showcase PosterCarousel 组件"
```

---

## Task 6: 前端 — TimelineMini 组件

**Files:**
- Create: `frontend/src/components/showcase/TimelineMini.tsx`

- [ ] **Step 1: 创建 TimelineMini 组件**

```tsx
import { useMemo } from "react"
import type { RecentRecordItem } from "../../types/profile"
import { useI18nStore } from "../../stores/i18nStore"

interface TimelineMiniProps {
  items: RecentRecordItem[]
  compact?: boolean
}

export function TimelineMini({ items, compact }: TimelineMiniProps) {
  const { t } = useI18nStore()

  const yearData = useMemo(() => {
    const counts: Record<string, number> = {}
    items.forEach((item) => {
      const year = new Date(item.createdAt).getFullYear().toString()
      counts[year] = (counts[year] || 0) + 1
    })
    const entries = Object.entries(counts)
      .map(([year, count]) => ({ year, count }))
      .sort((a, b) => a.year.localeCompare(b.year))
    return entries
  }, [items])

  const maxCount = Math.max(...yearData.map((d) => d.count), 1)

  return (
    <div className="dash-card h-full flex flex-col p-5 relative overflow-hidden">
      <div className="section-kicker mb-3">{t("showcase.timeline.kicker")}</div>

      <div className="flex-1 flex flex-col justify-center">
        <div className="text-[10px] uppercase tracking-wider mb-4" style={{ color: "var(--muted)" }}>
          {t("showcase.timeline.by_year")}
        </div>

        <div className={`flex items-end gap-1 ${compact ? "h-32" : "h-48"}`}>
          {yearData.map((d, i) => {
            const height = (d.count / maxCount) * 100
            const isLatest = i === yearData.length - 1
            return (
              <div key={d.year} className="flex-1 flex flex-col items-center gap-1">
                <div className="text-[10px] font-display font-bold" style={{ color: isLatest ? "var(--accent-deep)" : "var(--accent)" }}>
                  {d.count}
                </div>
                <div
                  className="w-full transition-all duration-500"
                  style={{
                    height: `${height}%`,
                    background: isLatest ? "var(--accent-deep)" : "var(--accent)",
                    opacity: isLatest ? 1 : 0.6,
                    boxShadow: isLatest ? "0 0 10px rgba(255,68,0,0.4)" : "none",
                  }}
                />
              </div>
            )
          })}
        </div>

        <div className="flex gap-1 mt-1">
          {yearData.map((d, i) => (
            <div
              key={d.year}
              className="flex-1 text-center text-[9px] uppercase tracking-wider"
              style={{ color: i === yearData.length - 1 ? "var(--accent-deep)" : "var(--muted)" }}
            >
              {d.year}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 验证编译通过**

Run: `cd "/Users/zaynzhu/code/claude code/project/pixelreel/frontend" && npx tsc --noEmit`
Expected: 无错误输出

- [ ] **Step 3: 提交**

```bash
cd "/Users/zaynzhu/code/claude code/project/pixelreel"
git add frontend/src/components/showcase/TimelineMini.tsx
git commit -m "feat: 添加 Showcase TimelineMini 组件"
```

---

## Task 7: 前端 — RandomPick 组件

**Files:**
- Create: `frontend/src/components/showcase/RandomPick.tsx`

- [ ] **Step 1: 创建 RandomPick 组件**

```tsx
import { useState, useEffect, useCallback } from "react"
import type { LibraryRecord } from "../../types/library"
import { useI18nStore } from "../../stores/i18nStore"
import { ImgWithFallback } from "../ImgWithFallback"
import { StarRating } from "../StarRating"
import TimelinePopup from "../TimelinePopup"
import { apiFetch } from "../../api"

interface RandomPickProps {
  compact?: boolean
}

export function RandomPick({ compact }: RandomPickProps) {
  const { t } = useI18nStore()
  const [record, setRecord] = useState<LibraryRecord | null>(null)
  const [selectedRecord, setSelectedRecord] = useState<LibraryRecord | null>(null)

  const fetchRandom = useCallback(async () => {
    try {
      const data = await apiFetch<LibraryRecord>("/library/random")
      setRecord(data)
    } catch {
      setRecord(null)
    }
  }, [])

  useEffect(() => {
    void fetchRandom()
  }, [fetchRandom])

  useEffect(() => {
    if (!compact) {
      const timer = setInterval(() => {
        void fetchRandom()
      }, 10000)
      return () => clearInterval(timer)
    }
  }, [compact, fetchRandom])

  return (
    <>
      <div className="dash-card h-full flex flex-col p-5 relative overflow-hidden">
        <div className="section-kicker mb-3">{t("showcase.random.kicker")}</div>

        {record ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div
              className="relative overflow-hidden cursor-pointer group"
              style={{
                width: compact ? 100 : 160,
                height: compact ? 140 : 220,
                border: "1px solid var(--accent)",
                boxShadow: "0 0 20px rgba(212,255,0,0.2)",
              }}
              onClick={() => setSelectedRecord(record)}
            >
              {record.posterUrl ? (
                <ImgWithFallback
                  src={record.posterUrl}
                  alt={record.title}
                  className="w-full h-full object-cover grayscale opacity-60 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-300"
                  fallback={<div className="w-full h-full flex items-center justify-center text-xs" style={{ background: "var(--surface-hover)", color: "var(--muted)" }}>{record.title}</div>}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs" style={{ background: "var(--surface-hover)", color: "var(--muted)" }}>
                  {record.title}
                </div>
              )}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.15) 3px, rgba(0,0,0,0.15) 4px)",
                }}
              />
            </div>

            <div className="text-center">
              <div className="text-sm font-display font-bold" style={{ color: "var(--ink)" }}>
                {record.title}
              </div>
              {record.rating != null && (
                <div className="flex items-center justify-center gap-1 mt-1">
                  <StarRating value={record.rating} />
                  <span className="text-xs ml-1" style={{ color: "var(--muted)" }}>
                    {record.rating} / 5
                  </span>
                </div>
              )}
            </div>

            <button
              className="brutal-btn-accent text-xs px-4 py-2"
              onClick={fetchRandom}
            >
              {t("showcase.random.btn")}
            </button>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-sm uppercase tracking-wider" style={{ color: "var(--muted)" }}>
              {t("showcase.random.empty")}
            </div>
          </div>
        )}
      </div>

      <TimelinePopup record={selectedRecord} onClose={() => setSelectedRecord(null)} />
    </>
  )
}
```

- [ ] **Step 2: 验证编译通过**

Run: `cd "/Users/zaynzhu/code/claude code/project/pixelreel/frontend" && npx tsc --noEmit`
Expected: 无错误输出

- [ ] **Step 3: 提交**

```bash
cd "/Users/zaynzhu/code/claude code/project/pixelreel"
git add frontend/src/components/showcase/RandomPick.tsx
git commit -m "feat: 添加 Showcase RandomPick 组件"
```

---

## Task 8: 前端 — ShowcaseControls 组件

**Files:**
- Create: `frontend/src/components/showcase/ShowcaseControls.tsx`

- [ ] **Step 1: 创建 ShowcaseControls 组件**

```tsx
import { useI18nStore } from "../../stores/i18nStore"

interface ShowcaseControlsProps {
  mode: "grid" | "slideshow"
  onToggleMode: () => void
  currentSlide?: number
  totalSlides?: number
  onJumpToSlide?: (index: number) => void
}

export function ShowcaseControls({
  mode,
  onToggleMode,
  currentSlide = 0,
  totalSlides = 4,
  onJumpToSlide,
}: ShowcaseControlsProps) {
  const { t } = useI18nStore()

  return (
    <div className="flex items-center gap-4">
      {mode === "slideshow" && (
        <div className="flex gap-2">
          {Array.from({ length: totalSlides }).map((_, i) => (
            <button
              key={i}
              className="w-2 h-2 rounded-full transition-all duration-300 hover-glitch"
              style={{
                background: i === currentSlide ? "var(--accent)" : "var(--line)",
                boxShadow: i === currentSlide ? "0 0 8px rgba(212,255,0,0.5)" : "none",
              }}
              onClick={() => onJumpToSlide?.(i)}
            />
          ))}
        </div>
      )}

      <button
        className="brutal-btn text-[10px] px-3 py-1.5 uppercase tracking-wider hover-glitch"
        onClick={onToggleMode}
        title={mode === "grid" ? t("showcase.mode.slideshow") : t("showcase.mode.grid")}
      >
        {mode === "grid" ? "⛶" : "⊞"}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: 验证编译通过**

Run: `cd "/Users/zaynzhu/code/claude code/project/pixelreel/frontend" && npx tsc --noEmit`
Expected: 无错误输出

- [ ] **Step 3: 提交**

```bash
cd "/Users/zaynzhu/code/claude code/project/pixelreel"
git add frontend/src/components/showcase/ShowcaseControls.tsx
git commit -m "feat: 添加 Showcase ShowcaseControls 组件"
```

---

## Task 9: 前端 — ShowcasePage 容器

**Files:**
- Modify: `frontend/src/pages/ShowcasePage.tsx`

- [ ] **Step 1: 实现 ShowcasePage 容器**

```tsx
import { useState, useEffect, useCallback } from "react"
import { useProfileStore } from "../stores/profileStore"
import { useI18nStore } from "../stores/i18nStore"
import { StatsPanel } from "../components/showcase/StatsPanel"
import { PosterCarousel } from "../components/showcase/PosterCarousel"
import { TimelineMini } from "../components/showcase/TimelineMini"
import { RandomPick } from "../components/showcase/RandomPick"
import { ShowcaseControls } from "../components/showcase/ShowcaseControls"

const SLIDES = ["stats", "posters", "timeline", "random"] as const
const SLIDE_INTERVAL = 10000

export default function ShowcasePage() {
  const { summary, loading, error, fetchSummary } = useProfileStore()
  const { t } = useI18nStore()
  const [mode, setMode] = useState<"grid" | "slideshow">("grid")
  const [currentSlide, setCurrentSlide] = useState(0)

  useEffect(() => {
    void fetchSummary()
  }, [fetchSummary])

  // 全屏轮播定时器
  useEffect(() => {
    if (mode !== "slideshow") return
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % SLIDES.length)
    }, SLIDE_INTERVAL)
    return () => clearInterval(timer)
  }, [mode])

  // Esc 退出轮播
  useEffect(() => {
    if (mode !== "slideshow") return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMode("grid")
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [mode])

  const toggleMode = useCallback(() => {
    setMode((prev) => (prev === "grid" ? "slideshow" : "grid"))
    setCurrentSlide(0)
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-sm uppercase tracking-widest animate-pulse" style={{ color: "var(--accent)" }}>
          LOADING...
        </div>
      </div>
    )
  }

  if (error || !summary) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-sm uppercase tracking-widest" style={{ color: "var(--accent-deep)" }}>
          ERROR: {error || "No data"}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[calc(100vh-80px)]">
      {/* 顶部控制栏 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="section-kicker">{t("showcase.kicker")}</div>
          <h1 className="text-2xl font-display font-bold tracking-tight" style={{ color: "var(--ink)" }}>
            {t("showcase.title")}
          </h1>
        </div>
        <ShowcaseControls
          mode={mode}
          onToggleMode={toggleMode}
          currentSlide={currentSlide}
          totalSlides={SLIDES.length}
          onJumpToSlide={setCurrentSlide}
        />
      </div>

      {/* 内容区域 */}
      {mode === "grid" ? (
        <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-4 min-h-0">
          <StatsPanel summary={summary} />
          <PosterCarousel items={summary.recentItems} />
          <TimelineMini items={summary.recentItems} />
          <RandomPick />
        </div>
      ) : (
        <div className="flex-1 relative min-h-0">
          {/* 全屏轮播内容 */}
          <div className="absolute inset-0 transition-all duration-500" style={{ opacity: 1, transform: "scale(1)" }}>
            {SLIDES[currentSlide] === "stats" && <StatsPanel summary={summary} compact />}
            {SLIDES[currentSlide] === "posters" && <PosterCarousel items={summary.recentItems} />}
            {SLIDES[currentSlide] === "timeline" && <TimelineMini items={summary.recentItems} />}
            {SLIDES[currentSlide] === "random" && <RandomPick compact />}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 验证编译通过**

Run: `cd "/Users/zaynzhu/code/claude code/project/pixelreel/frontend" && npx tsc --noEmit`
Expected: 无错误输出

- [ ] **Step 3: 提交**

```bash
cd "/Users/zaynzhu/code/claude code/project/pixelreel"
git add frontend/src/pages/ShowcasePage.tsx
git commit -m "feat: 实现 ShowcasePage 大屏展示页面"
```

---

## Task 10: 端到端验证

- [ ] **Step 1: 启动后端并测试随机接口**

Run: `cd "/Users/zaynzhu/code/claude code/project/pixelreel/express-backend" && npm run dev &`

等后端启动后：
Run: `curl -s http://localhost:18889/api/library/random | head -c 200`
Expected: 返回一条 JSON 记录（含 id, category, title 等字段）

- [ ] **Step 2: 启动前端并验证页面**

Run: `cd "/Users/zaynzhu/code/claude code/project/pixelreel/frontend" && npm run dev &`

浏览器访问 `http://localhost:18888/showcase`，验证：
- 导航栏出现 SHOWCASE 链接
- 网格模式下 4 个区块正常显示
- 海报每 5 秒自动轮换
- 随机推荐显示并可点击"再来一个"
- 切换到全屏轮播模式正常工作
- Esc 可退出轮播模式
- 点击海报弹出 TimelinePopup

- [ ] **Step 3: 提交最终状态**

```bash
cd "/Users/zaynzhu/code/claude code/project/pixelreel"
git add -A
git commit -m "feat: Showcase 大屏页面完整实现"
```
