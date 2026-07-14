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
npm run check           # TypeScript 构建 + 核心回归测试
```

完整搭建步骤见 [db/setup.md](../db/setup.md)。

## 环境变量

见 `.env.example` 和根目录 README.md 的「配置项」章节。关键变量：

| 变量 | 说明 | 必填 |
|------|------|------|
| `DATABASE_URL` | MySQL 连接字符串 | 是 |
| `PORT` | 服务端口（默认 18889） | 否 |
| `HOST` | 监听地址（默认 127.0.0.1） | 否 |
| `CORS_ALLOWED_ORIGINS` | 允许的前端 Origin，逗号分隔 | 否 |
| `JWT_SECRET` | JWT 密钥（启用认证时至少 32 个字符） | 启用认证时 |
| `JWT_PASSWORD` | 登录密码（启用认证时至少 8 个字符） | 启用认证时 |
| `AUTH_ENABLED` | 启用 JWT 鉴权（默认 false） | 否 |
| `TMDB_API_KEY` | TMDB API v4 Bearer Token | 按需 |
| `OMDB_API_KEY` | OMDb API Key | 按需 |
| `RAWG_API_KEY` | RAWG API Key | 按需 |
| `STEAM_WEB_API_KEY` | Steam Web API Key | 按需 |
| `HTTPS_PROXY` | HTTPS 代理（TMDB 国内必需） | 按需 |
| `DOUBAN_USER_ID` | 豆瓣用户 ID（爬取用） | 按需 |
| `RADAR_ENABLED` | 雷达模块总开关（默认 false） | 否 |

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
| GET | `/api/auth/status` | 查询是否启用登录鉴权 |
| POST | `/api/auth/login` | 登录获取 JWT Token |
| GET | `/api/health` | 公开健康检查，包含数据库可用性 |
| GET | `/api/settings` | 获取环境变量配置（敏感值脱敏） |
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
2. **服务边界**：默认监听 `127.0.0.1`，CORS 仅允许本机前端；局域网部署需显式配置 `HOST` 与 `CORS_ALLOWED_ORIGINS`。
3. **JWT 鉴权可选**：默认关闭（`AUTH_ENABLED=false`）；启用前必须设置至少 32 个字符的非示例 `JWT_SECRET` 和至少 8 个字符的非默认 `JWT_PASSWORD`，否则配置接口拒绝保存且服务拒绝启动。启用后除认证状态、登录和健康检查外的 API 都要求有效 Bearer Token。
4. **配置安全**：敏感配置只返回 `configured` 状态，不回传现有明文；空密码值表示保留原配置。更新接口校验字段类型和危险字符，并以临时文件原子替换 `.env`。
5. **BigInt 序列化**：`server.ts` 中有 `BigInt.prototype.toJSON` 补丁，切勿移除。
6. **`getDb()`**：所有路由和服务必须用 `getDb()` 获取 Prisma 扩展客户端，不能直接 import 原始 prisma。
7. **TMDB API 代理**：国内必须设置 `HTTPS_PROXY`，否则 TMDB 请求超时。
8. **TMDB Bearer Token**：`TMDB_API_KEY` 存的是 JWT（eyJ 开头），必须通过 `Authorization: Bearer` 传递。
9. **外部 API 限流**：全局 Axios `RateLimiter` 按服务主域名保证请求起始时间至少间隔 2 秒；图片代理二进制下载除外。
10. **任务恢复**：任务状态持久化到 `data/tasks.json`；重启前仍在运行的任务会恢复为失败并标记“因服务重启中断”，终态保留 30 分钟。
11. **任务并发**：同一任务类型最多允许一个运行实例，重复启动返回 409。
12. **tsx watch 陷阱**：git commit 会触发重启；任务执行不会自动续跑。长时间回填仍使用 `npx tsx src/server.ts`。
13. **豆瓣数据保护**：Prisma 写入层禁止删除带 `doubanId` 的电影和剧集；分类转换仅在同一事务完整复制后允许删除源记录。
