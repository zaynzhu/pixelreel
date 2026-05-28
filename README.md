# PixelReel

个人影剧游记录平台 — 电影、电视剧、游戏统一管理。

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Express 5 + TypeScript + Prisma 6 (MySQL) — 端口 18889 |
| 前端 | React 18 + Vite + Zustand + TailwindCSS — 端口 18888 |
| 影视数据 | TMDB, OMDb, Trakt, 豆瓣, IMDb |
| 游戏数据 | RAWG, Steam, OpenXBL, PSNProfiles |

> Java Spring Boot 后端代码已归档至 `legacy/java-backend/`，不再维护。

## 已完成功能

- Express + Prisma 后端（替代原 Java Spring Boot）
- Movie / TvShow / Game 基础 CRUD
- 统一外部搜索聚合接口（影视 / 游戏 / 电视剧）
- 影视搜索 Provider：TMDB / OMDb / Trakt / 豆瓣 / IMDb
- 电视剧搜索 Provider：TMDB、豆瓣
- 游戏搜索 Provider：RAWG / Steam（支持中文关键词自动翻译）
- 搜索详情展开（影视：评分/类型/导演/演员/片长/剧情；游戏：评分/Metacritic/开发商/平台/ESRB）
- 搜索详情接口：`/api/search/imdb/:imdbId`、`/api/search/tmdb/:tmdbId`、`/api/search/douban/:doubanId`、`/api/search/rawg/:rawgId`、`/api/search/steam/:steamAppId`
- Trakt 影视导入（电影 + 电视剧，自动分页，TMDB 封面填充）
- Steam 已购导入
- Xbox 已玩导入（OpenXBL）
- PSN 已玩导入（PSNProfiles）
- RAWG 封面补全（游戏）
- TMDB 封面补全（影视）
- JWT 登录鉴权 + 前端登录页
- 个人主页统计接口与前端首页
- 记录库混合列表页：筛选、排序、评分和短评编辑
- 前端国际化（EN / ZH）
- 时间线页面（按月份分组的海报墙，年份筛选，详情弹窗）
- 豆瓣数据导入（douban-harvester 集成：JSON 导入、全量/增量爬取、TMDB 丰富）
- 记录库与时间线游标分页 + 无限滚动（IntersectionObserver）
- 记录库服务端过滤（category=movie|tv_show|game|media|all、year、status）
- 时间线轻量 API（`/api/timeline` 仅返回列表必要字段，点击按需加载完整记录）
- 时间线年份端点（`/api/timeline/years?category=`）
- 图片代理增强（域名允许列表、HEAD 预检、Cache-Control、内容类型检查）
- 操作日志（Prisma 扩展自动记录 CRUD，支持撤销，筛选与无限滚动）
- Showcase 大屏展示页面（网格模式 + 全屏轮播模式）
- 数据分析页面（年度报告、月度趋势、评分分布、来源占比、跨平台评分对比、Top 评分榜）
- Toast 通知 + ConfirmDialog 组件（替代浏览器 alert/confirm）
- 系统设置页面（环境变量配置，敏感字段遮罩，分类编辑）
- 雷达发现页面（TMDB 热映/趋势/即将上映/正在播出 + 优酷/腾讯可失败附加源，一键加入想看）

## 未完成 / 占位

- [ ] Switch 接入（占位）
- [ ] 雷达模块：豆瓣 frodo API（需官方 apikey）、芒果 TV（需 Playwright）
- [ ] 电视剧多 Provider 搜索（IMDb、Trakt 等，豆瓣已接入）

## 不计划实现

- ~~多用户登录与权限体系~~ — 个人项目，不需要多用户
- ~~豆瓣 CSV 导入前端界面~~ — 已有 JSON/全量/增量导入，CSV 界面多余

## 前端路由

