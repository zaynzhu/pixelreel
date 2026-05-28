# PixelReel Express Backend

Express 5 + TypeScript + Prisma 6 后端，替代原 Java Spring Boot（已归档至 `legacy/java-backend/`）。

> **重要**：本项目使用 Express 5，原生支持 async 路由错误自动转发到 errorHandler。如果降级到 Express 4.x，需要额外包裹 try-catch 或使用 `express-async-errors`。

## 快速开始

```bash
npm install
cp .env.example .env   # 编辑 .env，填入数据库连接和 API Key
npx prisma generate
npx prisma db push
npm run dev             # http://localhost:18889
```

完整搭建步骤见 [db/setup.md](../db/setup.md)。

## 环境变量

见 `.env.example` 和根目录 README.md 的「配置项」章节。关键变量：

| 变量 | 说明 | 必填 |
|------|------|------|
| `DATABASE_URL` | MySQL 连接字符串 | 是 |
| `PORT` | 服务端口（默认 18889） | 否 |
| `JWT_SECRET` | JWT 密钥 | 是 |
| `AUTH_ENABLED` | 启用 JWT 鉴权（默认 false） | 否 |
| `TMDB_API_KEY` | TMDB API v4 Bearer Token | 按需 |
| `OMDB_API_KEY` | OMDb API Key | 按需 |
| `RAWG_API_KEY` | RAWG API Key | 按需 |
| `STEAM_WEB_API_KEY` | Steam Web API Key | 按需 |
| `HTTPS_PROXY` | HTTPS 代理（TMDB 国内必需） | 按需 |
| `DOUBAN_USER_ID` | 豆瓣用户 ID（爬取用） | 按需 |
| `RADAR_ENABLED` | 雷达模块总开关（默认 true） | 否 |

## API 接口

### 搜索

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/search/movies?query=&providers=omdb,tmdb,douban,imdb,trakt` | 电影聚合搜索 |
| GET | `/api/search/tv-shows?query=&providers=tmdb,douban` | 电视剧聚合搜索 |
| GET | `/api/search/games?query=&providers=rawg,steam` | 游戏聚合搜索 |
| GET | `/api/search/imdb/:imdbId` | IMDb/OMDb 影视详情 |
| GET | `/api/search/tmdb/:tmdbId` | TMDB 影视详情 + credits |
| GET | `/api/search/douban/:doubanId` | 豆瓣影视详情 |
| GET | `/api/search/rawg/:rawgId` | RAWG 游戏详情 |
| GET | `/api/search/steam/:steamAppId` | Steam 游戏详情 |
| GET | `/api/search/proxy/image?url=` | 图片代理（防盗链） |

### 记录库与时间线

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/library?cursor=&limit=50&category=&year=&status=` | 混合记录列表（游标分页） |
| GET | `/api/library/:category/:id` | 单条完整记录 |
| PATCH | `/api/library/:category/:id` | 更新记录 |
| GET | `/api/library/random?limit=N` | 随机记录（N 最大 20） |
| GET | `/api/timeline?cursor=&limit=96&category=&year=` | 时间线轻量列表 |
| GET | `/api/timeline/years?category=` | 可选年份列表 |

### 导入

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/import/douban-harvest?mode=json\|full\|incremental` | 豆瓣数据导入/爬取 |
| GET | `/api/import/douban-harvest/status?taskId=xxx` | 任务进度 |
| GET | `/api/import/tasks` | 所有任务列表 |
| DELETE | `/api/import/tasks/:taskId` | 取消任务 |
| POST | `/api/import/douban/clear-data` | 清空豆瓣来源数据 |
| POST | `/api/import/tmdb-enrich/backfill?limit=50` | 批量补充 TMDB 数据 |
| POST | `/api/import/tmdb-detail/backfill?limit=50` | 按 tmdbId 回填详情 |
| POST | `/api/import/steam/backfill` | 回填 Steam 海报和游玩时间 |
| POST | `/api/trakt/import/movies` | Trakt 电影导入 |
| POST | `/api/trakt/import/shows` | Trakt 电视剧导入 |
| POST | `/api/import/steam/owned` | Steam 已购导入 |
| POST | `/api/import/xbox/owned` | Xbox 已玩导入 |
| POST | `/api/import/psn/owned` | PSN 已玩导入 |
| POST | `/api/import/covers/fill` | RAWG 封面补全 |
| POST | `/api/import/tmdb-covers/fill` | TMDB 封面补全 |

### 雷达

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/radar?category=&type=&platform=&source=&page=&limit=` | 雷达列表（含 inLibrary 标记） |
| GET | `/api/radar/status` | 各源同步状态 |
| POST | `/api/radar/sync` | 触发全量同步 |
| POST | `/api/radar/sync/:source` | 触发单源同步 |
| POST | `/api/radar/add-to-library` | 加入想看 |

### 其他

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/profile/summary` | 个人统计 |
| GET | `/api/analytics?year=` | 年度分析数据 |
| GET | `/api/activity` | 操作日志（游标分页 + 筛选） |
| POST | `/api/activity/:id/undo` | 撤销操作 |
| POST | `/api/auth/login` | 登录获取 JWT Token |
| GET | `/api/settings` | 获取环境变量配置 |
| PUT | `/api/settings` | 更新环境变量配置 |

## 项目结构

```
express-backend/
├── prisma/schema.prisma
├── src/
│   ├── server.ts                 # 入口 + BigInt 序列化补丁
│   ├── config/
│   │   ├── index.ts              # 环境变量配置
│   │   └── db.ts                 # Prisma 单例 + getDb() + registerExtensions()
│   ├── enums/RecordStatus.ts     # UNSET|WANT|IN_PROGRESS|DONE|DROPPED
│   ├── dto/                      # 响应 DTO
│   ├── middlewares/
│   │   ├── auth.ts               # JWT 鉴权
│   │   ├── errorHandler.ts       # 全局错误处理
│   │   └── activity-log.ts       # Prisma 扩展，自动记录 CRUD
│   ├── routes/                   # 路由聚合（index.ts 聚合所有子路由）
│   └── services/
│       ├── provider/             # 搜索 Provider（TMDB/OMDb/豆瓣/RAWG/Steam 等）
│       ├── import/               # 平台导入服务
│       ├── douban-harvester/     # 豆瓣爬虫核心 + TMDB 丰富 + 导入
│       ├── radar/                # 雷达服务（TMDB/优酷/腾讯 + 同步调度）
│       ├── LibraryService.ts
│       ├── TimelineService.ts
│       ├── ProfileSummaryService.ts
│       └── ExternalSearchService.ts
├── package.json
└── .env.example
```

## 注意事项

1. **Express 5 依赖**：依赖 Express 5 原生 async 错误转发。降级到 Express 4.x 需手动包裹 try-catch。
2. **JWT 鉴权可选**：默认关闭（`AUTH_ENABLED=false`）。
3. **BigInt 序列化**：`server.ts` 中有 `BigInt.prototype.toJSON` 补丁，切勿移除。
4. **`getDb()`**：所有路由和服务必须用 `getDb()` 获取 Prisma 扩展客户端，不能直接 import 原始 prisma。
5. **TMDB API 代理**：国内必须设置 `HTTPS_PROXY`，否则 TMDB 请求超时。
6. **TMDB Bearer Token**：`TMDB_API_KEY` 存的是 JWT（eyJ 开头），必须通过 `Authorization: Bearer` 传递。
7. **tsx watch 陷阱**：git commit 会触发重启，丢失内存中的任务状态。跑回填任务时用 `npx tsx src/server.ts`。
