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

# 交付前检查
cd express-backend && npm run check      # TypeScript 构建 + 核心回归测试
cd frontend && npm run check             # TypeScript 构建 + Vite 生产构建

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
                  import, library, timeline, movie, game, tvShow, profile, settings, activity, radar, tools
  services/       provider/（TmdbMovieSearchProvider, OmdbMovieSearchProvider, TraktMovieSearchProvider,
                          DoubanMovieSearchProvider, ImdbMovieSearchProvider, DoubanTvShowSearchProvider,
                          TmdbTvShowSearchProvider, RawgGameSearchProvider, SteamGameSearchProvider 等）
                  import/（Steam、Xbox、PSN、豆瓣 CSV、RAWG 封面、TMDB 封面、TMDB 回填）
                  douban-harvester/（爬虫核心、TMDB 丰富、导入服务、任务管理）
                  radar/（TMDB、优酷、腾讯同步服务）
                  LibraryService, TimelineService, ProfileSummaryService, ExternalSearchService, activity-log
  middlewares/    auth.ts（JWT，按 AUTH_ENABLED 条件启用）, errorHandler.ts, activity-log.ts（Prisma 扩展，自动记录 CRUD）
  enums/          RecordStatus.ts（UNSET|WANT|IN_PROGRESS|DONE|DROPPED）
  dto/            library.ts, profile.ts, external-search.ts, import-summary.ts

frontend/src/
  pages/          DashboardPage, LibraryPage, LoginPage, TimelinePage, SettingsPage, ActivityPage, ShowcasePage, AnalyticsPage, RadarPage, PopularPage, ToolsPage
  components/     AppShell, RightActionDrawer, TaskPanel, Toast, MovieSearch, GameSearch, TvShowSearch, TimelinePopup, StarRating, ActivityFilters, ActivityTimeline
                  showcase/（StatsPanel, PosterCarousel, TimelineMini, RandomPick, ShowcaseControls）
  stores/         authStore, profileStore, libraryStore, gameRecordStore, i18nStore, taskStore, toastStore, activityStore
  types/          library.ts, profile.ts, externalSearch.ts, movie.ts, settings.ts, analytics.ts
  api.ts          apiFetch 辅助函数（JWT Bearer，401 重定向，**已自动解析 JSON — 不要再调 .json()**）
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
| `/library` 记录库；`/library/:category/:id` 统一详情页 | `GET /api/library?cursor=&limit=50&category=&year=&status=&query=&source=&review=&importReview=&sort=`, `GET /api/library/:category/:id`, `PATCH /api/library/:cat/:id` |
| `/timeline` | `GET /api/timeline?cursor=&limit=96&category=&year=`, `GET /api/timeline/years?category=` |
| `/activity` | `GET /api/activity`（游标分页 + 筛选）, `POST /api/activity/:id/undo`（撤销） |
| `/showcase` | `GET /api/library/random?limit=N&category=&status=`（随机记录，N 最大 20；类别支持 movie/tv_show/game，状态使用 RecordStatus） |
| `/analytics` | `GET /api/analytics?year=`（年度分析数据） |
| `/sync` | `GET /api/import/sources/status`，并复用各来源导入接口与任务接口 |
| `/sync/review` | `GET /api/library?importReview=pending|ignored`, `POST /api/library/import-review` |
| `/data-health` | `GET /api/data-health/summary`, `GET /api/data-health/issues`, `GET /api/data-health/duplicates`, `POST/DELETE /api/data-health/duplicates/review`, `POST /api/data-health/repair`（数据完整性审计、重复候选裁决和定向修复） |
| `/tools` | `GET /api/tools/export-library`, `GET /api/tools/search?query=`, `POST /api/tools/convert-category` |
| `/radar` | `GET /api/radar?...&syncType=new_release`, `POST /api/radar/sync-new-releases` |
| `/popular` | `GET /api/radar?...&syncType=popular`, `POST /api/radar/sync` |
| `/login` | `GET /api/auth/status`, `POST /api/auth/login` |
| `/settings` | `GET/PUT /api/settings` (环境变量配置) |
| — | `GET /api/health`（公开健康检查，包含数据库可用性） |
| — | `POST /api/import/douban-harvest` (豆瓣导入/爬取) |
| — | `GET /api/import/douban-harvest/status` (任务进度) |
| — | `GET /api/import/tasks` (所有任务列表) |
| — | `GET /api/import/platforms/status`（Xbox/PSN 导入可用性，不返回敏感配置） |
| — | `DELETE /api/import/tasks/:taskId` (取消任务) |
| — | `POST /api/import/tmdb-enrich/backfill?limit=50` (批量为已有记录补充 TMDB 数据) |
| — | `POST /api/import/tmdb-detail/backfill?limit=50` (按 tmdbId 回填完整详情：imdbId/voteAverage/title/overview/genres 等) |
| — | `POST /api/import/steam/backfill` (回填已有 Steam 游戏的海报和游玩时间) |

