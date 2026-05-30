# 重新刮削元数据功能设计

## 概述

在记录库页面（`/library`）的卡片上添加"重新刮削"功能，允许用户搜索并替换错误的外部元数据。

## 背景

现有刮削（元数据抓取）有时不准确：
- 豆瓣导入的记录可能匹配到错误的 TMDB 条目
- 海报、评分等元数据可能缺失或错误
- 用户需要手动修正的机会

## 设计

### 交互流程

1. 卡片右上角添加"刷新"图标按钮（hover 时显示）
2. 点击按钮弹出模态框
3. 弹窗中搜索并选择正确的元数据
4. 点击搜索结果后替换外部元数据，保留用户个人数据

### 卡片按钮

- 图标：`RotateCw`（刷新图标）
- 位置：卡片右上角
- 显示：仅 hover 时显示（`opacity-0 group-hover:opacity-100`）
- 事件：点击打开弹窗，阻止卡片选中（`e.stopPropagation()`）

### 弹窗结构

```
┌─────────────────────────────────────────────┐
│  重新刮削元数据                          [X] │
├─────────────────────────────────────────────┤
│  ┌─────────────────────────────┐ [搜索]     │
│  │ {自动填充记录标题，可修改}   │            │
│  └─────────────────────────────┘            │
│                                             │
│  来源: [✓] TMDB  [✓] 豆瓣  [ ] OMDb  [ ] Trakt │
│                                             │
│  ┌─────────────────────────────────────────┐│
│  │ 搜索结果列表                            ││
│  │ ┌─────┐ 标题                评分 8.5    ││
│  │ │海报 │ 简介...             来源: TMDB  ││
│  │ └─────┘                                ││
│  │ ┌─────┐ 标题2               评分 9.0    ││
│  │ │海报2│ 简介2...            来源: 豆瓣   ││
│  │ └─────┘                                ││
│  └─────────────────────────────────────────┘│
└─────────────────────────────────────────────┘
```

### 搜索来源

| 记录类型 | 可选来源 |
|----------|----------|
| movie | TMDB, OMDb, 豆瓣, IMDb, Trakt |
| tv_show | TMDB, 豆瓣 |
| game | RAWG, Steam |

默认全选，用户可取消勾选。

### 点击搜索结果后的操作

1. 调用详情 API 获取完整元数据：
   - Movie: `GET /api/search/tmdb/:tmdbId` 或 `GET /api/search/douban/:doubanId`
   - TvShow: `GET /api/search/tmdb/:tmdbId` 或 `GET /api/search/douban/:doubanId`
   - Game: `GET /api/search/rawg/:rawgId` 或 `GET /api/search/steam/:steamAppId`

2. 调用更新 API 覆盖记录：
   - Movie: `PUT /api/movies/:id`
   - TvShow: `PUT /api/tv-shows/:id`
   - Game: `PUT /api/games/:id`

3. 字段处理：
   - **覆盖**：posterUrl, tmdbId, tmdbTitle, tmdbPosterUrl, tmdbReleaseDate, tmdbOverview, tmdbVoteAverage, tmdbPopularity, tmdbGenreIds, imdbId, doubanId, title, releaseDate, overview
   - **保留**：status, rating, shortReview, createdAt, updatedAt

4. 关闭弹窗，刷新卡片显示

## 文件变更

### 新增文件

| 文件 | 用途 |
|------|------|
| `frontend/src/components/RescrapeModal.tsx` | 弹窗组件 |

### 修改文件

| 文件 | 修改内容 |
|------|----------|
| `frontend/src/pages/LibraryPage.tsx` | 卡片添加按钮 + 弹窗状态管理 |
| `frontend/src/stores/i18nStore.ts` | 添加相关 i18n key |

## 技术细节

### 前端组件

```tsx
// RescrapeModal.tsx
interface RescrapeModalProps {
  record: LibraryRecord  // 当前记录
  onClose: () => void    // 关闭弹窗
  onUpdated: () => void  // 更新成功回调
}
```

### API 调用

复用现有 API，无需新增后端端点：
- 搜索：`GET /api/search/{movies|tv-shows|games}?query=xxx&providers=xxx`
- 详情：`GET /api/search/{tmdb|douban|rawg|steam}/:id`
- 更新：`PUT /api/{movies|tv-shows|games}/:id`

## 成功标准

1. 卡片 hover 时显示刷新按钮
2. 点击按钮弹出搜索弹窗
3. 搜索框自动填充记录标题
4. 用户可选择搜索来源
5. 搜索结果正确展示
6. 点击结果后外部元数据被替换
7. 用户个人数据（状态、评分、短评）保留
8. 弹窗关闭后卡片显示更新
