# 雷达和热门页面重构 设计文档

## 概述

重构雷达和热门两个页面，修复数据区分、链接跳转、i18n 等问题。

## 背景

当前雷达和热门两个页面存在以下问题：
1. 数据区分模糊：两个页面查询同一张表，数据混在一起
2. "去哪看"链接 404：使用 JustWatch 链接返回 400 错误
3. i18n 不一致：雷达页硬编码中文
4. 腾讯新片同步缺失

## 设计

### 核心区别

| 页面 | 定位 | 数据来源 | 分类 |
|------|------|----------|------|
| 雷达 (`/radar`) | 新片雷达 | 新片同步 | upcoming, on_the_air, 流媒体新片 |
| 热门 (`/popular`) | 热门内容 | 热门同步 | now_playing, trending, 流媒体热门 |

### 1. 数据区分

在 `RadarItem` 表中添加 `syncType` 字段：

```prisma
model RadarItem {
  // ... 现有字段
  syncType String @default("popular") @map("sync_type") // "new_release" | "popular"
}
```

- `syncType: "new_release"` — 新片同步写入
- `syncType: "popular"` — 热门同步写入

前端查询时按 `syncType` 过滤。

### 2. "去哪看"链接修复

优先使用 `sourceUrl`（平台直接链接），没有时才用 JustWatch：

```typescript
const watchUrl = item.sourceUrl || `https://www.justwatch.com/cn/搜索?q=${encodeURIComponent(item.titleZh || item.title)}`;
```

### 3. 优酷分类修正

- `order=1`（综合排序）→ `category: 'trending'`（热门）
- `order=2`（最新上映）→ `category: 'upcoming'`（新片）

### 4. 腾讯新片同步

添加 `fetchTencentNewReleases()` 函数，获取腾讯的新片数据。

### 5. i18n 统一

雷达页改用 `t()` 函数，移除硬编码中文。

### 6. 同步前置检查

同步服务检查 `RADAR_ENABLED` 设置，未启用时跳过同步。

### 文件变更

| 文件 | 操作 | 说明 |
|------|------|------|
| `express-backend/prisma/schema.prisma` | 修改 | 添加 syncType 字段 |
| `express-backend/src/services/radar/types.ts` | 修改 | 添加 syncType 到 RadarItemInput |
| `express-backend/src/services/radar/radarSyncService.ts` | 修改 | 同步时写入 syncType |
| `express-backend/src/services/radar/youkuRadarService.ts` | 修改 | 修正 category |
| `express-backend/src/services/radar/tencentRadarService.ts` | 修改 | 添加新片同步函数 |
| `express-backend/src/routes/radar.ts` | 修改 | 添加 syncType 查询参数 |
| `frontend/src/pages/RadarPage.tsx` | 修改 | i18n 统一，修复链接 |
| `frontend/src/pages/PopularPage.tsx` | 修改 | 修复链接 |
| `frontend/src/stores/radarStore.ts` | 修改 | 添加 syncType 过滤 |
| `frontend/src/stores/newReleaseRadarStore.ts` | 修改 | 添加 syncType 过滤 |

## 成功标准

1. 雷达页只显示新片同步的数据
2. 热门页只显示热门同步的数据
3. "去哪看"链接优先跳转到平台直接链接
4. 雷达页 i18n 正常工作
5. 腾讯新片同步正常工作
6. 同步前检查 RADAR_ENABLED 设置
