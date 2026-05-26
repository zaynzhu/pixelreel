# PixelReel 雷达模块设计

> **日期：** 2026-05-25
>
> **目标：** 新增 `/radar` 页面，聚合展示流媒体平台、海外趋势和国内院线的近期影片信息，并支持一键加入 PixelReel 记录库。
>
> **结论：** 第一版应把 TMDB 和豆瓣作为核心可信源，把腾讯、优酷、芒果 TV、爱奇艺作为可失败的附加源。雷达模块的主体验不能依赖页面爬虫是否成功。

## 背景

PixelReel 当前已经有电影、剧集、游戏的记录库、搜索、导入、时间线、操作日志和统计页面。现有能力偏向“用户已经知道要记录什么”，缺少一个发现入口，用来回答：

- 最近有哪些院线新片。
- 哪些作品近期在海外平台或 TMDB 趋势中出现。
- 哪些内容可以顺手加入“想看”。

雷达模块的定位不是替代 TMDB、豆瓣或 JustWatch，而是做一个轻量聚合面板：让用户快速浏览近期值得关注的影视内容，并把感兴趣的条目写入本地记录库。

## 设计原则

### 核心源优先

第一版以稳定、可解释的数据源为主：

- TMDB：趋势电影、趋势剧集、平台 discover。
- 豆瓣：正在上映、即将上映。

这些数据源决定 `/radar` 页面的基础体验。它们失败时需要在状态接口和前端显式展示。

### 爬虫源降级

腾讯视频、优酷、芒果 TV 和爱奇艺页面数据相似度较高，失败不会影响核心价值。它们应作为 optional source：

- 单源失败只记录 warning。
- 同步整体继续执行。
- 前端展示旧缓存或隐藏该平台结果。
- 状态页显示最近一次成功、失败原因和条数。

爱奇艺需要 Playwright 渲染，部署和资源成本高于 axios/cheerio，应单独隔离，并允许通过环境变量关闭。

### 同步结果可观测

雷达不是一次性抓取脚本，而是长期运行的后台同步模块。每个数据源都需要记录：

- 最近同步开始时间。
- 最近成功时间。
- 最近失败时间。
- 最近失败原因。
- 最近同步条数。
- 当前是否运行中。

这样前端可以判断“没有数据”是因为来源为空、配置缺失、同步失败，还是任务仍在运行。

## 数据源范围

### V1 核心源

TMDB：

- `/trending/movie/week`
- `/trending/tv/week`
- `/discover/movie?with_watch_providers=8&watch_region=US`
- `/discover/movie?with_watch_providers=337&watch_region=US`
- `/discover/movie?with_watch_providers=350&watch_region=US`
- `/discover/movie?with_watch_providers=1899&watch_region=US`

平台映射：

- `8`：Netflix
- `337`：Disney+
- `350`：Apple TV+
- `1899`：Max

注意：TMDB discover 更准确地说是“按平台可观看内容筛选”，不等于严格意义上的“刚上线”。前端文案应使用“平台可看 / 近期发现 / 流媒体关注”，避免承诺精确上新时间。

豆瓣：

- `GET https://frodo.douban.com/api/v2/movie/in_theaters?city=北京&count=20`
- `GET https://frodo.douban.com/api/v2/movie/coming_soon?count=20`

豆瓣请求需要设置移动端 User-Agent 和 Referer，并在两个请求之间 sleep 1000ms，降低频率限制风险。

### V1 附加源

腾讯视频：

- `https://v.qq.com/channel/movie/index.html?iarea=1&itype=100119&sort=18`
- 使用 axios 获取页面，cheerio 解析标题、封面、评分和详情链接。

优酷：

- `https://www.youku.com/category/show?type=movie&sort=1`
- 使用 axios + cheerio。

芒果 TV：

- `https://www.mgtv.com/lib/1-2-2-1-1-0-0.html`
- 使用 axios + cheerio。

爱奇艺：

- `https://www.iqiyi.com/lib/m_1_so9y5lj3dx.html`
- 使用 Playwright headless Chromium。
- 设置较短超时。
- 使用 try/catch/finally 完整包裹。
- 失败返回空数组，不影响其他源。
- 建议通过 `RADAR_IQIYI_ENABLED=false` 默认关闭，开发或本地部署时再开启。

## 数据模型

在 `express-backend/prisma/schema.prisma` 新增 `RadarItem`。

建议字段：

