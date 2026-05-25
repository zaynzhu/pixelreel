# PixelReel 项目状态

## 项目简介
PixelReel 是一个个人影剧游记录平台，支持电影、电视剧、游戏的搜索、记录、平台导入与首页统计总览。

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端（当前） | Express 5, TypeScript, Prisma 6 (MySQL) |
| 后端（备选） | Spring Boot 3, MyBatis Plus (Java) |
| 前端 | React 18, React Router, Zustand, TailwindCSS, Vite |
| 影视数据 | TMDB, OMDb, Trakt, 豆瓣, IMDb |
| 游戏数据 | RAWG, Steam, OpenXBL, PSNProfiles |

## 已完成功能
- [x] Express + Prisma 后端（替代原 Java Spring Boot）
- [x] Movie / TvShow / Game 基础 CRUD
- [x] 统一外部搜索聚合接口（影视 / 游戏 / 电视剧）
- [x] 影视搜索 Provider：TMDB / OMDb / Trakt / 豆瓣 / IMDb
- [x] 电视剧搜索 Provider：TMDB、豆瓣
- [x] 游戏搜索 Provider：RAWG / Steam（支持中文关键词自动翻译，Steam 改用 Store Search API）
- [x] 搜索详情展开（影视：评分/类型/导演/演员/片长/剧情；游戏：评分/Metacritic/开发商/平台/ESRB）
- [x] 搜索详情接口：`/api/search/imdb/:imdbId`、`/api/search/tmdb/:tmdbId`、`/api/search/douban/:doubanId`、`/api/search/rawg/:rawgId`、`/api/search/steam/:steamAppId`
- [x] Trakt 影视导入（电影 + 电视剧，自动分页，TMDB 封面填充）
- [x] Steam 已购导入
- [x] Xbox 已玩导入（OpenXBL）
- [x] PSN 已玩导入（PSNProfiles）
- [x] RAWG 封面补全（游戏）
- [x] TMDB 封面补全（影视）
- [x] JWT 登录鉴权 + 前端登录页
- [x] 个人主页统计接口与前端首页
- [x] 记录库混合列表页：筛选、排序、评分和短评编辑
- [x] 前端国际化（EN/ZH）
- [x] 时间线页面（按月份分组的海报墙，年份筛选，详情弹窗）
- [x] 豆瓣数据导入（douban-harvester 集成：JSON 导入、全量/增量爬取、TMDB 丰富）
- [x] 记录库与时间线游标分页 + 无限滚动（IntersectionObserver）
- [x] 操作日志（Prisma 扩展自动记录 CRUD，支持撤销，筛选与无限滚动）
- [x] Showcase 大屏展示页面（网格模式 + 全屏轮播模式，统计数据/海报轮播/时间线概览/随机推荐）
- [x] 数据分析页面（年度报告、月度趋势、评分分布、来源占比、跨平台评分对比、Top 评分榜）
- [x] Toast 通知 + ConfirmDialog 组件（替代浏览器 alert/confirm，赛博朋克主题）
- [x] 系统设置页面（环境变量配置，敏感字段遮罩，分类编辑，写入 .env）
- [x] 豆瓣导入任务进度显示修复（爬取阶段显示条数而非 0/0）
- [x] 搜索详情增强（影视评分/类型/导演/演员/片长/剧情，游戏多维度）

## 未完成 / 占位
- [ ] Switch 接入（占位）
- [ ] 电视剧多 Provider 搜索（IMDb、Trakt 等，豆瓣已接入）

## 不计划实现
- ~~多用户登录与权限体系~~ — 个人项目，不需要多用户
- ~~豆瓣 CSV 导入前端界面~~ — 已有 JSON/全量/增量导入，CSV 界面多余

## 当前前端路由
- `/`：个人主页统计首页
- `/movies/search`：电影搜索
- `/tv-shows/search`：电视剧搜索
- `/games/search`：游戏搜索
- `/library`：记录库列表 + 评分短评编辑
- `/timeline`：时间线页面（按月份分组的海报墙）
- `/activity`：操作日志页（筛选、无限滚动、撤销）
- `/showcase`：大屏展示页（网格模式 + 全屏轮播模式）
- `/analytics`：数据分析页（年度报告 + 习惯洞察）
- `/settings`：系统设置页（环境变量配置，敏感字段遮罩）
- `/login`：登录页

