# PixelReel

个人影剧游记录平台 — 电影、电视剧、游戏统一管理。

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Express 5 + TypeScript + Prisma 6 (MySQL) — 端口 18889 |
| 前端 | React 18 + Vite + Zustand + TailwindCSS — 端口 18888 |
| 数据库 | MySQL (Prisma ORM) |

> Java Spring Boot 后端代码已归档至 `legacy/java-backend/`，不再维护。

## 开发命令

```bash
# 数据库初始化（新环境首次）
mysql -u root -p < db/init.sql           # 建库，然后配置 .env
cd express-backend && npx prisma db push  # 建表（从 schema.prisma 生成）

# Express 后端
cd express-backend && npm run dev        # tsx watch, 端口 18889

# 前端
cd frontend && npm run dev               # Vite, 端口 18888, 代理 /api → 18889

# Prisma
cd express-backend && npx prisma generate  # 修改 schema 后重新生成客户端
cd express-backend && npx prisma db push   # 将 schema 推送到数据库
```

## 项目结构

```
db/                       ← 数据库初始化文件
  init.sql                ← 建库 SQL（仅 CREATE DATABASE）
  setup.md                ← 从零搭建手顺
  legacy/java-schema.sql  ← Java 后端建表 SQL（留档，Prisma 不使用）

legacy/java-backend/      ← Java Spring Boot 后端（归档，不再维护）
  src/main/java/com/pixelreel/
    controller/, config/, dto/, entity/, enums/, mapper/, service/
  pom.xml

express-backend/src/
  config/         index.ts（环境配置）, db.ts（Prisma 客户端 + getDb() + registerExtensions()）
  routes/         index.ts（聚合器）, auth, trakt, search, searchTvShows,
                  import, library, timeline, movie, game, tvShow, profile, settings, activity, radar
  services/       provider/（TmdbMovieSearchProvider, OmdbMovieSearchProvider, TraktMovieSearchProvider,
                          DoubanMovieSearchProvider, ImdbMovieSearchProvider, DoubanTvShowSearchProvider,
                          TmdbTvShowSearchProvider, RawgGameSearchProvider, SteamGameSearchProvider 等）
                  import/（Steam、Xbox、PSN、豆瓣 CSV、RAWG 封面、TMDB 封面、TMDB 回填）
                  douban-harvester/（爬虫核心、TMDB 丰富、导入服务、任务管理）
                  radar/（types、tmdbRadarService、youkuRadarService、tencentRadarService、radarSyncService）
                  LibraryService, TimelineService, ProfileSummaryService, ExternalSearchService, activity-log
  middlewares/    auth.ts（JWT，当前未启用）, errorHandler.ts, activity-log.ts（Prisma 扩展，自动记录 CRUD）
  enums/          RecordStatus.ts（UNSET|WANT|IN_PROGRESS|DONE|DROPPED）
  dto/            library.ts, timeline.ts, profile.ts, external-search.ts, import-summary.ts

frontend/src/
  pages/          DashboardPage, LibraryPage, LoginPage, TimelinePage, SettingsPage, ActivityPage, ShowcasePage, AnalyticsPage, RadarPage
  components/     AppShell, RightActionDrawer, TaskPanel, Toast (ToastContainer + ConfirmDialog), MovieSearch, GameSearch, TvShowSearch, TimelinePopup, StarRating, ActivityFilters, ActivityTimeline
                  showcase/（StatsPanel, PosterCarousel, TimelineMini, RandomPick, ShowcaseControls）
                  analytics/（OverviewCards, MonthlyChart, RatingChart, SourcePieChart, CrossPlatformChart, TopRatedList）
  stores/         authStore, profileStore, libraryStore, timelineStore, timelineDetailStore, gameRecordStore, i18nStore, taskStore, toastStore, activityStore, radarStore
  types/          library.ts, timeline.ts, profile.ts, externalSearch.ts, movie.ts, settings.ts, analytics.ts, radar.ts
  api.ts          apiFetch 辅助函数（JWT Bearer，401 重定向，**已自动解析 JSON — 不要再调 .json()**）
  imageProxy.ts   proxiedImageUrl() 辅助函数（代理 TMDB/Steam/RAWG/豆瓣图片到 /api/search/proxy/image）
```