```prisma
model RadarItem {
  id           BigInt   @id @default(autoincrement())
  sourceKey    String   @unique @db.VarChar(255) @map("source_key")
  source       String   @db.VarChar(30)
  sourceId     String?  @db.VarChar(120) @map("source_id")
  sourceUrl    String?  @db.VarChar(500) @map("source_url")

  tmdbId       BigInt?  @map("tmdb_id")
  doubanId     String?  @db.VarChar(30) @map("douban_id")
  type         String   @db.VarChar(20)
  title        String   @db.VarChar(255)
  titleZh      String?  @db.VarChar(255) @map("title_zh")
  overview     String?  @db.Text
  posterPath   String?  @db.VarChar(500) @map("poster_path")
  releaseDate  String?  @db.VarChar(20) @map("release_date")

  platform     String   @db.VarChar(50)
  region       String   @db.VarChar(20)
  status       String   @db.VarChar(30)
  voteAverage  Decimal? @db.Decimal(3,1) @map("vote_average")

  lastSyncedAt DateTime @map("last_synced_at") @db.DateTime(0)
  createdAt    DateTime @default(now()) @map("created_at") @db.DateTime(0)

  @@index([platform, status], map: "idx_radar_platform_status")
  @@index([type, status], map: "idx_radar_type_status")
  @@index([lastSyncedAt], map: "idx_radar_last_synced")
  @@index([tmdbId], map: "idx_radar_tmdb_id")
  @@index([doubanId], map: "idx_radar_douban_id")
  @@map("radar_item")
}
```

关键点是 `sourceKey`。不要只依赖 `tmdbId + platform` 或 `doubanId + platform`，因为爬虫数据经常缺少外部 ID。`sourceKey` 由服务层统一生成：

- TMDB：`tmdb:movie:123:Netflix`
- 豆瓣：`douban:movie:456:豆瓣院线`
- 爬虫：`scraper:tencent:<hash>`

如果后续需要单独展示同步状态，可以新增 `RadarSyncState` 表。第一版也可以先用日志和 `lastSyncedAt` 聚合实现，但长期更推荐独立状态表。

## 后端结构

新增目录：

```text
express-backend/src/services/radar/
```

建议文件：

- `types.ts`：定义 `RadarItemInput`、`RadarSourceResult`、source id 枚举。
- `radarSyncService.ts`：总调度、同步锁、upsert、状态汇总。
- `tmdbRadarService.ts`：TMDB 趋势和 discover。
- `doubanRadarService.ts`：豆瓣院线和即将上映。
- `scraperService.ts`：腾讯、优酷、芒果 TV 的 axios + cheerio 抓取。
- `iqiyiScraperService.ts`：爱奇艺 Playwright 抓取。

总调度分为两组：

```ts
const criticalSources = ["tmdb", "douban"];
const optionalSources = ["tencent", "youku", "mgtv", "iqiyi"];
```

执行策略：

- 同一时间只允许一个全量同步运行。
- 默认串行执行，避免对外部站点造成过高压力。
- 单源有独立 timeout。
- critical source 失败会写入状态，并在响应中标记 `ok: false`。
- optional source 失败只标记该源失败，不影响整体列表接口。
- 所有服务返回统一 `RadarItemInput[]`，只由 `radarSyncService` 负责落库。

## API 设计

新增路由：

```text
GET  /api/radar
GET  /api/radar/status
POST /api/radar/sync
POST /api/radar/sync/:source
```

不要使用 `GET` 触发同步。同步会写库，有副作用，应该使用 `POST`。

列表接口参数：

- `type=movie|tv`
- `status=upcoming|now_playing|streaming|trending`
- `platform=Netflix|Disney+|AppleTV+|Max|腾讯视频|优酷|芒果TV|爱奇艺|豆瓣院线`
- `source=tmdb|douban|scraper`
- `page=1`
- `limit=40`

列表响应建议：

```json
{
  "items": [],
  "page": 1,
  "limit": 40,
  "total": 120,
  "lastSyncedAt": "2026-05-25T08:00:00.000Z",
  "warnings": []
}
```

同步接口响应建议：

```json
{
  "running": false,
  "startedAt": "2026-05-25T08:00:00.000Z",
  "finishedAt": "2026-05-25T08:00:08.000Z",
  "sources": [
    { "source": "tmdb", "ok": true, "count": 80 },
    { "source": "iqiyi", "ok": false, "count": 0, "warning": "Navigation timeout" }
  ]
}
```

## 定时任务

在后端启动时注册 cron：

- 每小时同步 TMDB + 豆瓣。
- 每 6 小时同步 optional scraper。
- 服务启动后延迟执行一次核心源同步。

启动时不要阻塞 `app.listen`。服务应先对外可用，再由后台任务触发同步。这样即使 Playwright 环境缺失，API 也不会启动失败。

建议配置：

- `RADAR_SYNC_ON_START=true`
- `RADAR_SCRAPERS_ENABLED=true`
- `RADAR_IQIYI_ENABLED=false`
- `RADAR_CRON_ENABLED=true`

Docker 部署时，如果启用爱奇艺或其他 Playwright 源，需要安装 Chromium 和系统依赖：

