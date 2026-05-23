# PixelReel

个人影剧游记录平台 — 电影、电视剧、游戏统一管理。

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Express 5 + TypeScript + Prisma 6 (MySQL) — 端口 18889 |
| 前端 | React 18 + Vite + Zustand + TailwindCSS — 端口 18888 |
| 数据库 | MySQL (Prisma ORM) |

项目中还保留了一套 Java 后端（`src/`、`pom.xml`），基于 Spring Boot 3 + MyBatis Plus（端口 8080）。建表 SQL 在 `db/legacy/java-schema.sql`。目前未启用，切换后端只需修改 Vite 代理目标（`frontend/vite.config.ts`）。

## 开发命令

```bash
# 数据库初始化（新环境首次）
mysql -u root -p < db/init.sql           # 建库，然后配置 .env
cd express-backend && npx prisma db push  # 建表（从 schema.prisma 生成）

# Express 后端（默认）
cd express-backend && npm run dev        # tsx watch, 端口 18889

# Java 后端（备用）— 需要 Maven
mvn clean spring-boot:run               # 端口 8080, 需要 application-local.yml

# 切换后端：编辑 frontend/vite.config.ts 中的 proxy target

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

src/                      ← Java Spring Boot 后端（遗留，仍在仓库中）
  main/java/com/pixelreel/
    controller/, config/, dto/, entity/, enums/, mapper/, service/
  pom.xml                    ← 位于项目根目录

express-backend/src/
  config/         index.ts（环境配置）, db.ts（Prisma 客户端 + getDb() + registerExtensions()）
  routes/         index.ts（聚合器）, auth, trakt, search, searchTvShows,
                  import, library, movie, game, tvShow, profile, settings, activity
  services/       search/（TMDB、OMDb、豆瓣、Trakt、IMDb、RAWG、Steam 等）
                  import/（Steam、Xbox、PSN、豆瓣 CSV、RAWG 封面、TMDB 封面、TMDB 回填）
                  douban-harvester/（爬虫核心、TMDB 丰富、导入服务、任务管理）
                  LibraryService, ProfileSummaryService, ExternalSearchService, activity-log
  middlewares/    auth.ts（JWT，当前未启用）, errorHandler.ts, activity-log.ts（Prisma 扩展，自动记录 CRUD）
  enums/          RecordStatus.ts（UNSET|WANT|IN_PROGRESS|DONE|DROPPED）
  dto/            library.ts, profile.ts, external-search.ts, import-summary.ts

frontend/src/
  pages/          DashboardPage, LibraryPage, LoginPage, TimelinePage, SettingsPage（占位）, ActivityPage
  components/     AppShell, RightActionDrawer, TaskPanel, Toast, MovieSearch, GameSearch, TvShowSearch, TimelinePopup, StarRating, ActivityFilters, ActivityTimeline
  stores/         authStore, profileStore, libraryStore, gameRecordStore, i18nStore, taskStore, toastStore, activityStore
  types/          library.ts, profile.ts, externalSearch.ts, movie.ts, settings.ts
  api.ts          apiFetch 辅助函数（JWT Bearer，401 重定向，**已自动解析 JSON — 不要再调 .json()**）
```

## 路由

| 前端 | 后端 |
|------|------|
| `/` 仪表盘 | `GET /api/profile/summary` |
| `/movies/search` | `GET /api/search/movies` |
| `/tv-shows/search` | `GET /api/search/tv-shows` |
| `/games/search` | `GET /api/search/games` |
| `/library` | `GET /api/library?cursor=&limit=50`, `PATCH /api/library/:cat/:id` |
| `/timeline` | 复用 `libraryStore`（游标分页 + IntersectionObserver 无限滚动） |
| `/activity` | `GET /api/activity`（游标分页 + 筛选）, `POST /api/activity/:id/undo`（撤销） |
| `/login` | `POST /api/auth/login` |
| `/settings` | `GET/PUT /api/settings` (环境变量配置) |
| — | `POST /api/import/douban-harvest` (豆瓣导入/爬取) |
| — | `GET /api/import/douban-harvest/status` (任务进度) |
| — | `GET /api/import/tasks` (所有任务列表) |
| — | `DELETE /api/import/tasks/:taskId` (取消任务) |
| — | `POST /api/import/douban/clear-data` (清空豆瓣来源数据) |
| — | `POST /api/import/tmdb-enrich/backfill?limit=50` (批量为已有记录补充 TMDB 数据) |
| — | `POST /api/import/steam/backfill` (回填已有 Steam 游戏的海报和游玩时间) |

## 关键模式

- **认证：** 简单 JWT，默认 `AUTH_ENABLED=false`。中间件已存在但未接入路由。
- **国际化：** Zustand `i18nStore`，提供 `t()` 函数，EN/ZH 字典，持久化到 localStorage。所有新组件必须 i18n。
- **操作日志：** Prisma `$extends` 中间件自动记录 Movie/TvShow/Game 的 CREATE/UPDATE/DELETE，支持撤销。`/activity` 页面带筛选和无限滚动。
- **海报填充：** 电影/剧集用 TMDB，游戏用 RAWG。带速率限制（250ms 间隔，429 重试）。
- **Trakt 导入：** 自动分页，按 traktId/tmdbId/imdbId 去重，导入时拉取 TMDB 海报。
- **数据原则：** 豆瓣数据为主（`douban_*` 字段原样存入），TMDB 为辅（`tmdb_*` 字段补缺），各平台评分互不转换。
- **赛博朋克主题：** CSS 自定义属性（`--accent: #d4ff00`，`--accent-deep: #ff4400`），Syne + JetBrains Mono 字体，扫描线遮罩。

## 深度文档

- 架构与数据模型 → `docs/PROJECT_STATUS.md`
- 认证设计 → `docs/plans/2026-04-08-multi-user-auth-design.md`（基于 Spring，需要重写为 Express 版本）
- 开发环境搭建 → `db/setup.md`

## 豆瓣数据导入（douban-harvester）

已集成到 `express-backend/src/services/douban-harvester/`，通过 API 触发，无需单独运行 CLI。

- **导入已有数据：** `POST /api/import/douban-harvest?mode=json` — 读取 `collect.json`，不需要 Playwright
- **全量数据同步：** `POST /api/import/douban-harvest?mode=full` — Playwright 爬豆瓣，**每次从0开始不续爬**，需要 `DOUBAN_USER_ID` + `npx playwright install chromium`
- **增量数据导入：** `POST /api/import/douban-harvest?mode=incremental` — 只抓新数据（需先全量同步过，或手动创建 `sync_state.json`）
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

## 记录库分页

- `GET /api/library` 支持游标分页：`?cursor=2026-05-18T00:00:00.000Z__3&limit=50`
- cursor 格式：`{createdAt的ISO字符串}__{id}`，同一秒多条记录用 id 作 tiebreaker
- 返回 `{ records: LibraryRecord[], nextCursor: string | null, totals: { total, rated, reviewed, completed } }`，`nextCursor` 为 null 表示无更多
- `totals` 为全库统计（不受分页影响），前端统计卡片直接使用
- 前端用 IntersectionObserver 实现无限滚动，滚到底部自动 `fetchMore()`

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