## 路由

| 前端 | 后端 |
|------|------|
| `/` 仪表盘 | `GET /api/profile/summary` |
| `/movies/search` | `GET /api/search/movies?query=&providers=omdb,tmdb,douban,imdb,trakt` |
| `/tv-shows/search` | `GET /api/search/tv-shows?query=&providers=tmdb,douban` |
| `/games/search` | `GET /api/search/games?query=&providers=rawg,steam` |
| — | `GET /api/search/imdb/:imdbId` (OMDb 详情) |
| — | `GET /api/search/tmdb/:tmdbId` (TMDB 详情 + credits) |
| — | `GET /api/search/douban/:doubanId` (豆瓣详情) |
| — | `GET /api/search/rawg/:rawgId` (RAWG 游戏详情：评分、开发商、类型等) |
| — | `GET /api/search/steam/:steamAppId` (Steam 游戏详情：Metacritic、开发商、类型等) |
| — | `GET /api/search/proxy/image?url=` (图片代理，解决豆瓣防盗链) |
| `/library` | `GET /api/library?cursor=&limit=50&category=&year=&status=`, `GET /api/library/:category/:id`, `PATCH /api/library/:cat/:id` |
| `/timeline` | `GET /api/timeline?cursor=&limit=96&category=&year=`, `GET /api/timeline/years?category=`（轻量 API，前端 `timelineStore` + `timelineDetailStore`） |
| `/activity` | `GET /api/activity`（游标分页 + 筛选）, `POST /api/activity/:id/undo`（撤销） |
| `/showcase` | `GET /api/library/random?limit=N`（随机记录，N 最大 20，默认 1，库空返回 404） |
| `/analytics` | `GET /api/analytics?year=`（年度分析数据） |
| `/radar` | `GET /api/radar?category=&type=&platform=&source=&page=&limit=`（雷达列表，含 inLibrary 标记） |
| `/radar` | `GET /api/radar/status`（各源同步状态） |
| `/radar` | `POST /api/radar/sync`（触发全量同步） |
| `/radar` | `POST /api/radar/sync/:source`（触发单源同步） |
| `/radar` | `POST /api/radar/add-to-library`（加入想看，按 tmdbId/标题去重） |
| `/login` | `POST /api/auth/login` |
| `/settings` | `GET/PUT /api/settings` (环境变量配置) |
| — | `POST /api/import/douban-harvest` (豆瓣导入/爬取) |
| — | `GET /api/import/douban-harvest/status` (任务进度) |
| — | `GET /api/import/tasks` (所有任务列表) |
| — | `DELETE /api/import/tasks/:taskId` (取消任务) |
| — | `POST /api/import/douban/clear-data` (清空豆瓣来源数据) |
| — | `POST /api/import/tmdb-enrich/backfill?limit=50` (批量为已有记录补充 TMDB 数据) |
| — | `POST /api/import/tmdb-detail/backfill?limit=50` (按 tmdbId 回填完整详情：imdbId/voteAverage/title/overview/genres 等) |
| — | `POST /api/import/steam/backfill` (回填已有 Steam 游戏的海报和游玩时间) |

## 关键模式

