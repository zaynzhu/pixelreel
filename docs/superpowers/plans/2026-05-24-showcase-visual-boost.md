# Showcase 视觉效果增强实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 对 Showcase 大屏页面进行全面视觉增强 — 重新布局（统计横条 + 海报为主）+ 赛博朋克视觉效果加强（发光边框、动态背景、数字脉冲、海报增强）。

**Architecture:** 在 `styles.css` 新增 showcase 专用 CSS 类和动画，然后逐个改造 5 个组件使用新样式，最后适配全屏轮播模式。不改路由、不改后端、不改 i18n。

**Tech Stack:** React 18, TailwindCSS, CSS custom properties, CSS animations

---

### Task 1: 添加 CSS 基础 — showcase 专用类和动画

**Files:**
- Modify: `frontend/src/styles.css`

- [ ] **Step 1: 在 `styles.css` 末尾追加 showcase 专用样式**

在文件末尾（第 125 行 `.hover-glitch` 之后）追加以下内容：

```css
/* Showcase 专用样式 */
.showcase-bg {
  position: relative;
}
.showcase-bg::before {
  content: '';
  position: absolute;
  inset: -50%;
  width: 200%;
  height: 200%;
  background: radial-gradient(
    600px circle at 50% 50%,
    rgba(212,255,0,0.06) 0%,
    transparent 100%
  );
  animation: showcase-drift 20s ease-in-out infinite;
  pointer-events: none;
  z-index: 0;
}

@keyframes showcase-drift {
  0%   { transform: translate(-20%, -20%); }
  25%  { transform: translate(20%, -10%); }
  50%  { transform: translate(10%, 20%); }
  75%  { transform: translate(-10%, 10%); }
  100% { transform: translate(-20%, -20%); }
}

.showcase-panel {
  background: var(--surface);
  border: 1px solid rgba(212,255,0,0.25);
  box-shadow:
    0 0 15px rgba(212,255,0,0.12),
    inset 0 0 30px rgba(212,255,0,0.03);
  transition: border-color 0.3s, box-shadow 0.3s;
  position: relative;
  overflow: hidden;
}
.showcase-panel:hover {
  border-color: rgba(212,255,0,0.5);
  box-shadow:
    0 0 25px rgba(212,255,0,0.2),
    inset 0 0 40px rgba(212,255,0,0.05);
}

.showcase-number {
  color: var(--accent);
  font-family: "Syne", sans-serif;
  font-weight: 800;
  letter-spacing: -0.02em;
  text-transform: uppercase;
  text-shadow:
    0 0 20px rgba(212,255,0,0.6),
    0 0 40px rgba(212,255,0,0.3),
    0 0 80px rgba(212,255,0,0.15);
  animation: glow-pulse 3s ease-in-out infinite;
}

@keyframes glow-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.85; }
}

.showcase-poster {
  position: relative;
  overflow: hidden;
  cursor: pointer;
  border: 1px solid var(--line);
  transition: border-color 0.3s, box-shadow 0.3s;
}
.showcase-poster:hover {
  border-color: var(--accent);
  box-shadow: 0 0 15px rgba(212,255,0,0.3);
}
.showcase-poster::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 3px,
    rgba(0,0,0,0.25) 3px,
    rgba(0,0,0,0.25) 4px
  );
}
```

- [ ] **Step 2: 验证**

在浏览器打开任意页面，确认没有 CSS 报错（DevTools Console 无红色错误）。

- [ ] **Step 3: 提交**

```bash
git add frontend/src/styles.css
git commit -m "style: 添加 showcase 专用 CSS 类和动画（发光面板、脉冲数字、动态背景）"
```

---

### Task 2: 改造 ShowcasePage — 新布局 + 动态背景

**Files:**
- Modify: `frontend/src/pages/ShowcasePage.tsx`

- [ ] **Step 1: 替换整个 ShowcasePage.tsx**

