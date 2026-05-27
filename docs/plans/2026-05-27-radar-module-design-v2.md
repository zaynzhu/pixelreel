# PixelReel 雷达模块设计 v2

> **日期：** 2026-05-27（基于 2026-05-25 v1 审核，修正可行性问题）
>
> **目标：** 新增 `/radar` 页面，聚合展示近期热映、即将上映、趋势和正在播出的影视内容，并支持一键加入 PixelReel 记录库。
>
> **结论：** 第一版以 TMDB 为唯一核心源（豆瓣 frodo API 需官方 apikey），优酷和腾讯作为可失败的附加源（纯 JSON API，无需 HTML 解析）。主体验不依赖国内平台是否成功。

## 相对 v1 的关键修正

| # | 问题 | 修正 |
|---|------|------|
| 1 | v1 主 Tab 包含"流媒体关注"，用 discover 按平台查可看内容，返回的是"平台上所有可看"而非"新上架" | 主 Tab 改为 TMDB 端点驱动的分类（正在热映/即将上映/本周趋势/正在播出），平台降为副筛选 |
| 2 | v1 假设腾讯/优酷/芒果用 axios+cheerio 抓 HTML 页面 | 优酷和腾讯都有纯 JSON API，无需 cheerio；芒果移出 V1 |
| 3 | v1 sourceKey 含平台后缀 `tmdb:movie:123:Netflix` | 去掉平台后缀，platform 作为独立字段 |
| 4 | v1 "+想看"调用现有 POST /api/movies（无去重） | 新增 POST /api/radar/add-to-library 专用接口，后端查重+映射 |
| 5 | v1 RadarItem.status 与 Movie.status 语义冲突 | 改名为 category，值对齐 TMDB 端点 |
| 6 | v1 TMDB 端点只有 /trending 和 /discover | 补充 /movie/now_playing, /movie/upcoming, /tv/on_the_air |

## 背景

PixelReel 当前已有电影、剧集、游戏的记录库、搜索、导入、时间线、操作日志和统计页面。现有能力偏向"用户已经知道要记录什么"，缺少一个发现入口，用来回答：

- 最近有哪些院线新片。
- 哪些作品近期在 TMDB 趋势中出现。
- 哪些剧集正在播出。
- 哪些内容可以顺手加入"想看"。

雷达模块的定位不是替代 TMDB、豆瓣或 JustWatch，而是做一个轻量聚合面板：让用户快速浏览近期值得关注的影视内容，并把感兴趣的条目写入本地记录库。

## 设计原则

### 核心源优先

第一版以稳定、可解释的数据源为主：

- TMDB：now_playing、upcoming、trending、on_the_air。

> **注意：** 豆瓣 frodo API 需要官方 apikey 才能访问，公开 key 已全部失效。拿到 apikey 之前，豆瓣不应作为核心源。

### 附加源降级

优酷和腾讯作为 optional source：

- 单源失败只记录 warning。
- 同步整体继续执行。
- 前端展示旧缓存或隐藏该平台结果。
- 状态页显示最近一次成功、失败原因和条数。

### 同步结果可观测

每个数据源都需要记录：

- 最近同步开始时间。
- 最近成功时间。
- 最近失败时间。
- 最近失败原因。
- 最近同步条数。
- 当前是否运行中。

## 数据源范围

### V1 核心源

TMDB：

| 端点 | category | 说明 |
|------|----------|------|
| `/movie/now_playing` | `now_playing` | 当前院线热映 |
| `/movie/upcoming` | `upcoming` | 即将上映 |
| `/trending/movie/week` | `trending` | 本周趋势电影 |
| `/trending/tv/week` | `trending` | 本周趋势剧集 |
| `/tv/on_the_air` | `on_the_air` | 正在播出的剧集 |

TMDB discover 按平台查询（`with_watch_providers`）作为可选副维度，非核心流程。

### V1 附加源

优酷：