| 路由 | 页面 |
|------|------|
| `/` | 个人主页统计首页 |
| `/movies/search` | 电影搜索 |
| `/tv-shows/search` | 电视剧搜索 |
| `/games/search` | 游戏搜索 |
| `/library` | 记录库列表 + 评分短评工作台 |
| `/timeline` | 时间线页面（按月份分组的海报墙） |
| `/activity` | 操作日志（筛选、无限滚动、撤销） |
| `/showcase` | 大屏展示（网格 + 全屏轮播） |
| `/analytics` | 数据分析（年度报告 + 习惯洞察） |
| `/settings` | 系统设置（环境变量配置） |
| `/radar` | 雷达发现（TMDB+优酷+腾讯聚合） |
| `/login` | 登录页 |

## 关键接口

### 搜索

```text
GET /api/search/movies?query=&providers=omdb,tmdb,douban,imdb,trakt
GET /api/search/tv-shows?query=&providers=tmdb,douban
GET /api/search/games?query=&providers=rawg,steam

# 详情接口
GET /api/search/imdb/:imdbId        IMDb/OMDb 影视详情
GET /api/search/tmdb/:tmdbId        TMDB 影视详情 + credits
GET /api/search/douban/:doubanId    豆瓣影视详情
GET /api/search/rawg/:rawgId        RAWG 游戏详情
GET /api/search/steam/:steamAppId   Steam 游戏详情

# 图片代理
GET /api/search/proxy/image?url=   代理豆瓣等防盗链图片
```

### 记录库与时间线

```text
GET   /api/library?cursor=&limit=50&category=&year=&status=   混合列表（游标分页）
GET   /api/library/:category/:id                                单条完整记录
PATCH /api/library/:category/:id                                更新记录
GET   /api/library/random?limit=N                                随机记录（N 最大 20）

GET   /api/timeline?cursor=&limit=96&category=&year=           时间线轻量列表
GET   /api/timeline/years?category=                              可选年份列表
```

### 导入

```text
POST   /api/import/douban-harvest?mode=json|full|incremental   豆瓣数据导入/爬取
GET    /api/import/douban-harvest/status?taskId=xxx           任务进度
GET    /api/import/tasks                                        所有任务列表
DELETE /api/import/tasks/:taskId                               取消任务
POST   /api/import/douban/clear-data                           清空豆瓣来源数据
POST   /api/import/tmdb-enrich/backfill?limit=50               批量补充 TMDB 数据
POST   /api/import/tmdb-detail/backfill?limit=50               按 tmdbId 回填完整详情
POST   /api/import/steam/backfill                              回填 Steam 海报和游玩时间
POST   /api/trakt/import/movies                                Trakt 电影导入
POST   /api/trakt/import/shows                                Trakt 电视剧导入
POST   /api/import/steam/owned                                 Steam 已购导入
POST   /api/import/xbox/owned                                  Xbox 已玩导入
POST   /api/import/psn/owned                                   PSN 已玩导入
POST   /api/import/covers/fill                                 RAWG 封面补全
POST   /api/import/tmdb-covers/fill                            TMDB 封面补全
```

### 其他

```text
GET    /api/profile/summary          个人主页统计
GET    /api/analytics?year=          年度分析数据
GET    /api/activity                 操作日志（游标分页 + 筛选）
POST   /api/activity/:id/undo        撤销操作
POST   /api/auth/login               JWT 登录
GET    /api/settings                 获取环境变量配置
PUT    /api/settings                 更新环境变量配置
```

### 雷达

```text
GET    /api/radar?category=&type=&platform=&source=&page=&limit=  雷达列表（含 inLibrary 标记）
GET    /api/radar/status                                               各源同步状态
POST   /api/radar/sync                                                触发全量同步
POST   /api/radar/sync/:source                                        触发单源同步（tmdb/youku/tencent）
POST   /api/radar/add-to-library                                      加入想看（按 tmdbId/标题去重）
```

## 本地启动

### Express 后端

```bash
# 1. 创建数据库（首次）
mysql -u root -p < db/init.sql

# 2. 安装依赖 & 建表
cd express-backend
npm install
cp .env.example .env
# 编辑 .env，填入数据库连接和 API Key
npx prisma generate
npx prisma db push
npm run dev        # 默认端口 18889
```

> 完整搭建步骤见 `db/setup.md`。

### 前端