将文件完整替换为以下内容：

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

  useEffect(() => {
    if (mode !== "slideshow") return
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % SLIDES.length)
    }, SLIDE_INTERVAL)
    return () => clearInterval(timer)
  }, [mode])

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
    <div className="showcase-bg flex flex-col h-[calc(100vh-80px)]">
      {/* 顶部控制栏 */}
      <div className="flex items-center justify-between mb-4 relative z-10">
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
        <div className="flex-1 flex flex-col gap-4 min-h-0 relative z-10">
          {/* 顶部：统计横条 */}
          <StatsPanel summary={summary} />

          {/* 底部：海报 + 时间线/随机 */}
          <div className="flex-1 flex gap-4 min-h-0">
            {/* 左侧海报墙 60% */}
            <div className="w-[60%] min-w-0">
              <PosterCarousel items={summary.recentItems} />
            </div>

            {/* 右侧 40%：时间线 + 随机推荐堆叠 */}
            <div className="w-[40%] min-w-0 flex flex-col gap-4">
              <div className="flex-1 min-h-0">
                <TimelineMini items={summary.recentItems} />
              </div>
              <div className="h-[200px]">
                <RandomPick />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 relative min-h-0 z-10">
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

- [ ] **Step 2: 验证**

Run: `cd frontend && npm run dev`
在浏览器打开 `http://localhost:18888/showcase`，确认：
- 顶部有统计横条（不再是 2×2 网格）
- 左侧大海报墙，右侧时间线+随机推荐堆叠
- 背景有缓慢移动的绿色光晕

- [ ] **Step 3: 提交**

```bash
git add frontend/src/pages/ShowcasePage.tsx
git commit -m "style: ShowcasePage 改为三区域布局（统计横条+海报为主+右侧堆叠）"
```

---

### Task 3: 改造 StatsPanel — 横条布局 + 发光数字

**Files:**
- Modify: `frontend/src/components/showcase/StatsPanel.tsx`

- [ ] **Step 1: 替换整个 StatsPanel.tsx**

将文件完整替换为以下内容：

```tsx
import type { ProfileSummary } from "../../types/profile"
import { useI18nStore } from "../../stores/i18nStore"

interface StatsPanelProps {
  summary: ProfileSummary
  compact?: boolean
}

export function StatsPanel({ summary, compact }: StatsPanelProps) {
  const { t } = useI18nStore()
  const { overview, ratings } = summary
  const completed = overview.completedMovies + overview.completedGames + overview.completedTvShows

  if (compact) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-8">
        <div className="section-kicker">{t("showcase.stats.kicker")}</div>
        <div className="showcase-number text-9xl">
          {overview.totalRecords}
        </div>
        <div className="text-sm uppercase tracking-widest" style={{ color: "var(--muted)" }}>
          {t("showcase.stats.total")}
        </div>
        <div className="flex gap-8 mt-4">
          {[
            { label: t("showcase.stats.completed"), value: completed },
            { label: t("showcase.stats.avg_rating"), value: ratings.overallAverage?.toFixed(1) ?? "—" },
          ].map((item) => (
            <div key={item.label} className="text-center">
              <div className="showcase-number text-5xl">{item.value}</div>
              <div className="text-xs uppercase tracking-widest mt-2" style={{ color: "var(--muted)" }}>
                {item.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="showcase-panel p-5 flex items-center gap-8" style={{ height: 120 }}>
      <div className="section-kicker shrink-0">{t("showcase.stats.kicker")}</div>

      {/* 大数字区 */}
      <div className="flex items-center gap-8">
        <div className="text-center">
          <div className="showcase-number text-6xl leading-none">
            {overview.totalRecords}
          </div>
          <div className="text-[10px] uppercase tracking-widest mt-1" style={{ color: "var(--muted)" }}>
            {t("showcase.stats.total")}
          </div>
        </div>

        <div className="text-center">
          <div className="showcase-number text-4xl leading-none">
            {completed}
          </div>
          <div className="text-[10px] uppercase tracking-widest mt-1" style={{ color: "var(--muted)" }}>
            {t("showcase.stats.completed")}
          </div>
        </div>

        <div className="text-center">
          <div className="showcase-number text-4xl leading-none">
            {ratings.overallAverage?.toFixed(1) ?? "—"}
          </div>
          <div className="text-[10px] uppercase tracking-widest mt-1" style={{ color: "var(--muted)" }}>
            {t("showcase.stats.avg_rating")}
          </div>
        </div>
      </div>

      {/* 分隔线 */}
      <div className="w-px h-16" style={{ background: "var(--line)" }} />

      {/* 分类均分 */}
      <div className="flex gap-4 ml-auto">
        {[
          { label: t("showcase.stats.movies"), avg: ratings.movieAverage },
          { label: t("showcase.stats.tvshows"), avg: ratings.tvShowAverage },
          { label: t("showcase.stats.games"), avg: ratings.gameAverage },
        ].map((item) => (
          <div
            key={item.label}
            className="flex flex-col items-center justify-center px-4 py-2"
            style={{ border: "1px solid var(--line)", background: "var(--surface-hover)" }}
          >
            <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--muted)" }}>
              {item.label}
            </span>
            <span className="text-lg font-display font-bold mt-1" style={{ color: "var(--accent)" }}>
              {item.avg?.toFixed(1) ?? "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 验证**

在浏览器 `http://localhost:18888/showcase` 确认：
- 统计区域是顶部横条，不再是竖排卡片
- 大数字有明显的绿色发光效果
- 分类均分卡片在右侧