- **认证：** 简单 JWT，默认 `AUTH_ENABLED=false`。中间件已存在但未接入路由。
- **Settings 页面：** 分类编辑环境变量，字段类型支持 `text`/`boolean`/`password`/`number`。豆瓣分类包含收割机运行参数，雷达分类包含同步配置。
- **国际化：** Zustand `i18nStore`，提供 `t()` 函数，EN/ZH 字典，持久化到 localStorage。所有新组件必须 i18n。
- **操作日志：** Prisma `$extends` 中间件自动记录 Movie/TvShow/Game 的 CREATE/UPDATE/DELETE，支持撤销。`/activity` 页面带筛选和无限滚动。
- **海报填充：** 电影/剧集用 TMDB，游戏用 RAWG。带速率限制（250ms 间隔，429 重试）。
- **搜索 Provider：** 电影搜索支持 OMDb/TMDB/豆瓣/IMDb/Trakt；剧集支持 TMDB/豆瓣；游戏支持 RAWG/Steam。IMDb Provider 复用 OMDb API。OMDb/IMDb 搜索中文关键词时自动通过 TMDB 获取英文原名回退（按 vote_count 排序）。RAWG 和 Steam 搜索中文关键词时通过 MyMemory API 翻译为英文再搜索。Steam 海报使用 CDN 地址 `cdn.akamai.steamstatic.com`。豆瓣搜索使用公开接口 `/j/subject_suggest`，不需要 Cookie。
- **搜索详情：** 前端搜索结果点击可展开详情。影视详情：评分、类型、导演、演员、片长、剧情。游戏详情：RAWG/Steam 评分、Metacritic、开发商、发行商、平台、游玩时长、ESRB、截图（`screenshots` 数组）。后端提供 `/api/search/imdb/:imdbId`、`/api/search/tmdb/:tmdbId`、`/api/search/douban/:doubanId`、`/api/search/rawg/:rawgId`、`/api/search/steam/:steamAppId` 五个详情接口。
- **海报图片：** Steam 海报有两种 CDN 格式——旧格式 `cdn.akamai.steamstatic.com/steam/apps/{id}/header.jpg`（大部分游戏可用）和新格式 `shared.akamai.steamstatic.com/store_item_assets/steam/apps/{id}/{hash}/header.jpg`（新游戏必须用这个）。图片加载失败时自动显示赛博朋克占位符（`ImgWithFallback` 组件）。
- **状态显示规则：** 有游玩时长（`playtimeMinutes > 0`）的游戏不显示"想玩"状态标签——已玩过的游戏不应标记为 WANT。
- **豆瓣图片代理：** 豆瓣图片有防盗链，需通过 `/api/search/proxy/image?url=` 代理访问，自动将 `imgN.doubanio.com` 替换为 `img1.doubanio.com`（反爬较松）。代理有域名允许列表（TMDB/Steam CDN/RAWG/豆瓣/优酷/腾讯），未知域名返回 400。代理先发 HEAD 请求检查 Content-Type 再下载 body（避免浪费带宽下载非图片响应）。响应带 `Cache-Control: public, max-age=7d, immutable`。前端统一用 `proxiedImageUrl()` 路由代理，搜索组件（MovieSearch/TvShowSearch）和 TimelinePopup 都必须使用此函数。
- **时间线轻量 API：** `/api/timeline` 返回轻量 `TimelineRecordResponse`（仅 id/category/title/posterUrl/status/rating/playtimeMinutes/sourceLabel/platformLabel/createdAt），不包含豆瓣/TMDB 详情。点击卡片时按需通过 `GET /api/library/:category/:id` 获取完整记录，前端用 `timelineDetailStore` 缓存（key 格式 `category:id`）。`/api/timeline/years?category=` 用 `SELECT DISTINCT YEAR(createdAt)` 高效返回年份列表。
- **记录库服务端过滤：** `GET /api/library` 支持 `category=movie|tv_show|game|media|all`、`year=2026`、`status=DONE` 筛选参数。`category=media` 是产品约定，等于 `movie + tv_show`。`normalizeStatus` 只接受有效 RecordStatus 值，非法 status 参数被忽略（返回 undefined）。
- **Trakt 导入：** 自动分页，按 traktId/tmdbId/imdbId 去重，导入时拉取 TMDB 海报。
- **数据原则：** 豆瓣数据为主（`douban_*` 字段原样存入），TMDB 为辅（`tmdb_*` 字段补缺），各平台评分互不转换。
- **Toast 通知：** 用 `toastStore` 的 `addToast(message, type)` 和 `toast()` 便捷函数。错误用 `toast(msg, 'error')`，成功用默认 `toast(msg)`。确认对话框用 `confirmDialog(msg, danger?)` 返回 `Promise<boolean>`，替代浏览器原生 `alert()`/`confirm()`。
- **TMDB 详情回填：** `TmdbDetailBackfillService` 按 tmdbId 调 `/movie/{id}` 或 `/tv/{id}+external_ids`，补全 imdbId/voteAverage/popularity/title/overview/genres。只写空字段，不覆盖已有数据。
- **年份筛选：** AnalyticsService 中「已完成」用 `updatedAt`（状态变更时间），其余指标（评分/短评/Top榜/分布）用 `createdAt`（记录创建时间）。
- **tmdbGenreIds 格式：** 逗号分隔字符串（如 `"28,12,878"`），不是数组。Prisma schema 为 String 类型。
- **赛博朋克主题：** CSS 自定义属性（`--accent: #d4ff00`，`--accent-deep: #ff4400`），Syne + JetBrains Mono 字体，扫描线遮罩。Showcase 专用类（`@layer components`）：`.showcase-panel`（发光边框面板）、`.showcase-number`（脉冲发光数字）、`.showcase-poster`（扫描线海报 + hover 发光）、`.showcase-bg`（动态径向渐变背景）。