## 关键模式

- **服务边界：** 后端默认监听 `127.0.0.1`，CORS 默认只允许 `localhost:18888` 和 `127.0.0.1:18888`；如需局域网访问，必须显式配置 `HOST` 和 `CORS_ALLOWED_ORIGINS`。
- **认证：** 简单 JWT，默认 `AUTH_ENABLED=false`。启用前必须设置至少 32 个字符的 `JWT_SECRET` 和至少 8 个字符的非默认 `JWT_PASSWORD`，否则配置接口拒绝保存且服务拒绝启动。设为 `true` 后，除 `/api/auth/login`、`/api/auth/status`、`/api/health` 和带一次性 `state` 校验的 `/api/trakt/callback` 外，API 都必须携带有效 Bearer Token。
- **健康检查：** `GET /api/health` 无需鉴权；数据库正常返回 200，数据库不可用时返回 503，响应不包含底层错误或连接信息。
- **前端鉴权门禁：** 应用启动时先读取 `GET /api/auth/status`；关闭认证时直接进入系统且隐藏退出按钮，开启认证时才要求本地 Token。
- **认证状态失败：** `GET /api/auth/status` 读取失败时必须显示连接错误与重试，不能静默当作“认证已开启”并把用户误导到登录页；并发初始化请求必须采用最新请求获胜。
- **路由加载：** 页面和搜索组件统一通过 `React.lazy` 按路由加载；不要把 Recharts 等页面级重依赖重新静态引入首屏。
- **路由失败：** 懒加载等待状态必须使用 i18n；页面模块或渲染失败时由全局错误边界显示原因和重新加载入口，不能白屏或永久停留在加载提示。
- **Settings 页面：** 敏感配置只返回 `configured` 状态，不回传现有明文；密码框留空表示保留原值，输入新值才会覆盖。写入时校验已知字段、布尔/数字类型及危险字符，并通过同目录临时文件原子替换 `.env`。
- **Settings 读取：** 配置读取必须采用最新请求获胜，页面卸载时使在途请求失效；读取失败必须持续显示错误与重试入口，不能只弹 Toast 后留下空白配置区。
- **国际化：** Zustand `i18nStore`，提供 `t()` 函数，EN/ZH 字典，持久化到 localStorage。所有新组件必须 i18n。
- **操作日志：** Prisma `$extends` 中间件自动记录 Movie/TvShow/Game 的 CREATE/UPDATE/DELETE，支持撤销；任务记录 `TASK_START|TASK_DONE|TASK_FAIL|TASK_CANCEL` 完整生命周期。“数据变更”筛选覆盖 `CREATE|UPDATE|DELETE|UNDO`，“任务”筛选按 `TASK` 实体查询全部任务事件。`/activity` 页面带筛选和无限滚动，筛选与分页请求必须采用最新请求获胜，旧分页不能追加到新筛选；记录级历史也必须绑定当前实体并在切换或卸载时使旧请求失效；全局与记录级读取失败必须显示错误和重试，不能伪装为空状态，撤销失败必须反馈原因。
- **数据健康：** `/data-health` 只读审计显示字段缺口，不自动修改记录；电影/剧集检查封面、简介、日期和外部 ID，游戏只检查封面和外部 ID，问题列表按 BigInt ID 游标分页。字段问题与重复候选的首屏、分页和操作后刷新必须绑定当前类别/筛选与最新请求，不能跨视图混入旧结果；摘要、字段队列和重复候选错误必须独立显示并可重试，读取失败不能显示“没有问题”的健康空状态。
- **统一记录详情：** `/library/:category/:id` 展示个人状态、评分、短评、来源身份与原始字段、游戏指标和记录级操作历史，并可保存个人记录、重新匹配元数据或进入数据健康页。记录库、时间线、活动日志和 Showcase 均提供详情入口；路由变化或页面卸载时必须使旧详情读取失效，旧成功或旧错误不能覆盖当前记录；有效地址读取失败必须显示具体原因和原地重试，无效地址只提供返回入口。
- **记录库读取：** 记录库首屏、筛选与分页必须绑定当前列表请求；切换筛选时立即清空旧筛选记录和分页状态，同条件刷新失败时保留已有记录与游标；旧分页的成功或失败不能追加或污染新列表，首屏、刷新和分页失败都必须显示原因并可重试原请求。
- **仪表盘语义：** 首页统计按钮只重新读取 `/api/profile/summary`，必须标为“刷新统计”，不能伪装成同步操作；共享 `profileStore` 的并发读取必须采用最新请求获胜。初次读取失败必须显示原因和重试，不能用全零指标伪装成空库；已有摘要刷新失败时保留旧数据并明确报错。真实同步统一进入 `/sync`。最新入库记录直接链接统一详情页。
- **随机推荐：** Showcase 的随机推荐可按类别和 WANT/IN_PROGRESS 状态筛选；筛选直接下推到 `/api/library/random`，不能先随机全库再由前端过滤；读取失败必须显示原因和重试，不能伪装为当前筛选无记录。
- **展示读取：** Showcase 摘要的加载、失败和重试文案必须使用 i18n；摘要读取失败时必须持续显示具体原因和原地重试入口，不能留下无法恢复的错误页。
- **海报轮换：** Showcase 自动海报墙的定时请求必须采用最新批次获胜；慢旧批次的成功或失败不能覆盖已经显示的新批次。
- **数据健康修复：** `POST /api/data-health/repair` 每次最多处理 50 条并创建唯一后台任务，只填充所选空字段及对应空 TMDB 原始字段；电影/剧集使用 TMDB，游戏仅支持 RAWG 封面，游戏外部 ID 必须人工核对，不能按标题自动绑定。
- **重复候选：** `/data-health/duplicates` 只读分组外部 ID 相同的记录；无共同外部 ID 时，影视仅按规范化标题+年份、游戏仅按规范化标题+平台匹配。候选可逐条纠正辅助元数据，或整组标记为“确认不同”并恢复；裁决指纹随成员和共享标识变化而失效。不能自动合并或删除，豆瓣来源身份和原始字段必须保留。
- **豆瓣数据保护：** Prisma 写入层拒绝删除带 `doubanId` 的 Movie/TvShow，单条删除、批量删除和活动撤销均返回 403；豆瓣影视的 CREATE 活动日志必须返回 `undoable=false`，前端不能显示撤销入口。分类转换仅允许在同一事务完整复制记录后删除源记录。
- **资料库快照：** `GET /api/tools/export-library` 在只读事务中按 ID 导出全部 Movie/TvShow/Game 字段，包含豆瓣原始字段和导入审核状态；快照格式为 `pixelreel-library-export` v1，不包含环境变量、Settings 或任何凭据，也不提供覆盖/恢复写入入口。
- **工具页搜索：** 类型转换前的记录搜索失败必须持续显示具体原因和重试入口，不能清空结果后伪装成“未找到”；页面卸载时必须使在途搜索失效。
- **外部 API 限流：** 服务启动时注册全局 Axios `RateLimiter`，同一外部服务请求起始时间至少间隔 2 秒；图片代理的 HEAD 与 `arraybuffer` 下载不计入 API 限流，429 仍按各服务原有策略退避。
- **导入参数：** 导入和回填接口的 `limit` 默认 50、范围 1-100；`status` 只能使用 `RecordStatus` 枚举；无效豆瓣模式和数组/空标识参数统一返回 400，不能静默回退或启动任务。
- **主机平台导入：** Xbox/PSN 当前是未通过真实账号链路验证的实验性代码。游戏搜索只提供 RAWG/Steam；同步中心仅标记 Xbox/PSN“实验性未接入”，不提供启动入口，也不计入正式可用来源。
- **同步中心：** `/sync` 集中展示豆瓣、Trakt、Steam 的配置可用性和同步入口；`GET /api/import/sources/status` 只返回缺失原因，不返回凭据。`GET /api/import/sources/history` 从 `data/sync-history.json` 返回每个正式来源最近一次终态摘要，不含凭据；当前任务优先展示，历史摘要作为次级信息并随任务状态变化刷新，历史读取失败不能阻断来源状态与同步入口。来源状态和历史记录读取必须采用最新请求获胜，依赖变化或页面卸载时使在途请求失效；全局 `taskStore` 的定时与手动轮询也必须采用最新请求获胜，停止轮询时使在途请求失效。Steam 使用 `/api/import/steam/owned/task`，Trakt 使用 `/api/trakt/import/{movies|shows}/task`，配置缺失时跳转到 Settings 对应分类。
- **雷达列表：** `/radar` 与 `/popular` 的分类、平台和分页请求必须采用最新请求获胜，旧筛选响应不能覆盖当前列表；读取失败必须保留明确错误与重试入口，不能伪装成空结果。
- **时间线：** `/timeline` 的主列表、分页与年份列表必须绑定当前分类/年份和最新请求；切换分类或年份时立即清空旧筛选记录和分页状态，同条件刷新失败时保留已有记录与游标；旧分页失败不能污染新筛选，首屏、刷新和分页失败必须显示错误并重试原请求，不能同时伪装为空状态；时间线与 Showcase 共用的按需详情弹窗读取失败时必须显示具体原因和原地重试。
- **外部搜索：** 电影、剧集和游戏搜索结果必须绑定发起请求时的 Provider 与最新请求，切换 Provider 时使在途搜索失效；电影和游戏的展开详情也必须独立采用最新请求获胜，不能把旧条目详情显示到新条目下。
- **重新刮削：** 搜索结果必须绑定当前关键词、Provider 和最新请求；选择候选后必须锁定为单次详情读取与写入，完成前不能关闭弹窗或并发选择另一候选。
- **命令抽屉：** 豆瓣、Trakt、Steam 快捷操作必须复用与同步中心相同的持久化任务端点，并由全局 `taskStore` 显示运行状态和冲突；不能调用旧同步接口或在抽屉内自行轮询。长时间数据修复统一跳转 `/data-health`，不在抽屉内直接执行。
- **导入审核：** 历史记录和手动新增默认 `ACCEPTED`；豆瓣、Trakt、Steam 等外部导入的新记录显式写入 `PENDING`。`/sync/review` 可批量改为 `ACCEPTED` 或 `IGNORED`，忽略仅修改 `importReviewState`，不能删除记录或改写豆瓣原始字段。标签切换、分页和决定后的刷新必须同时校验当前标签与最新请求，不能让旧标签响应覆盖当前列表；首屏读取失败必须显示具体原因和重试，已有队列的刷新或分页失败必须保留已读记录并可重试原请求。
- **主机游戏完整性：** PSNProfiles 按 `?ajax=1&page=N` 读取全部游戏页，直到页面声明 `nextPage = 0`，最多 100 页；Cloudflare 验证页会提示更新 Cookie。Xbox/PSN 原始记录缺封面时通过 RAWG 按标题回退查询，仍遵守同服务两秒限流。
- **记录编辑：** 路径 `id` 必须是 JavaScript 安全范围内的正整数；Library PATCH 只接受 `status`、`rating`、`shortReview`，评分限定 1-5，短评最长 1000 字符，非法请求在写库前返回 400。
- **HTTP 错误边界：** 路由内部异常统一交给 `errorHandler`；4xx 保留可操作提示且只记录单行警告，5xx 客户端固定返回“内部服务器错误”，详细堆栈只写服务端日志。Express 框架指纹响应头已关闭。
- **活动日志参数：** `/api/activity` 的 `limit`、游标、实体 ID 和日期必须通过格式校验；非法值及反向日期范围返回 400，不能进入 Prisma 或被记录成 500。
- **海报填充：** 电影/剧集用 TMDB，游戏用 RAWG。受全局 2 秒外部 API 限流并支持 429 重试。
- **搜索 Provider：** 电影搜索支持 OMDb/TMDB/豆瓣/IMDb/Trakt；剧集支持 TMDB/豆瓣；游戏支持 RAWG/Steam。IMDb Provider 复用 OMDb API。OMDb/IMDb 搜索中文关键词时自动通过 TMDB 获取英文原名回退（按 vote_count 排序）。RAWG 和 Steam 搜索中文关键词时通过 MyMemory API 翻译为英文再搜索。Steam 海报使用 CDN 地址 `cdn.akamai.steamstatic.com`。豆瓣搜索使用公开接口 `/j/subject_suggest`，不需要 Cookie。
- **搜索详情：** 前端搜索结果点击可展开详情。影视详情：评分、类型、导演、演员、片长、剧情。游戏详情：RAWG/Steam 评分、Metacritic、开发商、发行商、平台、游玩时长、ESRB、截图（`screenshots` 数组）。后端提供 `/api/search/imdb/:imdbId`、`/api/search/tmdb/:tmdbId`、`/api/search/douban/:doubanId`、`/api/search/rawg/:rawgId`、`/api/search/steam/:steamAppId` 五个详情接口。
- **海报图片：** Steam 海报有两种 CDN 格式——旧格式 `cdn.akamai.steamstatic.com/steam/apps/{id}/header.jpg`（大部分游戏可用）和新格式 `shared.akamai.steamstatic.com/store_item_assets/steam/apps/{id}/{hash}/header.jpg`（新游戏必须用这个）。图片加载失败时自动显示赛博朋克占位符（`ImgWithFallback` 组件）。
- **状态显示规则：** 有游玩时长（`playtimeMinutes > 0`）且原状态为 WANT 的游戏，在统计、记录库、详情、时间线和随机推荐中按 IN_PROGRESS 处理；不批量改写已有数据库记录。
- **豆瓣图片代理：** 豆瓣图片有防盗链，需通过 `/api/search/proxy/image?url=` 代理访问，自动将 `imgN.doubanio.com` 替换为 `img1.doubanio.com`（反爬较松）。
- **Trakt 导入：** 自动分页，按 traktId/tmdbId/imdbId 去重，导入时拉取 TMDB 海报。
- **数据原则：** 豆瓣数据为主（`douban_*` 字段原样存入），TMDB 为辅（`tmdb_*` 字段补缺），各平台评分互不转换。
- **主来源归属：** 首页、记录库、时间线和年度分析统一复用 `LibraryService` 的来源判定；媒体按豆瓣 → TMDB → IMDb → Trakt → 手动的优先级归属，TMDB 补全不能把豆瓣记录改判为 TMDB。
- **TMDB 详情回填：** `TmdbDetailBackfillService` 按 tmdbId 调 `/movie/{id}` 或 `/tv/{id}+external_ids`，补全 imdbId/voteAverage/popularity/title/overview/genres。只写空字段，不覆盖已有数据。
- **年份筛选：** AnalyticsService 中「已完成」对豆瓣影视优先使用严格合法的 `doubanDate`，缺失或非法时回退 `updatedAt`；其他来源使用 `updatedAt`。评分、短评、Top 榜、来源分布和跨平台评分使用 `createdAt`。
- **分析年份：** `GET /api/analytics?year=` 同时返回按降序排列的 `availableYears`，由记录创建年份和完成年份并集生成，并保留当前选择。前端只能在该列表内跳转，过期年份请求不能覆盖最新结果。
- **分析读取：** 年度分析的加载、失败和重试文案必须使用 i18n；读取失败时必须持续显示具体原因和原地重试入口，不能留下无法恢复的错误页。
- **首页行动队列：** `GET /api/profile/summary` 的 `nextUp.resume` 按有效 IN_PROGRESS 游戏的游玩时长降序排列，`nextUp.backlog` 按有效 WANT 记录的 `createdAt` 升序排列，`nextUp.reflect` 选取评分至少 4 分、已完成且无短评的记录并按评分和入库时间降序排列；三组各取 4 条，只读推导且不写数据库。
- **本月回声：** `GET /api/profile/summary` 的 `monthlyMemories` 沿用年度分析的完成日期口径，从每个往年的当前月份选择评分最高的一条已完成记录，最近年份优先，最多 5 条；只读推导且不写数据库。
- **tmdbGenreIds 格式：** 逗号分隔字符串（如 `"28,12,878"`），不是数组。Prisma schema 为 String 类型。
- **赛博朋克主题：** CSS 自定义属性（`--accent: #d4ff00`，`--accent-deep: #ff4400`），Syne + JetBrains Mono 字体，扫描线遮罩。Showcase 专用类（`@layer components`）：`.showcase-panel`（发光边框面板）、`.showcase-number`（脉冲发光数字）、`.showcase-poster`（扫描线海报 + hover 发光）、`.showcase-bg`（动态径向渐变背景）。

