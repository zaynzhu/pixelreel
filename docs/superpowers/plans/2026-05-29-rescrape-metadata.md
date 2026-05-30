# 重新刮削元数据功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在记录库卡片上添加"重新刮削"功能，允许用户搜索并替换错误的外部元数据。

**Architecture:** 在卡片右上角添加刷新按钮，点击弹出模态框，用户可搜索并选择正确的元数据来源，点击结果后替换外部元数据（保留用户个人数据）。

**Tech Stack:** React 18, Zustand, TailwindCSS, Lucide Icons

---

## 文件结构

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/stores/i18nStore.ts` | 修改 | 添加 i18n key |
| `frontend/src/components/RescrapeModal.tsx` | 新增 | 弹窗组件 |
| `frontend/src/pages/LibraryPage.tsx` | 修改 | 添加按钮和弹窗状态 |

---

### Task 1: 添加 i18n key

**Files:**
- Modify: `frontend/src/stores/i18nStore.ts`

- [ ] **Step 1: 添加英文 i18n key**

在 `dictionaries.en` 中添加以下 key（在 `"lib.edit.success"` 之后）：

```typescript
    // Rescrape
    "lib.rescrape.btn": "RESCRAPE",
    "lib.rescrape.title": "RESCRAPE METADATA",
    "lib.rescrape.search_placeholder": "Enter search query...",
    "lib.rescrape.source": "SOURCE",
    "lib.rescrape.searching": "SEARCHING...",
    "lib.rescrape.search": "SEARCH",
    "lib.rescrape.no_results": "NO RESULTS FOUND",
    "lib.rescrape.updating": "UPDATING...",
    "lib.rescrape.success": "METADATA UPDATED",
    "lib.rescrape.failed": "UPDATE FAILED",
    "lib.rescrape.detail_loading": "LOADING DETAIL...",
```

- [ ] **Step 2: 添加中文 i18n key**

在 `dictionaries.zh` 中添加以下 key（在 `"lib.edit.success"` 之后）：

```typescript
    // Rescrape
    "lib.rescrape.btn": "重新刮削",
    "lib.rescrape.title": "重新刮削元数据",
    "lib.rescrape.search_placeholder": "输入搜索关键词...",
    "lib.rescrape.source": "来源",
    "lib.rescrape.searching": "搜索中...",
    "lib.rescrape.search": "搜索",
    "lib.rescrape.no_results": "未找到结果",
    "lib.rescrape.updating": "更新中...",
    "lib.rescrape.success": "元数据已更新",
    "lib.rescrape.failed": "更新失败",
    "lib.rescrape.detail_loading": "加载详情中...",
```

- [ ] **Step 3: 提交**

```bash
cd /Users/zaynzhu/code/claude\ code/project/pixelreel
git add frontend/src/stores/i18nStore.ts
git commit -m "feat: 添加重新刮削功能的 i18n key"
```

---

### Task 2: 创建 RescrapeModal 组件

**Files:**
- Create: `frontend/src/components/RescrapeModal.tsx`

- [ ] **Step 1: 创建 RescrapeModal 组件骨架**

创建 `frontend/src/components/RescrapeModal.tsx`：

```tsx
import { useState, useEffect, useRef } from "react"
import { RotateCw, Search, X, Star } from "lucide-react"
import { useI18nStore } from "../stores/i18nStore"
import { apiFetch } from "../api"
import { ImgWithFallback } from "./ImgWithFallback"
import type { LibraryRecord, LibraryCategory } from "../types/library"

// 搜索来源配置
const MOVIE_PROVIDERS = ["tmdb", "omdb", "douban", "imdb", "trakt"]
const TV_SHOW_PROVIDERS = ["tmdb", "douban"]
const GAME_PROVIDERS = ["rawg", "steam"]

interface SearchResult {
  provider: string
  title: string
  posterUrl?: string | null
  releaseDate?: string | null
  overview?: string | null
  voteAverage?: number | null
  // 外部 ID
  tmdbId?: number | null
  imdbId?: string | null
  doubanId?: string | null
  traktId?: string | null
  rawgId?: number | null
  steamAppId?: number | null
}