- `GET https://search.youku.com/api/search?keyword=电影&cate=96&order=1&pg=1&pz=30`
- 纯 JSON API，axios 直接获取。
- 返回字段：title、posterUrl、director、actors、badge（首播/VIP/独播）、playUrl。
- `order=1` 按最新排序。

腾讯视频：

- `POST https://pbaccess.video.qq.com/trpc.vector_layout.page_view.PageService/getCard?video_appid=3000010&vversion_platform=2`
- 请求体含 `tab_type: "new_film"` 获取最新影片。
- 纯 JSON API，axios 直接获取。
- 返回字段：title、posterUrl、rating、publishDate、genre、VIP status、detailUrl。

### 暂不接入（V2+）

| 平台 | 原因 |
|------|------|
| 豆瓣 frodo | 需官方 apikey，待激活 |
| 芒果 TV | 新片列表需 Playwright 渲染 Nuxt SSR；即将上映有 `playbill.api.mgtv.com` 纯 HTTP，但数据有限 |
| 爱奇艺 | 需 Playwright，默认关闭 |

## 数据模型

在 `express-backend/prisma/schema.prisma` 新增 `RadarItem`：

```prisma
model RadarItem {
  id           BigInt   @id @default(autoincrement())
  sourceKey    String   @unique @db.VarChar(255) @map("source_key")
  source       String   @db.VarChar(30)          // tmdb | youku | tencent | douban
  sourceId     String?  @db.VarChar(120) @map("source_id")
  sourceUrl    String?  @db.VarChar(500) @map("source_url")

  tmdbId       BigInt?  @map("tmdb_id")
  doubanId     String?  @db.VarChar(30) @map("douban_id")
  type         String   @db.VarChar(20)          // movie | tv
  title        String   @db.VarChar(255)
  titleZh      String?  @db.VarChar(255) @map("title_zh")
  overview     String?  @db.Text
  posterPath   String?  @db.VarChar(500) @map("poster_path")
  releaseDate  String?  @db.VarChar(20) @map("release_date")

  platform     String?  @db.VarChar(50)          // 可选: Netflix|Disney+|优酷|腾讯|...
  category     String   @db.VarChar(30)          // now_playing|upcoming|trending|on_the_air
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

**sourceKey 生成规则**（不含平台后缀）：

- TMDB：`tmdb:movie:123` 或 `tmdb:tv:456`
- 优酷：`youku:bebe9a8cd3ec40369084`（showId）
- 腾讯：`tencent:mzc00200rv2fq4n`（cid）
- 豆瓣：`douban:movie:456`（待激活）

同一个 tmdbId 无论从哪个源发现，都 upsert 到同一条目。`platform` 字段记录发现渠道。

## 后端结构

新增目录：

```text
express-backend/src/services/radar/
  types.ts              — RadarItemInput, RadarSourceResult, source 枚举
  radarSyncService.ts   — 总调度、同步锁、upsert、状态汇总
  tmdbRadarService.ts   — TMDB now_playing/upcoming/trending/on_the_air
  youkuRadarService.ts   — 优酷 JSON API
  tencentRadarService.ts — 腾讯 JSON API
  doubanRadarService.ts  — 待激活（需 apikey）
```

总调度分两组：

```ts
const criticalSources = ["tmdb"];
const optionalSources = ["youku", "tencent"];
```

执行策略：

- 同一时间只允许一个全量同步运行。
- 默认串行执行，避免对外部站点造成过高压力。
- 单源有独立 timeout。
- critical source 失败标记 `ok: false`。
- optional source 失败只 warning，不影响整体列表接口。
- 所有服务返回统一 `RadarItemInput[]`，只由 `radarSyncService` 负责落库。

## API 设计

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/radar` | 列表查询 |
| GET | `/api/radar/status` | 各源同步状态 |
| POST | `/api/radar/sync` | 触发全量同步 |
| POST | `/api/radar/sync/:source` | 触发单源同步 |
| POST | `/api/radar/add-to-library` | 加入想看（查重 + 自动映射） |

列表接口参数：