## 深度文档

- 项目总览与当前能力 → `README.md`
- 认证设计 → `docs/plans/2026-04-08-multi-user-auth-design.md`（基于 Spring，需要重写为 Express 版本）
- 开发环境搭建 → `db/setup.md`

## 豆瓣数据导入（douban-harvester）

已集成到 `express-backend/src/services/douban-harvester/`，通过 API 触发，无需单独运行 CLI。

- **导入已有数据：** `POST /api/import/douban-harvest?mode=json` — 读取 `collect.json`，不需要 Playwright
- **全量数据同步：** `POST /api/import/douban-harvest?mode=full` — Playwright 爬豆瓣，**每次从0开始不续爬**，需要 `DOUBAN_USER_ID` + `npx playwright install chromium`
- **增量数据导入：** `POST /api/import/douban-harvest?mode=incremental` — 只抓新数据（需先全量同步过，或手动创建 `sync_state.json`）。日期比较用 `<`（严格小于），同一天的数据不会被过滤。
- **查询进度：** `GET /api/import/douban-harvest/status?taskId=xxx`
- **取消任务：** `DELETE /api/import/tasks/:taskId`
- 豆瓣来源影视数据受保护，系统不提供批量清空接口；失败或取消任务只能重试，不能删除已有豆瓣数据。
- 任务管理统一使用 `services/task-manager.ts`（不再有专用 task-manager），状态持久化到 `express-backend/data/tasks.json`。服务启动时将遗留 `running` 任务标记为因重启中断，终态保留 30 分钟。
- 同一任务类型最多允许一个 `running` 实例，重复启动由后端统一返回 409，不能只依赖前端按钮禁用。
- 前端 `AppShell` 生命周期内持续轮询任务列表，顶部 TASKS 数量不依赖任务面板是否打开；轮询失败时保留最后一次成功状态并在顶部入口、同步中心和任务面板明确警示，成功后自动清除。同步中心和全局任务面板的取消操作必须捕获失败并显示 Toast，不能产生未处理 Promise。
- 爬虫返回具体错误信息（超时/风控/用户取消），不再统一报"爬取被风控中止"
- 导入时自动查 TMDB 分类（movie/tv）并拉取海报，受全局 2 秒外部 API 限流
- 已有记录的 TMDB 数据回填：`POST /api/import/tmdb-enrich/backfill?limit=50`（异步任务，按标题搜 TMDB 补充 tmdbId 和 posterUrl）
  - 智能标题匹配：自动清理"第X季""Season X""剧场版"等干扰词，中英文混合标题拆分为多个候选逐个尝试