## 深度文档

- 架构与数据模型 → `README.md`
- 开发环境搭建 → `db/setup.md`

## 豆瓣数据导入（douban-harvester）

已集成到 `express-backend/src/services/douban-harvester/`，通过 API 触发，无需单独运行 CLI。

- **导入已有数据：** `POST /api/import/douban-harvest?mode=json` — 读取 `collect.json`，不需要 Playwright
- **全量数据同步：** `POST /api/import/douban-harvest?mode=full` — Playwright 爬豆瓣，**每次从0开始不续爬**，需要 `DOUBAN_USER_ID` + `npx playwright install chromium`
- **增量数据导入：** `POST /api/import/douban-harvest?mode=incremental` — 只抓新数据（需先全量同步过，或手动创建 `sync_state.json`）。日期比较用 `<`（严格小于），同一天的数据不会被过滤。
- **查询进度：** `GET /api/import/douban-harvest/status?taskId=xxx`
- **取消任务：** `DELETE /api/import/tasks/:taskId`
- **清空豆瓣数据：** `POST /api/import/douban/clear-data`
- 任务管理统一使用 `services/task-manager.ts`（不再有专用 task-manager）
- 爬虫返回具体错误信息（超时/风控/用户取消），不再统一报"爬取被风控中止"
- 导入时自动查 TMDB 分类（movie/tv）并拉取海报，250ms 间隔防限速
- 已有记录的 TMDB 数据回填：`POST /api/import/tmdb-enrich/backfill?limit=50`（异步任务，按标题搜 TMDB 补充 tmdbId 和 posterUrl）
  - 智能标题匹配：自动清理"第X季""Season X""剧场版"等干扰词，中英文混合标题拆分为多个候选逐个尝试
- 综艺归入 TvShow 表，不单独建表
- 豆瓣评分 1-5 星直接存入 `douban_rating` 和 `rating`，不再 ×2 转换
- **浏览器收割可关闭：** `DOUBAN_HARVEST_ENABLED=false` 时，`mode=full`/`mode=incremental` 返回 403，`mode=json` 不受影响
- **收割机参数可配置：** `DOUBAN_HARVEST_HEADLESS`（默认 true）、`DOUBAN_HARVEST_NAVIGATION_TIMEOUT_MS`（默认 30000）等通过 `config.douban` 读取，Settings 页面可直接修改

## 记录库分页

- `GET /api/library` 支持游标分页：`?cursor=2026-05-18T00:00:00.000Z__3&limit=50&category=media&year=2026&status=DONE`
- cursor 格式：`{createdAt的ISO字符串}__{id}`，同一秒多条记录用 id 作 tiebreaker
- `category` 筛选：`movie|tv_show|game|media|all`，`media` = movie + tv_show（产品约定）
- `year` 筛选：按 `createdAt` 年份过滤
- `status` 筛选：`UNSET|WANT|IN_PROGRESS|DONE|DROPPED`
- `includeTotals=false` 跳过 totals 计算（加载更多时使用）
- 返回 `{ records: LibraryRecord[], nextCursor: string | null, totals: { total, rated, reviewed, completed } }`，`nextCursor` 为 null 表示无更多
- `totals` 受 category/year/status 筛选影响，前端统计卡片直接使用
- 前端用 IntersectionObserver 实现无限滚动，滚到底部自动 `fetchMore()`