## 关键接口
- `POST /api/auth/login`：JWT 登录
- `GET /api/profile/summary`：个人主页统计汇总
- `GET /api/library`：混合记录库列表（游标分页，`?cursor=&limit=50`），返回 `{ records, nextCursor, totals }`，`totals` 为全库统计
- `PATCH /api/library/:category/:id`：更新状态 / 评分 / 短评
- `GET /api/library/random?limit=N`：随机返回记录（N 最大 20，默认 1，库空返回 404）
- `GET /api/search/movies`：电影搜索聚合
- `GET /api/search/tv-shows`：电视剧搜索
- `GET /api/search/games`：游戏搜索聚合
- `GET /api/search/imdb/:imdbId`：IMDb/OMDb 影视详情（评分、导演、演员、片长、剧情）
- `GET /api/search/tmdb/:tmdbId`：TMDB 影视详情 + credits
- `GET /api/search/douban/:doubanId`：豆瓣影视详情
- `GET /api/search/rawg/:rawgId`：RAWG 游戏详情（评分、Metacritic、开发商、平台、ESRB）
- `GET /api/search/steam/:steamAppId`：Steam 游戏详情（Metacritic、开发商、类型、简介）
- `POST /api/trakt/import/movies`：Trakt 电影导入
- `POST /api/trakt/import/shows`：Trakt 电视剧导入
- `POST /api/import/steam/owned`：Steam 已购导入
- `POST /api/import/steam/backfill`：回填已有 Steam 游戏的海报和游玩时间
- `POST /api/import/xbox/owned`：Xbox 已玩导入
- `POST /api/import/psn/owned`：PSN 已玩导入
- `POST /api/import/covers/fill`：RAWG 游戏封面补全
- `POST /api/import/tmdb-covers/fill`：TMDB 影视封面补全
- `POST /api/import/douban-harvest`：豆瓣数据导入/爬取（`?mode=json|full|incremental`）
- `GET /api/import/douban-harvest/status`：豆瓣导入任务进度查询（`?taskId=xxx`）
- `POST /api/import/tmdb-enrich/backfill`：批量为已有记录补充 TMDB 数据（`?limit=50`）
- `POST /api/import/tmdb-detail/backfill`：按 tmdbId 回填完整详情（`?limit=50`，补 imdbId/voteAverage/title/overview/genres 等）
- `POST /api/import/douban/clear-data`：清空豆瓣来源数据
- `GET /api/activity`：操作日志列表（游标分页，`?cursor=&limit=50&action=&entityType=&from=&to=`）
- `POST /api/activity/:id/undo`：撤销操作（CREATE→删除实体，UPDATE→恢复旧值，DELETE→重建实体）
- `GET /api/settings`：获取环境变量配置（按分类返回）
- `PUT /api/settings`：更新环境变量配置（写入 .env 文件）
- `GET /api/analytics?year=2026`：年度分析数据（总览、月度趋势、评分分布、来源占比、跨平台评分、Top 评分榜）

## 本地启动方式

### Express 后端（当前默认）
```bash
mysql -u root -p < db/init.sql    # 首次：建库（详见 db/setup.md）
cd express-backend
cp .env.example .env   # 编辑填入数据库连接和 API Key
npx prisma generate     # 生成 Prisma Client
npx prisma db push      # 推送 schema 到数据库
npm run dev              # 默认端口 18889
```

### Java Spring Boot 后端（备选）
```bash
# 在 src/main/resources/application-local.yml 中配置
mvn clean spring-boot:run
# 默认端口 8080
```

> 切换后端时，修改 `frontend/vite.config.ts` 中的 proxy target 指向对应端口。

### 前端
```bash
cd frontend
npm install
npm run dev              # 默认端口 18888
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
- `DOUBAN_COOKIE` — 豆瓣登录 Cookie（仅搜索 Provider 使用，爬取不需要）
- `DOUBAN_DATA_DIR` — 豆瓣数据目录（默认 `express-backend/data/douban-harvester/`）
- `HTTPS_PROXY` — TMDB API 代理地址（国内必需，如 `http://127.0.0.1:7897`）

## 数据模型
三张核心表，字段按来源分组（豆瓣为主、TMDB 为辅）：

| Model | 外部 ID | 显示字段 | 豆瓣原始字段 | TMDB 原始字段 |
|-------|---------|---------|------------|-------------|
| Movie | doubanId, tmdbId, imdbId, traktId | title, posterUrl, releaseDate, overview, rating(1-5星), shortReview | doubanTitle, doubanAltTitle, doubanIntro, doubanRating, doubanDate, doubanComment, doubanLink, doubanAvgRating | tmdbTitle, tmdbPosterUrl, tmdbReleaseDate, tmdbOverview, tmdbVoteAverage, tmdbPopularity, tmdbGenreIds |
| TvShow | doubanId, tmdbId, imdbId, traktId | title, posterUrl, firstAirDate, overview, rating(1-5星), shortReview | 同 Movie | 同 Movie |
| Game | rawgId, steamAppId, xboxId, psnId | title, posterUrl, rating(1-5星), shortReview, platform, playtimeMinutes | — | — |

| ActivityLog | — | action, entityType, entityId, entityTitle, oldValues(JSON), newValues(JSON), metadata(JSON) | — | — |

所有表使用 BigInt 自增主键，`createdAt`/`updatedAt` 由 MySQL 管理。

ActivityLog 由 Prisma `$extends` 中间件自动写入，无需手动调用。支持按 entityType/entityId/action/from~to 筛选，游标分页与记录库相同格式。