- 综艺归入 TvShow 表，不单独建表
- 豆瓣评分 1-5 星直接存入 `douban_rating` 和 `rating`，不再 ×2 转换

## 记录库分页

- `GET /api/library` 支持游标分页、全库筛选和全局排序：`?cursor=...&limit=50&category=movie&status=DONE&query=标题&source=douban&review=reviewed&importReview=pending&sort=rating`
- `sort` 支持 `recent|rating`，默认 `recent`；cursor 是包含排序方式、时间、类别和 ID 的不透明版本化字符串，必须原样传回，旧版 `recent` cursor 仍兼容
- 返回 `{ records: LibraryRecord[], nextCursor: string | null, totals: { total, rated, reviewed, completed } }`，`nextCursor` 为 null 表示无更多
- `source` 支持 `douban|tmdb|imdb|trakt|steam|rawg|xbox|psn|manual`；`review` 支持 `reviewed|unreviewed`；`importReview` 支持 `pending|accepted|ignored`
- `totals` 使用与列表相同的筛选条件且不受分页影响，前端统计卡片直接使用
- 前端用 IntersectionObserver 实现无限滚动，滚到底部自动 `fetchMore()`

## 数据库

- MySQL 8.4 运行在 NAS Docker（192.168.50.233:13306），非本地
- 豆瓣导入的影视数据在 `movie` 和 `tv_show` 表，**不能动**（Trakt 数据可以操作）
- TMDB 覆盖率约 93%，仅少数因 TMDB 无收录而缺失