- [ ] **Step 3: 提交**

```bash
git add frontend/src/components/showcase/StatsPanel.tsx
git commit -m "style: StatsPanel 改为横条布局，数字使用发光脉冲效果"
```

---

### Task 4: 改造 PosterCarousel — 4×2 网格 + 增强海报效果

**Files:**
- Modify: `frontend/src/components/showcase/PosterCarousel.tsx`

- [ ] **Step 1: 替换整个 PosterCarousel.tsx**

将文件完整替换为以下内容：

```tsx
import { useState, useEffect } from "react"
import type { RecentRecordItem } from "../../types/profile"
import type { LibraryRecord } from "../../types/library"
import { useI18nStore } from "../../stores/i18nStore"
import { ImgWithFallback } from "../ImgWithFallback"
import TimelinePopup from "../TimelinePopup"

interface PosterCarouselProps {
  items: RecentRecordItem[]
  compact?: boolean
}

export function PosterCarousel({ items, compact }: PosterCarouselProps) {
  const { t } = useI18nStore()
  const [batchIndex, setBatchIndex] = useState(0)
  const [selectedRecord, setSelectedRecord] = useState<LibraryRecord | null>(null)

  const batchSize = compact ? 15 : 8
  const cols = compact ? 5 : 4
  const rows = compact ? 3 : 2
  const totalBatches = Math.ceil(items.length / batchSize) || 1

  useEffect(() => {
    const timer = setInterval(() => {
      setBatchIndex((prev) => (prev + 1) % totalBatches)
    }, 5000)
    return () => clearInterval(timer)
  }, [totalBatches])

  const batch = items.slice(batchIndex * batchSize, batchIndex * batchSize + batchSize)

  const handlePosterClick = (item: RecentRecordItem) => {
    const record = {
      id: item.id,
      category: item.category,
      title: item.title,
      posterUrl: item.posterUrl ?? null,
      status: item.status,
      rating: item.rating ?? null,
      createdAt: item.createdAt,
      updatedAt: item.createdAt,
    } as LibraryRecord
    setSelectedRecord(record)
  }

  return (
    <>
      <div className="showcase-panel h-full flex flex-col p-5">
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
              className="showcase-poster group"
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

- [ ] **Step 2: 验证**

在浏览器确认：
- 海报区域是 4×2 网格（8 张），比之前更大
- 海报有扫描线效果
- hover 时海报恢复色彩 + 发光边框

- [ ] **Step 3: 提交**

```bash
git add frontend/src/components/showcase/PosterCarousel.tsx
git commit -m "style: PosterCarousel 改为 4×2 网格，海报使用增强扫描线和发光边框"
```

---

### Task 5: 改造 TimelineMini — 柱子发光

**Files:**
- Modify: `frontend/src/components/showcase/TimelineMini.tsx`

- [ ] **Step 1: 修改 TimelineMini 的面板类名和柱子发光**

将 `dash-card` 替换为 `showcase-panel`，给柱子加 `box-shadow`：

在第 28 行，将：
```tsx
    <div className="dash-card h-full flex flex-col p-5 relative overflow-hidden">