```bash
cd frontend
npm install
npm run dev
# 默认地址：http://localhost:18888
# 代理已配置指向 Express 后端 18889
```

## 配置项（.env）

- `DATABASE_URL` — MySQL 连接字符串
- `PORT` — 后端端口（默认 18889）
- `JWT_SECRET` — JWT 签名密钥
- `AUTH_ENABLED` — 是否启用登录鉴权（默认 false）
- `TMDB_API_KEY`, `OMDB_API_KEY`, `TRAKT_CLIENT_ID/SECRET/ACCESS_TOKEN`
- `STEAM_API_KEY`, `OPENXBL_API_KEY`, `PSNPROFILES_USER_AGENT/COOKIE`
- `RAWG_API_KEY`
- `DOUBAN_USER_ID` — 豆瓣用户 ID（用于爬取）
- `DOUBAN_COOKIE` — 豆瓣登录 Cookie（仅搜索 Provider 使用）
- `DOUBAN_DATA_DIR` — 豆瓣数据目录（默认 `express-backend/data/douban-harvester/`）
- `DOUBAN_HARVEST_ENABLED` — 是否启用浏览器收割（默认 true，关闭后 full/incremental 返回 403）
- `DOUBAN_HARVEST_HEADLESS` — Playwright 无头模式（默认 true）
- `DOUBAN_HARVEST_MAX_PAGES_PER_RUN` — 单次收割最大页数（默认 200）
- `HTTPS_PROXY` — TMDB API 代理地址（国内必需，如 `http://127.0.0.1:7897`）
- `RADAR_ENABLED` — 雷达模块总开关（默认 true）
- `RADAR_CRON_ENABLED` — 雷达定时同步开关（默认 true）
- `RADAR_SYNC_ON_START` — 启动时执行同步（默认 true）
- `RADAR_SCRAPERS_ENABLED` — 国内平台（优酷/腾讯）开关（默认 true）
- `RADAR_SYNC_CORE_CRON` — 核心源同步 cron（默认 `0 * * * *`，每小时）
- `RADAR_SYNC_SCRAPER_CRON` — 附加源同步 cron（默认 `0 */6 * * *`，每6小时）
- `RADAR_REQUEST_TIMEOUT_MS` — 请求超时（默认 15000）
- `RADAR_WATCH_REGION` — TMDB 流媒体平台地区（默认 `TW`，用于 `with_watch_providers` 筛选）

## 数据模型

三张核心表，字段按来源分组（豆瓣为主、TMDB 为辅）：

| Model | 外部 ID | 显示字段 | 豆瓣原始字段 | TMDB 原始字段 |
|-------|---------|---------|------------|-------------|
| Movie | doubanId, tmdbId, imdbId, traktId | title, posterUrl, releaseDate, overview, rating(1-5星), shortReview | doubanTitle, doubanAltTitle, doubanIntro, doubanRating, doubanDate, doubanComment, doubanLink, doubanAvgRating | tmdbTitle, tmdbPosterUrl, tmdbReleaseDate, tmdbOverview, tmdbVoteAverage, tmdbPopularity, tmdbGenreIds |
| TvShow | doubanId, tmdbId, imdbId, traktId | title, posterUrl, firstAirDate, overview, rating(1-5星), shortReview | 同 Movie | 同 Movie |
| Game | rawgId, steamAppId, xboxId, psnId | title, posterUrl, rating(1-5星), shortReview, platform, playtimeMinutes | — | — |

| ActivityLog | — | action, entityType, entityId, entityTitle, oldValues(JSON), newValues(JSON), metadata(JSON) | — | — |

| RadarItem | sourceKey(唯一), source, sourceId, sourceUrl, tmdbId, doubanId | title, titleZh, overview, posterPath, releaseDate | — | type, category, platform, voteAverage |

所有表使用 BigInt 自增主键，`createdAt`/`updatedAt` 由 MySQL 管理。

ActivityLog 由 Prisma `$extends` 中间件自动写入，无需手动调用。支持按 entityType/entityId/action/from~to 筛选，游标分页与记录库相同格式。

## License

MIT