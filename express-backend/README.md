# PixelReel Express Backend

Node.js (Express 5 + TypeScript + Prisma) 后端，与 Java Spring Boot 后端 API 完全对齐。

> **重要**：本项目使用 Express 5，原生支持 async 路由错误自动转发到 errorHandler。如果降级到 Express 4.x，需要额外包裹 try-catch 或使用 `express-async-errors`。

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，填入数据库连接和 API Key

# 3. 生成 Prisma Client
npx prisma generate

# 4. 启动开发服务器
npm run dev
```

服务默认监听 `http://localhost:18889`

## 环境变量

见 `.env.example`，需要配置：

| 变量 | 说明 | 必填 |
|------|------|------|
| `DATABASE_URL` | MySQL 连接字符串 | 是 |
| `PORT` | 服务端口（默认 18889） | 否 |
| `JWT_SECRET` | JWT 密钥 | 是 |
| `JWT_USERNAME` | 登录用户名 | 是 |
| `JWT_PASSWORD` | 登录密码 | 是 |
| `AUTH_ENABLED` | 启用 JWT 鉴权（默认 false，与 Java 端一致） | 否 |
| `TMDB_API_KEY` | TMDB 搜索 API Key | 按需 |
| `OMDB_API_KEY` | OMDb 搜索 API Key | 按需 |
| `TRAKT_CLIENT_ID` | Trakt Client ID | 按需 |
| `TRAKT_CLIENT_SECRET` | Trakt Client Secret | 按需 |
| `TRAKT_ACCESS_TOKEN` | Trakt 访问令牌 | 按需 |
| `RAWG_API_KEY` | RAWG 搜索/封面 API Key | 按需 |
| `STEAM_WEB_API_KEY` | Steam Web API Key | 按需 |
| `STEAM_DEFAULT_STEAM_ID` | 默认 Steam ID | 否 |
| `OPENXBL_API_KEY` | OpenXBL API Key | 按需 |
| `OPENXBL_ENABLED` | 启用 Xbox 导入 | 否 |
| `PSN_PROFILES_COOKIE` | PSNProfiles Cookie | 按需 |
| `PSN_PROFILES_ENABLED` | 启用 PSN 导入 | 否 |
| `DOUBAN_COOKIE` | 豆瓣搜索 Cookie | 按需 |

## API 接口

### 电影 CRUD

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/movies` | 电影列表 |
| GET | `/api/movies/:id` | 电影详情 |
| POST | `/api/movies` | 创建电影 |
| PUT | `/api/movies/:id` | 更新电影 |
| DELETE | `/api/movies/:id` | 删除电影 |

### 游戏 CRUD

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/games` | 游戏列表 |
| GET | `/api/games/:id` | 游戏详情 |
| POST | `/api/games` | 创建游戏 |
| PUT | `/api/games/:id` | 更新游戏 |
| DELETE | `/api/games/:id` | 删除游戏 |

### 电视剧 CRUD

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/tv-shows` | 电视剧列表 |
| GET | `/api/tv-shows/:id` | 电视剧详情 |
| POST | `/api/tv-shows` | 创建电视剧 |
| PUT | `/api/tv-shows/:id` | 更新电视剧 |
| DELETE | `/api/tv-shows/:id` | 删除电视剧 |

### 搜索

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/search/movies?query=xxx&page=1&providers=tmdb` | 影视聚合搜索 |
| GET | `/api/search/tv-shows?query=xxx&page=1&providers=tmdb` | 电视剧聚合搜索 |
| GET | `/api/search/games?query=xxx&page=1&providers=rawg` | 游戏聚合搜索 |

### 导入

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/import/steam/owned` | Steam 导入 |
| POST | `/api/import/xbox/owned` | Xbox 导入 |
| POST | `/api/import/psn/owned` | PSN 导入 |
| POST | `/api/import/douban` | 豆瓣 CSV 导入 |
| POST | `/api/import/covers/fill` | RAWG 封面补全 |

### Trakt OAuth + 导入

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/trakt/auth` | 发起 Trakt OAuth 授权 |
| GET | `/api/trakt/callback` | OAuth 回调，获取 access_token |
| POST | `/api/trakt/import/movies?status=WANT` | 导入 Trakt 电影 |
| POST | `/api/trakt/import/shows?status=WANT` | 导入 Trakt 电视剧 |

### 记录库

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/library` | 混合记录列表（movie + game + tv_show） |
| PATCH | `/api/library/:category/:id` | 更新记录（category: movie/game/tv_show） |

### 个人统计

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/profile/summary` | 个人统计（含电视剧统计） |

### 鉴权

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 登录获取 JWT Token |

## 数据模型

三张主表共享相似结构：

```
movie     : id, tmdbId, imdbId, doubanId, traktId, title, posterUrl, status, rating, shortReview
tv_show   : id, tmdbId, imdbId, doubanId, traktId, title, posterUrl, firstAirDate, overview, status, rating, shortReview
game      : id, rawgId, steamAppId, xboxId, psnId, platform, title, posterUrl, playtimeMinutes, achievementTotal, achievementUnlocked, status, rating, shortReview
```