## 时间线 API

- `GET /api/timeline` 轻量游标分页：`?cursor=&limit=96&category=media&year=2026&includeTotals=false`
- 返回 `TimelineRecordResponse`：仅 id/category/title/posterUrl/status/rating/playtimeMinutes/sourceLabel/platformLabel/createdAt
- 不含豆瓣/TMDB 详情字段，点击卡片时按需通过 `GET /api/library/:category/:id` 获取完整记录
- `GET /api/timeline/years?category=media` 返回 `{ years: number[] }`，用于年份选择器
- 前端 `timelineStore` 管理分页和筛选状态，`timelineDetailStore` 缓存点击后的完整记录

## 数据库

- MySQL 8.4 运行在 NAS Docker（192.168.50.233:13306），非本地
- 豆瓣导入的影视数据在 `movie` 和 `tv_show` 表，**不能动**（Trakt 数据可以操作）
- TMDB 覆盖率约 93%，仅少数因 TMDB 无收录而缺失

## 常见陷阱

- `$PID` 是 PowerShell 只读变量 — 改用 `$backendPid` 等自定义变量名。
- 在 PowerShell 中用 `Stop-Process`，不要在 Git Bash 里用 `taskkill`（存在路径解析问题）。
- Trakt 导入必须调用 `fetchTmdbPosterUrl()` 并间隔 250ms — 永远不要把 `posterUrl` 硬编码为 `null`。
- TMDB API 需要代理访问 — 必须设置 `HTTPS_PROXY` 环境变量（如 `http://127.0.0.1:7897`），否则所有 TMDB 请求会超时返回空。
- TMDB API 使用 v4 Bearer Token 认证 — `TMDB_API_KEY` 存的是 JWT（eyJ 开头），必须通过 `Authorization: Bearer` 请求头传递，不能用 `api_key` 查询参数（会 401）。
- `apiFetch` 已自动解析 JSON — 调用后直接用返回值，不要再调 `.json()`，否则 TypeError。
- Prisma `$extends()` 返回新客户端 — 必须用 `getDb()` 获取扩展后的实例，不能直接 import 原始 `prisma`。所有路由和服务统一用 `getDb()`。
- 新组件必须做 i18n — 在 `i18nStore.ts` 的 `dictionaries.en` 和 `dictionaries.zh` 中添加 key，组件中用 `t('key')` 渲染。
- Prisma `BigInt` 字段（如 `steamAppId`）与 JavaScript `number` 不兼容 — Map 查找和比较时必须用 `Number()` 转换，否则 `20n !== 20`。
- 不要用 Playwright 截图让模型分析页面效果 — 模型不支持图片输入，截图白费。需要理解页面时读代码或用 `browser_snapshot` 获取 DOM。
- `tsx watch` 会在 git commit 时重启后端，丢失内存中的任务状态 — 跑回填任务时用 `npx tsx src/server.ts`（无 watch）启动。
- Settings 备份路径是 `.env.backup.local`（不是 `.env.backup`，后者曾是敏感文件已被删除）。
- **雷达模块：** TMDB 为核心源（now_playing/upcoming/trending/on_the_air），优酷和腾讯为可失败附加源（纯 JSON API，无需 Playwright）。同步有锁（同一时间只允许一个全量同步运行），单源失败不影响整体。RadarItem 用 sourceKey 去重 upsert，add-to-library 按 tmdbId 去重（无 tmdbId 时按标题去重）。优酷 API 响应数据在 `pageComponentList[].commonData`（不是 `searchResult`）。雷达 cron 配置：`RADAR_SYNC_CORE_CRON`（默认每小时）、`RADAR_SYNC_SCRAPER_CRON`（默认每6小时）、`RADAR_SYNC_ON_START`（默认 true，启动后5秒延迟执行）。