interface RescrapeModalProps {
  record: LibraryRecord
  onClose: () => void
  onUpdated: () => void
}

export function RescrapeModal({ record, onClose, onUpdated }: RescrapeModalProps) {
  const { t } = useI18nStore()
  const [query, setQuery] = useState(record.title)
  const [selectedProviders, setSelectedProviders] = useState<string[]>([])
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // 根据记录类型获取可用来源
  const availableProviders = record.category === "movie"
    ? MOVIE_PROVIDERS
    : record.category === "tv_show"
    ? TV_SHOW_PROVIDERS
    : GAME_PROVIDERS

  // 初始化选中所有来源
  useEffect(() => {
    setSelectedProviders(availableProviders)
  }, [record.category])

  // 自动聚焦搜索框
  useEffect(() => {
    searchInputRef.current?.focus()
  }, [])

  // 切换来源选中状态
  const toggleProvider = (provider: string) => {
    setSelectedProviders(prev =>
      prev.includes(provider)
        ? prev.filter(p => p !== provider)
        : [...prev, provider]
    )
  }

  // 执行搜索
  const handleSearch = async () => {
    if (!query.trim() || selectedProviders.length === 0) return

    setSearching(true)
    setError(null)
    setResults([])

    try {
      const endpoint = record.category === "movie"
        ? "/api/search/movies"
        : record.category === "tv_show"
        ? "/api/search/tv-shows"
        : "/api/search/games"

      const params = new URLSearchParams({
        query: query.trim(),
        providers: selectedProviders.join(","),
      })

      const data = await apiFetch<{ results: SearchResult[] }>(`${endpoint}?${params}`)
      setResults(data.results || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : t("lib.rescrape.failed"))
    } finally {
      setSearching(false)
    }
  }

  // 选择搜索结果并更新记录
  const handleSelectResult = async (result: SearchResult) => {
    setUpdating(true)
    setError(null)

    try {
      // 1. 获取详情
      let detail: any = null
      const category = record.category

      if (category === "movie" || category === "tv_show") {
        if (result.tmdbId) {
          detail = await apiFetch(`/api/search/tmdb/${result.tmdbId}`)
        } else if (result.doubanId) {
          detail = await apiFetch(`/api/search/douban/${result.doubanId}`)
        }
      } else if (category === "game") {
        if (result.rawgId) {
          detail = await apiFetch(`/api/search/rawg/${result.rawgId}`)
        } else if (result.steamAppId) {
          detail = await apiFetch(`/api/search/steam/${result.steamAppId}`)
        }
      }

      // 2. 构建更新数据（保留用户个人数据）
      const updateData: any = {
        // 保留用户数据
        status: record.status,
        rating: record.rating,
        shortReview: record.shortReview,
        // 更新外部元数据
        title: detail?.title || result.title,
        posterUrl: detail?.posterUrl || result.posterUrl,
        overview: detail?.overview || result.overview,
      }

      // 根据类别添加特定字段
      if (category === "movie" || category === "tv_show") {
        updateData.tmdbId = detail?.tmdbId || result.tmdbId
        updateData.tmdbTitle = detail?.tmdbTitle || result.title
        updateData.tmdbPosterUrl = detail?.tmdbPosterUrl || result.posterUrl
        updateData.tmdbReleaseDate = detail?.tmdbReleaseDate || result.releaseDate
        updateData.tmdbOverview = detail?.tmdbOverview || result.overview
        updateData.tmdbVoteAverage = detail?.tmdbVoteAverage || result.voteAverage
        updateData.tmdbPopularity = detail?.tmdbPopularity
        updateData.tmdbGenreIds = detail?.tmdbGenreIds
        updateData.imdbId = detail?.imdbId || result.imdbId
        updateData.doubanId = detail?.doubanId || result.doubanId

        if (category === "movie") {
          updateData.releaseDate = detail?.releaseDate || result.releaseDate
        } else {
          updateData.firstAirDate = detail?.firstAirDate || result.releaseDate
        }
      } else {
        // Game
        updateData.rawgId = detail?.rawgId || result.rawgId
        updateData.steamAppId = detail?.steamAppId || result.steamAppId
      }

      // 3. 调用更新 API
      const updateEndpoint = category === "movie"
        ? `/api/movies/${record.id}`
        : category === "tv_show"
        ? `/api/tv-shows/${record.id}`
        : `/api/games/${record.id}`

      await apiFetch(updateEndpoint, {
        method: "PUT",
        body: JSON.stringify(updateData),
      })

      onUpdated()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : t("lib.rescrape.failed"))
    } finally {
      setUpdating(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl max-h-[80vh] bg-[var(--surface)] border border-[var(--line)] overflow-hidden">
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--line)]">
          <div className="flex items-center gap-3">
            <RotateCw className="w-5 h-5 text-[var(--accent)]" />
            <h2 className="font-display text-lg text-white uppercase">
              {t("lib.rescrape.title")}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--surface-hover)] transition-colors"
          >
            <X className="w-5 h-5 text-[var(--muted)]" />
          </button>
        </div>

        {/* 搜索区域 */}
        <div className="p-6 border-b border-[var(--line)]">
          {/* 搜索框 */}
          <div className="flex gap-3">
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder={t("lib.rescrape.search_placeholder")}
              className="flex-1 tech-input"
            />
            <button
              onClick={handleSearch}
              disabled={searching || !query.trim() || selectedProviders.length === 0}
              className="brutal-btn-accent px-6"
            >
              {searching ? t("lib.rescrape.searching") : t("lib.rescrape.search")}
            </button>
          </div>

          {/* 来源选择 */}
          <div className="mt-4">
            <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--muted)]">
              {t("lib.rescrape.source")}:
            </span>
            <div className="flex flex-wrap gap-2 mt-2">
              {availableProviders.map((provider) => (
                <button
                  key={provider}
                  onClick={() => toggleProvider(provider)}
                  className={`px-3 py-1.5 text-xs uppercase tracking-wider transition-colors ${
                    selectedProviders.includes(provider)
                      ? "bg-[var(--accent)] text-black font-bold"
                      : "border border-[var(--line)] text-[var(--muted)] hover:border-white"
                  }`}
                >
                  {provider.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 错误提示 */}
        {error && (
          <div className="px-6 py-3 border-l-4 border-red-500 bg-red-500/10 text-xs text-red-400 font-bold uppercase">
            [ERR] {error}
          </div>
        )}

        {/* 搜索结果 */}
        <div className="overflow-y-auto max-h-[calc(80vh-280px)]">
          {results.length > 0 ? (
            <div className="divide-y divide-[var(--line)]">
              {results.map((result, index) => (
                <button
                  key={`${result.provider}-${index}`}
                  onClick={() => handleSelectResult(result)}
                  disabled={updating}
                  className="w-full flex gap-4 p-4 text-left hover:bg-[var(--surface-hover)] transition-colors"
                >
                  {/* 海报 */}
                  <div className="w-16 h-24 overflow-hidden bg-[#0a0a0a] border border-[var(--line)] flex-shrink-0">
                    <ImgWithFallback
                      src={result.posterUrl}
                      alt={result.title}
                      className="w-full h-full object-cover"
                      fallback={
                        <div className="flex items-center justify-center w-full h-full">
                          <span className="text-lg font-bold opacity-20">
                            {result.title.charAt(0).toUpperCase()}
                          </span>
                        </div>
                      }
                    />
                  </div>

                  {/* 信息 */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-display text-white uppercase truncate">
                      {result.title}
                    </h3>
                    {result.releaseDate && (
                      <p className="mt-1 text-[10px] text-[var(--muted)] uppercase">
                        {result.releaseDate}
                      </p>
                    )}
                    {result.overview && (
                      <p className="mt-2 text-xs text-[var(--muted)] line-clamp-2">
                        {result.overview}
                      </p>
                    )}
                  </div>

                  {/* 评分和来源 */}
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    <span className="neo-badge-accent text-[10px]">
                      {result.provider.toUpperCase()}
                    </span>
                    {result.voteAverage != null && (
                      <div className="flex items-center gap-1">
                        <Star className="w-3 h-3 text-[var(--accent)] fill-[var(--accent)]" />
                        <span className="text-sm text-white">
                          {result.voteAverage.toFixed(1)}
                        </span>
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : !searching && query.trim() ? (
            <div className="p-8 text-center text-[10px] uppercase tracking-widest text-[var(--muted)]">
              {t("lib.rescrape.no_results")}
            </div>
          ) : null}
        </div>

        {/* 更新中提示 */}
        {updating && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="flex items-center gap-3 px-6 py-4 bg-[var(--surface)] border border-[var(--line)]">
              <RotateCw className="w-5 h-5 text-[var(--accent)] animate-spin" />
              <span className="text-sm text-white uppercase">
                {t("lib.rescrape.updating")}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 提交**

```bash
cd /Users/zaynzhu/code/claude\ code/project/pixelreel
git add frontend/src/components/RescrapeModal.tsx
git commit -m "feat: 创建 RescrapeModal 组件"
```

---

### Task 3: 修改 LibraryPage 集成重新刮削功能

**Files:**
- Modify: `frontend/src/pages/LibraryPage.tsx`

- [ ] **Step 1: 添加 import 和 state**

在 `LibraryPage.tsx` 顶部添加 import：

```typescript
import { RotateCw } from "lucide-react"
import { RescrapeModal } from "../components/RescrapeModal"
```

在组件内部添加 state（在 `const [showHistory, setShowHistory] = useState(false)` 之后）：

```typescript
const [rescrapeRecord, setRescrapeRecord] = useState<LibraryRecord | null>(null)
```

- [ ] **Step 2: 在卡片上添加刷新按钮**

在卡片的 `<button>` 元素内部，`{active && (` 之前添加刷新按钮：

```tsx
{/* 重新刮削按钮 */}
<button
  type="button"
  onClick={(e) => {
    e.stopPropagation()
    setRescrapeRecord(record)
  }}
  className="absolute top-2 right-2 p-2 bg-[var(--surface)] border border-[var(--line)] opacity-0 group-hover:opacity-100 transition-opacity hover:border-[var(--accent)] hover:text-[var(--accent)] z-10"
  title={t("lib.rescrape.btn")}
>
  <RotateCw className="w-4 h-4" />
</button>
```

- [ ] **Step 3: 在页面底部添加 RescrapeModal**

在 `</div>` 结束标签之前（页面最底部），添加弹窗渲染：

```tsx
{/* 重新刮削弹窗 */}
{rescrapeRecord && (
  <RescrapeModal
    record={rescrapeRecord}
    onClose={() => setRescrapeRecord(null)}
    onUpdated={() => {
      void fetchRecords()
      setRescrapeRecord(null)
    }}
  />
)}
```

- [ ] **Step 4: 提交**

```bash
cd /Users/zaynzhu/code/claude\ code/project/pixelreel
git add frontend/src/pages/LibraryPage.tsx
git commit -m "feat: 在记录库卡片上集成重新刮削功能"
```

---

## 验证清单

1. ✅ 卡片 hover 时右上角显示刷新按钮
2. ✅ 点击按钮弹出搜索弹窗
3. ✅ 搜索框自动填充记录标题
4. ✅ 用户可选择/取消搜索来源
5. ✅ 搜索结果正确展示（海报、标题、评分、来源）
6. ✅ 点击结果后调用详情 API 获取完整元数据
7. ✅ 调用更新 API 覆盖外部元数据
8. ✅ 用户个人数据（状态、评分、短评）保留
9. ✅ 弹窗关闭后卡片显示更新
10. ✅ i18n 中英文正常显示