- `category=now_playing|upcoming|trending|on_the_air`
- `type=movie|tv`
- `platform=Netflix|Disney+|优酷|腾讯|...`
- `source=tmdb|youku|tencent`
- `page=1`、`limit=40`

列表响应：

```json
{
  "items": [],
  "page": 1,
  "limit": 40,
  "total": 120,
  "lastSyncedAt": "2026-05-27T08:00:00.000Z",
  "warnings": []
}
```

每个 item 包含 `inLibrary: boolean`（后端按 tmdbId 查 Movie/TvShow 表得出）。

同步接口响应：

```json
{
  "running": false,
  "startedAt": "2026-05-27T08:00:00.000Z",
  "finishedAt": "2026-05-27T08:00:08.000Z",
  "sources": [
    { "source": "tmdb", "ok": true, "count": 80 },
    { "source": "youku", "ok": true, "count": 30 },
    { "source": "tencent", "ok": false, "count": 0, "warning": "Navigation timeout" }
  ]
}
```

### add-to-library 接口

请求体：

```json
{ "radarItemId": 123 }
```

后端流程：

1. 查 RadarItem by id。
2. 按 `tmdbId` + `type` 查 Movie/TvShow 表。
3. 已存在 → 返回 `{ exists: true, recordId: 456, category: "movie" }`。
4. 不存在 → 映射字段（title→title, posterPath→tmdbPosterUrl, tmdbId→tmdbId, voteAverage→tmdbVoteAverage, overview→tmdbOverview, releaseDate→tmdbReleaseDate），设 `status: "WANT"`，创建后返回 `{ exists: false, recordId: 789, category: "movie" }`。

> **无 tmdbId 的条目**（优酷/腾讯源）：无法按 tmdbId 去重，直接创建 Movie 记录，posterPath 映射到 `posterUrl`（非 `tmdbPosterUrl`）。同一电影可能因来源不同重复入库，这是 V1 已知限制（复杂去重合并属于"暂不做"）。

## 定时任务

在后端启动时注册 cron：

- 每小时同步 TMDB（`RADAR_SYNC_CORE_CRON`，默认 `0 * * * *`）。
- 每 6 小时同步优酷和腾讯（`RADAR_SYNC_SCRAPER_CRON`，默认 `0 */6 * * *`）。
- 服务启动后延迟执行一次核心源同步（`RADAR_SYNC_ON_START=true`）。

启动时不要阻塞 `app.listen`。服务应先对外可用，再由后台任务触发同步。

配置（`config/index.ts` 已有）：

- `RADAR_ENABLED` — 总开关（默认 true）
- `RADAR_CRON_ENABLED` — cron 开关（默认 true）
- `RADAR_SYNC_ON_START` — 启动时同步（默认 true）
- `RADAR_SCRAPERS_ENABLED` — 国内平台开关（默认 true）
- `RADAR_IQIYI_ENABLED` — 爱奇艺开关（默认 false，V1 不用）
- `RADAR_PLAYWRIGHT_HEADLESS` — Playwright headless（V1 不用）
- `RADAR_SYNC_CORE_CRON` — 核心源 cron（默认 `0 * * * *`）
- `RADAR_SYNC_SCRAPER_CRON` — 附加源 cron（默认 `0 */6 * * *`）
- `RADAR_REQUEST_TIMEOUT_MS` — 请求超时（默认 15000）

## 前端页面

### 路由与导航

- 路由：`/radar` → `RadarPage.tsx`
- AppShell 导航新增"雷达"入口 + `nav.radar` i18n key

### 页面布局

```
┌─────────────────────────────────────────────┐
│ 雷达  上次同步: 2分钟前  [手动刷新]           │
├─────────────────────────────────────────────┤
│ [正在热映] [即将上映] [本周趋势] [正在播出]   │  ← 主 Tab (category)
├─────────────────────────────────────────────┤
│ [全部] [Netflix] [Disney+] [优酷] [腾讯] ... │  ← 平台 chips (副筛选)
├─────────────────────────────────────────────┤
│ 卡片网格：海报 / 标题 / 日期 / 评分 /        │
│ 操作按钮：+ 想看 / 去哪看 ↗                  │
└─────────────────────────────────────────────┘
```

