# 数据分析页面设计文档

> **目标：** 为 PixelReel 新建独立 `/analytics` 页面，提供年度报告、习惯洞察、跨平台评分对比等数据分析能力。
>
> **MVP 范围：** 年度报告 + 习惯趋势 + 跨平台评分对比，全部在一个页面内完成。

## 技术选型

| 项目 | 选择 | 理由 |
|------|------|------|
| 图表库 | Recharts | React 原生、声明式、SVG 渲染、自定义样式灵活 |
| 后端 | 新增 `/api/analytics` | 与 profile/summary 分离，避免拖慢仪表盘 |
| 数据源 | 复用现有 Movie/TvShow/Game 表 | 不改 schema，纯查询聚合 |

## API 设计

### `GET /api/analytics?year=2026`

年份参数可选，默认当年。返回该年度的全部分析数据。

```typescript
interface AnalyticsResponse {
  year: number

  // 总览卡片
  overview: {
    completedThisYear: number    // 本年完成数（updatedAt 落在该年且 status=DONE）
    completedLastYear: number    // 上年完成数（用于对比）
    avgRatingThisYear: number | null  // 本年评分均值（updatedAt 落在该年的记录）
    ratedThisYear: number        // 本年有评分的记录数
    reviewedThisYear: number     // 本年有短评的记录数
    totalInLibrary: number       // 库中总记录数（不过滤年份）
  }

  // 月度完成趋势（12 个月）
  monthlyCompletion: Array<{
    month: string   // "01" ~ "12"
    movies: number
    games: number
    tvShows: number
  }>

  // 评分分布（1-5 星）
  ratingDistribution: {
    movies: Array<{ rating: number; count: number }>   // rating: 1~5
    games: Array<{ rating: number; count: number }>
    tvShows: Array<{ rating: number; count: number }>
  }

  // 来源/平台分布
  sourceBreakdown: {
    movies: Array<{ source: string; label: string; count: number }>   // TMDB/豆瓣/IMDb/Trakt/手动
    games: Array<{ platform: string; label: string; count: number }>  // Steam/RAWG/PSN/Xbox/手动
    tvShows: Array<{ source: string; label: string; count: number }>
  }

  // 跨平台评分对比（仅电影，需同时有 doubanRating 和 tmdbRating）
  crossPlatformRatings: Array<{
    title: string
    doubanRating: number     // 豆瓣原始 1-5 星
    tmdbRating: number       // TMDB 换算为 1-5 星（原 vote_average / 2）
  }>

  // Top 评分榜（本年 updatedAt 落在该年，按 rating 降序，限 10 条）
  topRated: Array<{
    category: string     // "movie" | "game" | "tv_show"
    id: number
    title: string
    posterUrl: string | null
    rating: number
    shortReview: string | null
    source: string       // 来源标签
  }>
}
```

### 时间字段说明

- **月度完成趋势**：使用 `updatedAt` 作为"完成时间"。当用户将状态改为 DONE 时，`updatedAt` 会被 Prisma 自动更新。这是现有数据中最接近"完成时间"的字段。
- **年份筛选**：所有带"本年"前缀的字段都按 `updatedAt` 落在 `{year}-01-01` ~ `{year}-12-31` 范围过滤。
- **跨平台评分**：不过滤年份，取全库中同时有 `doubanRating` 和 `tmdbVoteAverage` 的记录。

### 后端实现

**文件：**
- `express-backend/src/routes/analytics.ts` — 路由，注册到 `routes/index.ts`
- `express-backend/src/services/AnalyticsService.ts` — 数据聚合逻辑
- `express-backend/src/dto/analytics.ts` — 类型定义

**核心逻辑：**
1. 查询 Movie、TvShow、Game 全量数据（与 ProfileSummaryService 相同模式）
2. 按年份过滤（updatedAt 字段）
3. 计算各维度聚合
4. 跨平台评分：遍历 Movie 表，筛选 `doubanRating IS NOT NULL AND tmdbVoteAverage IS NOT NULL`，TMDB 评分除以 2 换算为 5 星制

## 前端设计

### 路由

| 前端 | 后端 |
|------|------|
| `/analytics` | `GET /api/analytics?year=2026` |

### 页面结构

```
┌─────────────────────────────────────────────────┐
│  [年份选择器 ← 2026 →]    ANALYTICS / 数据分析   │
├─────────────────────────────────────────────────┤
│  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐      │
│  │完成  │ │评分  │ │有评分│ │有短评│ │库总量│      │
│  │ 42  │ │ 4.2 │ │ 38  │ │ 25  │ │ 280│      │
│  │↑12% │ │     │ │     │ │     │ │     │      │
│  └─────┘ └─────┘ └─────┘ └─────┘ └─────┘      │
├─────────────────────────────────────────────────┤
│  月度完成趋势（堆叠柱状图）                        │
│  ████                                            │
│  ████ ████                                       │
│  ████ ████ ████        ████                      │
│  01   02   03   04   05   06  ...  12            │
├────────────────────┬────────────────────────────┤
│  评分分布（分组柱状图）│  来源/平台占比（饼图）      │
│  █ █               │      ╱╲                    │
│  █ █ █             │    ╱    ╲                  │
│  █ █ █ █           │   │ 豆瓣  │                │
│  1 2 3 4 5         │    ╲ TMDB╱                 │
│  ■电影 ■游戏 ■剧集  │      ╲╱                    │
├────────────────────┴────────────────────────────┤
│  跨平台评分对比（散点图）                          │
│  每个点 = 一部电影，x=豆瓣评分，y=TMDB评分         │
│  对角线 = 完全一致参考线                           │
├─────────────────────────────────────────────────┤
│  Top 10 评分榜（海报 + 标题 + 评分 + 短评）        │
└─────────────────────────────────────────────────┘
```