```dockerfile
RUN npx playwright install --with-deps chromium
```

如果只启用 TMDB、豆瓣和 cheerio 爬虫，则不需要在运行路径中启动浏览器。

## 前端页面

新增：

```text
frontend/src/pages/RadarPage.tsx
```

路由：

```text
/radar
```

导航加入“雷达”入口，并在中英文 i18n 中补充 `nav.radar`。

页面结构：

- 顶部标题区：雷达、上次同步时间、手动刷新按钮。
- 第一层 Tab：全部、院线新片、即将上映、流媒体关注。
- 第二层平台 chips：Netflix、Disney+、Max、Apple TV+、腾讯视频、优酷、芒果 TV、爱奇艺、豆瓣院线。
- 卡片网格：海报、标题、平台 badge、日期、评分、来源。
- 操作按钮：`+ 想看`、`去哪看 ↗`。

卡片行为：

- movie 调用 `POST /api/movies`。
- tv 调用 `POST /api/tv-shows`。
- 创建记录时默认 `status=WANT`。
- 如果 RadarItem 有 `tmdbId` 或 `doubanId`，应带入对应字段。
- 对于外部图片 URL，沿用 `/api/search/proxy/image?url=...`。

`去哪看` 链接：

```ts
const query = encodeURIComponent(item.titleZh || item.title);
const url = `https://www.justwatch.com/cn/搜索?q=${query}`;
```

点击新标签页打开，不走后端代理。

## 错误处理

后端：

- 每个源独立 try/catch。
- 单源失败不抛出到全局错误中间件，除非是手动触发单源同步并且用户需要明确错误。
- Playwright 必须 `finally browser.close()`。
- 网络请求统一 timeout。
- 豆瓣请求限速。
- 爬虫选择器失效时返回空数组和 warning。

前端：

- 列表接口失败展示错误状态。
- 手动刷新时显示 loading。
- optional source 失败只在状态区域显示“小字警告”，不阻断页面。
- 爬虫数据统一标注“页面抓取，可能延迟或缺失”。
- `+ 想看` 成功后显示已加入，失败时 toast 报错。

## 验收标准

基础验收：

- `/radar` 可以打开并展示列表。
- 可以按状态和平台筛选。
- 可以看到上次同步时间。
- 可以手动触发同步。
- 可以把电影加入想看。
- 剧集不会错误写入电影表。

同步验收：

- TMDB 配置缺失时状态接口能说明原因。
- 豆瓣失败不会影响 TMDB 数据展示。
- 腾讯、优酷、芒果或爱奇艺失败不会影响核心源同步。
- 同一时间重复点击同步不会并发跑多个全量任务。
- Playwright 源失败后浏览器进程能正常关闭。

部署验收：

- 不启用爱奇艺时，后端不需要启动 Chromium。
- 启用爱奇艺时，Dockerfile 明确安装 Playwright Chromium 依赖。
- 后端启动不被首次同步阻塞。

## 实施建议

### 第一阶段：核心闭环

- 新增 `RadarItem` 模型。
- 实现 TMDB 和豆瓣同步。
- 实现 `/api/radar`、`/api/radar/status`、`POST /api/radar/sync`。
- 新增 `/radar` 页面。
- 支持 `+ 想看` 和 `去哪看`。

### 第二阶段：轻量爬虫

- 接入腾讯、优酷、芒果 TV。
- 统一 optional source 状态。
- 前端补充爬虫来源标注。

### 第三阶段：Playwright 源

- 接入爱奇艺。
- 默认可关闭。
- 补 Docker 运行说明。
- 验证超时、失败降级和浏览器关闭。

### 第四阶段：数据质量增强

- RadarItem 与本地记录库查重。
- 已加入条目标记 `IN_DATABASE`。
- 支持从 Radar 卡片进入未来的记录详情页。
- 支持按最近同步批次或来源查看数据。

## 暂不做

第一版不做：

- 精确判定每个平台的真实上线日期。
- 国内长视频平台账号登录或会员状态。
- 全量 JustWatch 数据接入。
- 多城市院线筛选。
- 推荐算法。
- 复杂去重合并。

这些功能都可以后续做，但不应阻塞雷达模块的第一版。

## 结论

雷达模块应该先做成一个稳定的发现入口，而不是一个依赖所有外部页面都可抓取的聚合爬虫系统。

推荐第一版交付：

- TMDB + 豆瓣作为核心可信源。
- 国内平台页面爬虫作为可失败附加源。
- 爱奇艺 Playwright 单独隔离并默认可关闭。
- 后端同步有状态、有限流、有锁、有降级。
- 前端清楚区分“核心数据”和“页面抓取数据”。

这样可以快速形成可用体验，也给后续扩展更多来源保留空间。