## 常见陷阱

- `$PID` 是 PowerShell 只读变量 — 改用 `$backendPid` 等自定义变量名。
- 在 PowerShell 中用 `Stop-Process`，不要在 Git Bash 里用 `taskkill`（存在路径解析问题）。
- Trakt 导入必须调用 `fetchTmdbPosterUrl()`，并遵守全局 2 秒外部 API 限流 — 永远不要把 `posterUrl` 硬编码为 `null`。
- TMDB API 需要代理访问 — 必须设置 `HTTPS_PROXY` 环境变量（如 `http://127.0.0.1:7897`），否则所有 TMDB 请求会超时返回空。
- TMDB API 使用 v4 Bearer Token 认证 — `TMDB_API_KEY` 存的是 JWT（eyJ 开头），必须通过 `Authorization: Bearer` 请求头传递，不能用 `api_key` 查询参数（会 401）。
- `apiFetch` 已自动解析 JSON — 调用后直接用返回值，不要再调 `.json()`，否则 TypeError。
- Prisma `$extends()` 返回新客户端 — 必须用 `getDb()` 获取扩展后的实例，不能直接 import 原始 `prisma`。所有路由和服务统一用 `getDb()`。
- 新组件必须做 i18n — 在 `i18nStore.ts` 的 `dictionaries.en` 和 `dictionaries.zh` 中添加 key，组件中用 `t('key')` 渲染。
- Prisma `BigInt` 字段（如 `steamAppId`）比较时必须先统一类型；只有确认在安全整数范围内才能转 `Number()`。JSON 序列化时安全值返回数字，超出 `Number.MAX_SAFE_INTEGER` 的值返回十进制字符串。
- 不要用 Playwright 截图让模型分析页面效果 — 模型不支持图片输入，截图白费。需要理解页面时读代码或用 `browser_snapshot` 获取 DOM。
- `tsx watch` 会在 git commit 时重启后端；任务状态会恢复为“因重启中断”，但执行本身不会续跑。长时间回填仍使用 `npx tsx src/server.ts`（无 watch）启动。