### 组件拆分

**文件：**
- `frontend/src/pages/AnalyticsPage.tsx` — 页面容器，年份选择 + 数据获取
- `frontend/src/components/analytics/OverviewCards.tsx` — 总览卡片（完成数、评分均值、与去年对比）
- `frontend/src/components/analytics/MonthlyChart.tsx` — 月度完成堆叠柱状图
- `frontend/src/components/analytics/RatingChart.tsx` — 评分分布分组柱状图
- `frontend/src/components/analytics/SourcePieChart.tsx` — 来源/平台饼图
- `frontend/src/components/analytics/CrossPlatformChart.tsx` — 跨平台评分散点图
- `frontend/src/components/analytics/TopRatedList.tsx` — Top 评分榜
- `frontend/src/stores/analyticsStore.ts` — Zustand store

### 视觉风格

延续赛博朋克主题：

- **主色调**：`--accent: #d4ff00`（高亮）、`--accent-deep: #ff4400`（对比色）
- **图表配色**：
  - 电影：`#d4ff00`（accent）
  - 游戏：`#ff4400`（accent-deep）
  - 剧集：`#00d4ff`（新增青色）
- **Recharts 自定义**：`<Bar>` 使用 `fill` 属性、`<Pie>` 使用 `stroke` 发光效果
- **面板**：复用 `.showcase-panel` 样式（发光边框 + 背景）
- **数字**：复用 `.showcase-number` 样式（脉冲发光）
- **响应式**：图表区域使用 CSS Grid，评分分布和饼图并排，散点图独占一行

### 国际化

新增 key（`i18nStore.ts`）：

```
analytics.title          — "数据分析" / "Analytics"
analytics.kicker         — "ANALYTICS" / "ANALYTICS"
analytics.year           — "年份" / "Year"
analytics.overview.completed — "完成" / "Completed"
analytics.overview.avg_rating — "均分" / "Avg Rating"
analytics.overview.rated  — "有评分" / "Rated"
analytics.overview.reviewed — "有短评" / "Reviewed"
analytics.overview.total  — "库总量" / "Total"
analytics.overview.vs_last_year — "较去年" / "vs Last Year"
analytics.monthly.title   — "月度完成趋势" / "Monthly Completion"
analytics.rating.title    — "评分分布" / "Rating Distribution"
analytics.source.title    — "来源分布" / "Source Breakdown"
analytics.cross.title     — "跨平台评分对比" / "Cross-Platform Ratings"
analytics.cross.douban    — "豆瓣评分" / "Douban Rating"
analytics.cross.tmdb      — "TMDB 评分" / "TMDB Rating"
analytics.top.title       — "Top 评分榜" / "Top Rated"
```

## 文件清单

### 新建

| 文件 | 职责 |
|------|------|
| `express-backend/src/dto/analytics.ts` | AnalyticsResponse 类型定义 |
| `express-backend/src/services/AnalyticsService.ts` | 分析数据聚合 |
| `express-backend/src/routes/analytics.ts` | 路由 |
| `frontend/src/pages/AnalyticsPage.tsx` | 页面容器 |
| `frontend/src/components/analytics/OverviewCards.tsx` | 总览卡片 |
| `frontend/src/components/analytics/MonthlyChart.tsx` | 月度趋势图 |
| `frontend/src/components/analytics/RatingChart.tsx` | 评分分布图 |
| `frontend/src/components/analytics/SourcePieChart.tsx` | 来源饼图 |
| `frontend/src/components/analytics/CrossPlatformChart.tsx` | 跨平台散点图 |
| `frontend/src/components/analytics/TopRatedList.tsx` | Top 评分榜 |
| `frontend/src/stores/analyticsStore.ts` | Zustand store |

### 修改

| 文件 | 改动 |
|------|------|
| `express-backend/src/routes/index.ts` | 注册 analytics 路由 |
| `frontend/src/stores/i18nStore.ts` | 添加 analytics 相关 i18n key |
| `frontend/src/components/AppShell.tsx` | 导航菜单添加 /analytics 入口 |
| `package.json` (frontend) | 添加 recharts 依赖 |

## 不做的事（YAGNI）

- **不做** 类型/genre 分析 — schema 没有结构化 genre 字段，提取成本高
- **不做** 推荐系统 — 需要协同过滤或内容分析，超出 MVP
- **不做** 导出 PDF/图片 — Recharts 不原生支持，需要额外库
- **不做** 实时更新 — 数据按需查询，不做 WebSocket 推送
- **不做** 多年对比视图 — 单年选择器足够，多年对比增加 UI 复杂度