电视剧比电影多 `firstAirDate`（首播日期）和 `overview`（简介），没有 `doubanId` 搜索 Providers 暂未实现。

## 前端切换

前端 Vite 代理已配置指向 Express 后端（端口 18889）：

```ts
// frontend/vite.config.ts
proxy: {
  "/api": {
    target: "http://localhost:18889",
    changeOrigin: true,
  },
}
```

如需切回 Java 后端，改为 `http://localhost:8080`。

## 项目结构

```
express-backend/
├── prisma/schema.prisma          # 数据库模型（movie, tv_show, game）
├── src/
│   ├── server.ts                 # 入口 + BigInt 序列化补丁
│   ├── config/
│   │   ├── index.ts              # 环境变量配置
│   │   └── db.ts                 # Prisma 单例
│   ├── enums/RecordStatus.ts     # 记录状态枚举
│   ├── dto/                      # 响应 DTO
│   │   ├── external-search.ts    # 搜索结果（含电视剧搜索 DTO）
│   │   ├── import-summary.ts
│   │   ├── library.ts            # LibraryRecordResponse category 含 tv_show
│   │   └── profile.ts            # ProfileSummaryResponse 含电视剧统计
│   ├── middlewares/
│   │   ├── auth.ts               # JWT 鉴权
│   │   └── errorHandler.ts      # 全局错误处理
│   ├── routes/
│   │   ├── auth.ts
│   │   ├── movie.ts
│   │   ├── game.ts
│   │   ├── tvShow.ts             # 电视剧 CRUD
│   │   ├── search.ts             # 电影搜索
│   │   ├── searchTvShows.ts      # 电视剧搜索
│   │   ├── import.ts
│   │   ├── library.ts
│   │   ├── profile.ts
│   │   └── trakt.ts              # OAuth + 电影/电视剧导入
│   └── services/
│       ├── ExternalSearchService.ts  # 搜索聚合（电影+电视剧+游戏）
│       ├── LibraryService.ts         # 混合列表（movie+game+tv_show）
│       ├── ProfileSummaryService.ts  # 统计（含电视剧统计）
│       ├── provider/                 # 搜索 Provider
│       │   ├── MovieSearchProvider.ts
│       │   ├── GameSearchProvider.ts
│       │   ├── TvShowSearchProvider.ts  # 电视剧搜索接口
│       │   ├── TmdbMovieSearchProvider.ts
│       │   ├── OmdbMovieSearchProvider.ts
│       │   ├── TraktMovieSearchProvider.ts
│       │   ├── DoubanMovieSearchProvider.ts
│       │   ├── ImdbMovieSearchProvider.ts
│       │   ├── TmdbTvShowSearchProvider.ts  # TMDB 电视剧搜索
│       │   ├── RawgGameSearchProvider.ts
│       │   ├── SteamGameSearchProvider.ts
│       │   ├── PsnGameSearchProvider.ts
│       │   ├── XboxGameSearchProvider.ts
│       │   └── SwitchGameSearchProvider.ts
│       └── import/                # 平台导入服务
│           ├── SteamOwnedGamesImportService.ts
│           ├── OpenXblImportService.ts
│           ├── PsnProfilesImportService.ts
│           ├── DoubanCsvImportService.ts
│           └── RawgCoverFillService.ts
├── package.json
├── tsconfig.json
└── .env.example
```

## 技术栈

- **Express 5** + **TypeScript**
- **Prisma** (MySQL)
- **axios** — 外部 API 调用
- **cheerio** — PSNProfiles 页面解析
- **csv-parser** — 豆瓣 CSV 解析
- **multer** — multipart 文件上传
- **jsonwebtoken** — JWT 鉴权

## 注意事项

1. **Express 5 依赖**：本项目依赖 Express 5 的原生 async 错误转发能力。如果降级到 Express 4.x，所有 async 路由需要手动包裹 try-catch。
2. **JWT 鉴权可选**：默认关闭（`AUTH_ENABLED=false`），与 Java 端当前行为一致。启用后，除 `/api/auth/login` 外所有接口需携带 `Bearer <token>` 头。
3. **数据库共用**：与 Java 端共用同一个 MySQL 数据库，`updatedAt` 由 MySQL `ON UPDATE CURRENT_TIMESTAMP` 独立管理。
4. **RecordStatus**：包含 DROPPED 预留状态，对未知状态值做宽容处理（不会报错）。
5. **BigInt 序列化**：Prisma 使用 BigInt 作为 ID 类型，`server.ts` 中有 `BigInt.prototype.toJSON` 补丁，切勿移除。
6. **电视剧 category**：在 Library 和 Profile 接口中，电视剧的 category 字段值为 `"tv_show"`（不是 `"tvshow"`）。