### 卡片行为

- **+ 想看**：调 `POST /api/radar/add-to-library`，成功后按钮变为"已在库中"（灰色不可点）。
- **去哪看 ↗**：跳转 `https://www.justwatch.com/cn/搜索?q={encodeURIComponent(titleZh || title)}`，新标签页打开。
- 已加入库的条目：列表接口返回 `inLibrary: true`，前端直接渲染灰色状态。

### i18n keys

新增 key：`nav.radar`、`radar.title`、`radar.lastSync`、`radar.refresh`、`radar.nowPlaying`、`radar.upcoming`、`radar.trending`、`radar.onTheAir`、`radar.addToLibrary`、`radar.inLibrary`、`radar.whereToWatch`、`radar.sourceTag.tmdb`、`radar.sourceTag.youku`、`radar.sourceTag.tencent`。

## 错误处理

后端：

- 每个源独立 try/catch。
- 单源失败不抛到全局错误中间件。
- 网络请求统一 timeout（`RADAR_REQUEST_TIMEOUT_MS`）。
- 爬虫 API 失效时返回空数组和 warning。

前端：

- 列表接口失败展示错误状态。
- 手动刷新时显示 loading。
- optional source 失败只在状态区域显示"小字警告"。
- `+ 想看` 成功后显示已加入，失败时 toast 报错。

## 验收标准

基础验收：

- `/radar` 可以打开并展示列表。
- 可以按 category 和 platform 筛选。
- 可以看到上次同步时间。
- 可以手动触发同步。
- 可以把电影加入想看。
- 剧集不会错误写入电影表。

同步验收：

- TMDB 配置缺失时状态接口能说明原因。
- 优酷或腾讯失败不会影响核心源同步。
- 同一时间重复点击同步不会并发跑多个全量任务。

加入库验收：

- 同一 tmdbId 的条目不会重复创建。
- 已在库中的条目显示"已在库中"而非"+ 想看"。
- RadarItem 字段正确映射到 Movie/TvShow 表。

## 实施阶段

### 第一阶段：核心闭环

- 新增 `RadarItem` 模型。
- 实现 TMDB 同步（now_playing / upcoming / trending / on_the_air）。
- 实现 `/api/radar`、`/api/radar/status`、`POST /api/radar/sync`。
- 新增 `/radar` 页面。
- 支持 `+ 想看`（含查重）和 `去哪看`。

### 第二阶段：国内平台

- 接入优酷 JSON API。
- 接入腾讯 JSON API。
- 统一 optional source 状态。
- 前端补充国内平台 chips 和来源标注。

### 第三阶段：待激活源

- 豆瓣 frodo（需 apikey）。
- 芒果 TV（需评估 Playwright 成本）。
- 爱奇艺 Playwright（默认关闭）。

### 第四阶段：数据质量增强

- RadarItem 与本地记录库查重（`inLibrary` 已在 V1 实现）。
- 支持从 Radar 卡片进入记录详情页。
- 支持按同步批次或来源查看数据。

## 暂不做

第一版不做：

- 精确判定每个平台的真实上线日期。
- 国内长视频平台账号登录或会员状态。
- 全量 JustWatch 数据接入。
- 多城市院线筛选。
- 推荐算法。
- 复杂去重合并。
- 芒果 TV 和爱奇艺接入。

## 结论

雷达模块先做成一个稳定的发现入口，以 TMDB 为核心源，回答"出了什么"。

推荐第一版交付：

- TMDB 四类端点（热映/即将上映/趋势/正在播出）作为唯一核心源。
- 优酷和腾讯纯 JSON API 作为可失败附加源。
- 豆瓣 frodo 作为待激活源。
- 后端同步有状态、有限流、有锁、有降级。
- 前端主 Tab 按 category 分类，平台为副筛选。
- 加入想看有查重，不重复创建记录。