# PixelReel

个人影剧游记录平台 — 电影、电视剧、游戏统一管理。

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Express 5 + TypeScript + Prisma 6 (MySQL) — 端口 18889 |
| 前端 | React 18 + Vite + Zustand + TailwindCSS — 端口 18888 |
| 数据库 | MySQL (Prisma ORM) |

项目中还保留了一套 Java 后端（`src/`、`pom.xml`、`schema.sql`），基于 Spring Boot 3 + MyBatis Plus（端口 8080）。目前仍在仓库中但未启用。切换后端只需修改 Vite 代理目标（`frontend/vite.config.ts`）。

## 开发命令

```bash
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
src/                      ← Java Spring Boot 后端（遗留，仍在仓库中）
  main/java/com/pixelreel/
    controller/, config/, dto/, entity/, enums/, mapper/, service/
  pom.xml, schema.sql     ← 位于项目根目录

express-backend/src/
  config/         index.ts（环境配置）, db.ts（Prisma 单例）
  routes/         index.ts（聚合器）, auth, trakt, search, searchTvShows,
                  import, library, movie, game, tvShow, profile
  services/       search/（TMDB、OMDb、豆瓣、Trakt、IMDb、RAWG、Steam 等）
                  import/（Steam、Xbox、PSN、豆瓣 CSV、RAWG 封面、TMDB 封面）
                  LibraryService, ProfileSummaryService, ExternalSearchService
  middlewares/    auth.ts（JWT，当前未启用）, errorHandler.ts
  enums/          RecordStatus.ts（UNSET|WANT|IN_PROGRESS|DONE|DROPPED）
  dto/            library.ts, profile.ts, external-search.ts, import-summary.ts

frontend/src/
  pages/          DashboardPage, LibraryPage, LoginPage, TimelinePage
  components/     AppShell, MovieSearch, GameSearch, TvShowSearch, TimelinePopup
  stores/         authStore, profileStore, libraryStore, gameRecordStore, i18nStore
  types/          library.ts, profile.ts, externalSearch.ts, movie.ts
  api.ts          apiFetch 辅助函数（JWT Bearer，401 重定向）
```

## 路由

| 前端 | 后端 |
|------|------|
| `/` 仪表盘 | `GET /api/profile/summary` |
| `/movies/search` | `GET /api/search/movies` |
| `/tv-shows/search` | `GET /api/search/tv-shows` |
| `/games/search` | `GET /api/search/games` |
| `/library` | `GET /api/library`, `PATCH /api/library/:cat/:id` |
| `/timeline` | 复用 `libraryStore`，纯客户端分组统计 |
| `/login` | `POST /api/auth/login` |

## 关键模式

- **认证：** 简单 JWT，默认 `AUTH_ENABLED=false`。中间件已存在但未接入路由。
- **国际化：** Zustand `i18nStore`，提供 `t()` 函数，EN/ZH 字典，持久化到 localStorage。
- **海报填充：** 电影/剧集用 TMDB，游戏用 RAWG。带速率限制（250ms 间隔，429 重试）。
- **Trakt 导入：** 自动分页，按 traktId/tmdbId/imdbId 去重，导入时拉取 TMDB 海报。
- **赛博朋克主题：** CSS 自定义属性（`--accent: #d4ff00`，`--accent-deep: #ff4400`），Syne + JetBrains Mono 字体，扫描线遮罩。

## 深度文档

- 架构与数据模型 → `docs/PROJECT_STATUS.md`
- 认证设计 → `docs/plans/2026-04-08-multi-user-auth-design.md`（基于 Spring，需要重写为 Express 版本）

## 常见陷阱

- `$PID` 是 PowerShell 只读变量 — 改用 `$backendPid` 等自定义变量名。
- 在 PowerShell 中用 `Stop-Process`，不要在 Git Bash 里用 `taskkill`（存在路径解析问题）。
- Trakt 导入必须调用 `fetchTmdbPosterUrl()` 并间隔 250ms — 永远不要把 `posterUrl` 硬编码为 `null`。
