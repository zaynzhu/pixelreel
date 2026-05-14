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
- [x] 电视剧搜索 Provider：TMDB
- [x] 游戏搜索 Provider：RAWG / Steam
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

## 未完成 / 占位
- [ ] 多用户登录与权限体系（设计文档在 docs/plans/，需重写为 Express 版）
- [ ] 豆瓣 CSV 导入前端界面（后端已支持，缺上传 UI）
- [ ] Switch 接入（占位）
- [ ] 电视剧多 Provider 搜索（豆瓣、IMDb、Trakt 等）

## 当前前端路由
- `/`：个人主页统计首页
- `/movies/search`：电影搜索
- `/tv-shows/search`：电视剧搜索
- `/games/search`：游戏搜索
- `/library`：记录库列表 + 评分短评编辑
- `/timeline`：时间线页面（按月份分组的海报墙）
- `/login`：登录页

## 关键接口
- `POST /api/auth/login`：JWT 登录
- `GET /api/profile/summary`：个人主页统计汇总
- `GET /api/library`：混合记录库列表
- `PATCH /api/library/:category/:id`：更新状态 / 评分 / 短评
- `GET /api/search/movies`：电影搜索聚合
- `GET /api/search/tv-shows`：电视剧搜索
- `GET /api/search/games`：游戏搜索聚合
- `POST /api/trakt/import/movies`：Trakt 电影导入
- `POST /api/trakt/import/shows`：Trakt 电视剧导入
- `POST /api/import/steam/owned`：Steam 已购导入
- `POST /api/import/xbox/owned`：Xbox 已玩导入
- `POST /api/import/psn/owned`：PSN 已玩导入
- `POST /api/import/covers/fill`：RAWG 游戏封面补全
- `POST /api/import/tmdb-covers/fill`：TMDB 影视封面补全

## 本地启动方式

### Express 后端（当前默认）
```bash
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

## 数据模型
三张核心表，共享类似结构：

| Model | 外部 ID | 特殊字段 |
|-------|---------|---------|
| Movie | tmdbId, imdbId, doubanId, traktId | title, posterUrl, status, rating, shortReview |
| TvShow | tmdbId, imdbId, doubanId, traktId | title, posterUrl, firstAirDate, overview, status, rating, shortReview |
| Game | rawgId, steamAppId, xboxId, psnId | title, posterUrl, platform, playtimeMinutes, achievementTotal, achievementUnlocked, status, rating, shortReview |

所有表使用 BigInt 自增主键，`createdAt`/`updatedAt` 由 MySQL 管理。