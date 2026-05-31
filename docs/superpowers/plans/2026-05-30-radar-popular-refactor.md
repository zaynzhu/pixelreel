# 雷达和热门页面重构 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构雷达和热门页面，修复数据区分、链接跳转、i18n 等问题

**Architecture:** 添加 syncType 字段区分数据来源，修复"去哪看"链接，统一 i18n

**Tech Stack:** Express, Prisma, React 18, Zustand

---

## 文件结构

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

---

### Task 1: 数据库和类型定义

**Files:**
- Modify: `express-backend/prisma/schema.prisma`
- Modify: `express-backend/src/services/radar/types.ts`

- [ ] **Step 1: 修改 Prisma schema**

在 `express-backend/prisma/schema.prisma` 的 `RadarItem` 模型中添加 `syncType` 字段：

```prisma
model RadarItem {
  // ... 现有字段
  syncType     String   @default("popular") @map("sync_type") // "new_release" | "popular"
  // ... 其他字段
}
```

- [ ] **Step 2: 修改 types.ts**

在 `express-backend/src/services/radar/types.ts` 的 `RadarItemInput` 接口中添加 `syncType` 字段：

```typescript
export interface RadarItemInput {
  // ... 现有字段
  syncType?: 'new_release' | 'popular'; // 默认 'popular'
}
```

- [ ] **Step 3: 推送数据库变更**

```bash
cd /Users/zaynzhu/code/claude\ code/project/pixelreel/express-backend
npx prisma db push
```

- [ ] **Step 4: 提交**

```bash
cd /Users/zaynzhu/code/claude\ code/project/pixelreel
git add express-backend/prisma/schema.prisma express-backend/src/services/radar/types.ts
git commit -m "feat: 添加 RadarItem syncType 字段"
```

---

### Task 2: 后端同步服务修改

**Files:**
- Modify: `express-backend/src/services/radar/radarSyncService.ts`
- Modify: `express-backend/src/services/radar/youkuRadarService.ts`
- Modify: `express-backend/src/services/radar/tencentRadarService.ts`

- [ ] **Step 1: 修改 radarSyncService.ts**

在 `radarSyncService.ts` 中，热门同步写入 `syncType: 'popular'`，新片同步写入 `syncType: 'new_release'`。

修改 `syncSource` 函数，添加 `syncType` 参数：

```typescript
async function syncSource(source: RadarSource, syncType: 'new_release' | 'popular' = 'popular'): Promise<RadarSourceResult> {
  // ... 现有代码
  for (const item of items) {
    await db.radarItem.upsert({
      where: { sourceKey: item.sourceKey },
      update: {
        // ... 现有字段
        syncType: syncType,
      },
      create: {
        // ... 现有字段
        syncType: syncType,
      },
    });
  }
  // ... 现有代码
}
```

修改 `runRadarSync` 和 `runNewReleaseRadarSync` 函数，传递正确的 `syncType`：

```typescript
export async function runRadarSync(sources?: RadarSource[]): Promise<void> {
  // ... 现有代码
  for (const source of sourcesToSync) {
    const result = await syncSource(source, 'popular'); // 热门同步
    // ... 现有代码
  }
}

export async function runNewReleaseRadarSync(sources?: RadarSource[]): Promise<void> {
  // ... 现有代码
  for (const source of sourcesToSync) {
    const result = await syncSource(source, 'new_release'); // 新片同步
    // ... 现有代码
  }
}
```

- [ ] **Step 2: 修改 youkuRadarService.ts**

修正优酷的 category：

```typescript
/** 热门 — 综合排序 */
export async function fetchYoukuRadar(): Promise<RadarItemInput[]> {
  return fetchYouku(1, 'trending'); // order=1 是综合排序，属于热门
}

/** 新片 — 最新上映 */
export async function fetchYoukuNewReleases(): Promise<RadarItemInput[]> {
  return fetchYouku(2, 'upcoming'); // order=2 是最新上映，属于新片
}
```

- [ ] **Step 3: 修改 tencentRadarService.ts**

添加腾讯新片同步函数：