```
替换为：
```tsx
    <div className="showcase-panel h-full flex flex-col p-5">
```

在第 49-52 行，将：
```tsx
                    boxShadow: isLatest ? "0 0 10px rgba(255,68,0,0.4)" : "none",
```
替换为：
```tsx
                    boxShadow: isLatest
                      ? "0 0 15px rgba(255,68,0,0.5), 0 0 30px rgba(255,68,0,0.2)"
                      : "0 0 8px rgba(212,255,0,0.15)",
```

- [ ] **Step 2: 验证**

在浏览器确认：
- 时间线面板有发光边框
- 柱子有发光效果，最新年份更亮
- 面板正确填充右侧上半部分

- [ ] **Step 3: 提交**

```bash
git add frontend/src/components/showcase/TimelineMini.tsx
git commit -m "style: TimelineMini 面板发光边框，柱子加 glow 效果"
```

---

### Task 6: 改造 RandomPick — 适配新容器

**Files:**
- Modify: `frontend/src/components/showcase/RandomPick.tsx`

- [ ] **Step 1: 修改 RandomPick 的面板类名和海报样式**

在第 42 行，将：
```tsx
      <div className="dash-card h-full flex flex-col p-5 relative overflow-hidden">
```
替换为：
```tsx
      <div className="showcase-panel h-full flex flex-col p-5">
```

在第 48-55 行，将海报容器的内联样式替换为 `showcase-poster` 类。将：
```tsx
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
```
替换为：
```tsx
            <div
              className="showcase-poster group"
              style={{
                width: compact ? 120 : 140,
                height: compact ? 168 : 196,
                borderColor: "var(--accent)",
              }}
              onClick={() => setSelectedRecord(record)}
            >
```

在第 69-74 行，删除手动添加的扫描线 div（`showcase-poster` 的 `::after` 已包含）。将：
```tsx
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.15) 3px, rgba(0,0,0,0.15) 4px)",
                }}
              />
```
替换为（删除这 6 行）：
```tsx
```

- [ ] **Step 2: 验证**

在浏览器确认：
- 随机推荐面板有发光边框
- 海报有扫描线 + hover 发光效果
- 面板正确填充右侧下半部分（200px 高度）

- [ ] **Step 3: 提交**

```bash
git add frontend/src/components/showcase/RandomPick.tsx
git commit -m "style: RandomPick 使用发光面板和增强海报效果"
```

---

### Task 7: 适配全屏轮播模式

**Files:**
- Modify: `frontend/src/pages/ShowcasePage.tsx`

- [ ] **Step 1: 修改全屏轮播模式的样式**

在 ShowcasePage.tsx 的全屏轮播部分（第 95-103 行），当前全屏模式直接渲染组件但没有特殊布局。需要确保全屏模式下海报组件使用 5×3 网格。

检查 `PosterCarousel` 的 `compact` prop：当前全屏模式没传 `compact`，而 `PosterCarousel` 默认 `compact` 为 `undefined` 时使用 4×2。全屏模式需要 5×3。

在第 99 行，将：
```tsx
            {SLIDES[currentSlide] === "posters" && <PosterCarousel items={summary.recentItems} />}
```
替换为：
```tsx
            {SLIDES[currentSlide] === "posters" && <PosterCarousel items={summary.recentItems} compact />}
```

同时确保全屏模式下 RandomPick 传了 `compact`（已经是 `compact`，OK）。

全屏模式下给内容区加 showcase-panel 的全屏样式。在第 96 行，将：
```tsx
        <div className="flex-1 relative min-h-0 z-10">
```
替换为：
```tsx
        <div className="flex-1 relative min-h-0 z-10 showcase-panel">
```

- [ ] **Step 2: 验证**

在浏览器点击右上角的轮播模式按钮，确认：
- 统计 slide：大数字 + 发光效果
- 海报 slide：5×3 网格（15 张海报）
- 时间线 slide：全屏柱状图
- 随机推荐 slide：大海报居中
- 每个 slide 有发光面板边框
- 点击 Esc 回到网格模式

- [ ] **Step 3: 提交**

```bash
git add frontend/src/pages/ShowcasePage.tsx
git commit -m "style: 全屏轮播模式适配新视觉效果"
```