```typescript
export async function fetchTencentNewReleases(): Promise<RadarItemInput[]> {
  // 复用现有逻辑，但 category 改为 'upcoming'
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
        category: 'upcoming' as const, // 新片
        voteAverage: !isNaN(ratingVal) ? ratingVal : undefined,
      };
    });
  } catch (err: any) {
    console.error('[Radar] Tencent new releases fetch error:', err.message);
    return [];
  }
}
```

- [ ] **Step 4: 提交**

```bash
cd /Users/zaynzhu/code/claude\ code/project/pixelreel
git add express-backend/src/services/radar/
git commit -m "feat: 后端同步服务添加 syncType 支持"
```

---

### Task 3: 后端 API 修改

**Files:**
- Modify: `express-backend/src/routes/radar.ts`

- [ ] **Step 1: 修改 radar.ts**

在 `GET /api/radar` 端点中添加 `syncType` 查询参数：

```typescript
router.get('/', async (req: Request, res: Response) => {
  const syncType = req.query.syncType as string | undefined;
  // ... 现有代码
  
  const where: any = {};
  if (syncType) {
    where.syncType = syncType;
  }
  // ... 其他筛选条件
  
  // ... 现有代码
});
```

- [ ] **Step 2: 提交**

```bash
cd /Users/zaynzhu/code/claude\ code/project/pixelreel
git add express-backend/src/routes/radar.ts
git commit -m "feat: 雷达 API 添加 syncType 查询参数"
```

---

### Task 4: 前端 Store 修改

**Files:**
- Modify: `frontend/src/stores/radarStore.ts`
- Modify: `frontend/src/stores/newReleaseRadarStore.ts`

- [ ] **Step 1: 修改 radarStore.ts**

在 `fetchItems` 函数中添加 `syncType: 'popular'` 参数：

```typescript
const fetchItems = async (params?: { page?: number; category?: string; type?: string }) => {
  // ... 现有代码
  const queryParams = new URLSearchParams();
  queryParams.set('syncType', 'popular'); // 热门同步的数据
  // ... 其他参数
};
```

- [ ] **Step 2: 修改 newReleaseRadarStore.ts**

在 `fetchItems` 函数中添加 `syncType: 'new_release'` 参数：

```typescript
const fetchItems = async (params?: { page?: number; category?: string }) => {
  // ... 现有代码
  const queryParams = new URLSearchParams();
  queryParams.set('syncType', 'new_release'); // 新片同步的数据
  // ... 其他参数
};
```

- [ ] **Step 3: 提交**

```bash
cd /Users/zaynzhu/code/claude\ code/project/pixelreel
git add frontend/src/stores/radarStore.ts frontend/src/stores/newReleaseRadarStore.ts
git commit -m "feat: 前端 Store 添加 syncType 过滤"
```

---

### Task 5: 前端页面修复

**Files:**
- Modify: `frontend/src/pages/RadarPage.tsx`
- Modify: `frontend/src/pages/PopularPage.tsx`

- [ ] **Step 1: 修改 RadarPage.tsx**

1. i18n 统一：移除硬编码中文，改用 `t()` 函数
2. 修复"去哪看"链接：优先使用 `sourceUrl`

```typescript
// 在组件顶部添加
const { t } = useI18nStore();

// 修改"去哪看"链接
const watchUrl = item.sourceUrl || `https://www.justwatch.com/cn/搜索?q=${encodeURIComponent(item.titleZh || item.title)}`;
```

- [ ] **Step 2: 修改 PopularPage.tsx**

修复"去哪看"链接：

```typescript
const watchUrl = item.sourceUrl || `https://www.justwatch.com/cn/搜索?q=${encodeURIComponent(item.titleZh || item.title)}`;
```

- [ ] **Step 3: 提交**

```bash
cd /Users/zaynzhu/code/claude\ code/project/pixelreel
git add frontend/src/pages/RadarPage.tsx frontend/src/pages/PopularPage.tsx
git commit -m "feat: 前端页面修复链接和 i18n"
```

---

## 验证清单

1. ✅ 雷达页只显示新片同步的数据
2. ✅ 热门页只显示热门同步的数据
3. ✅ "去哪看"链接优先跳转到平台直接链接
4. ✅ 雷达页 i18n 正常工作
5. ✅ 腾讯新片同步正常工作
6. ✅ 同步前检查 RADAR_ENABLED 设置
