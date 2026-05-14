# PixelReel

> 个人影剧游记录平台，把电影、电视剧和游戏放进同一套自己的库。

## 简介

PixelReel 是一个面向个人使用的影视与游戏记录项目。
当前代码状态已覆盖四条主线能力：

- **搜索**：电影多 Provider 搜索、电视剧 TMDB 搜索、游戏 RAWG / Steam 搜索
- **平台导入**：Trakt 影视导入、Steam / Xbox / PSN 游戏导入
- **个人主页统计**：首页总览、状态分布、来源分布、最近新增
- **记录库**：电影 / 电视剧 / 游戏混合列表、筛选排序、评分与短评编辑

## 已完成功能

- 电影 / 游戏 / 电视剧基础 CRUD
- 影视搜索：TMDB / OMDb / Trakt / 豆瓣 / IMDb
- 电视剧搜索：TMDB
- 游戏搜索：RAWG 主搜索、Steam 精搜
- Trakt 影视导入（电影 + 电视剧）
- Steam 已购导入
- Xbox 已玩导入（OpenXBL）
- PSN 已玩导入（PSNProfiles）
- RAWG 封面补全
- TMDB 封面补全（影视）
- 平台 + 外部 ID 去重
- 成就 / 奖杯总数与已解锁统计
- JWT 登录鉴权 + 前端登录页
- 个人主页统计接口与前端首页（含电视剧统计）
- 记录库混合列表页：筛选、排序、状态编辑、评分和短评编辑（含电视剧）
- 前端路由：主页 / 电影搜索 / 电视剧搜索 / 游戏搜索 / 记录库
- 前端国际化（EN / ZH）

## 当前未完成

- 多用户登录与权限体系
- 豆瓣 CSV 导入稳定方案
- Switch 接入
- 多用户登录后的用户隔离记录库
- 电视剧多 Provider 搜索（豆瓣、IMDb、Trakt 等）

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端（当前） | Express 5, TypeScript, Prisma 6 (MySQL) |
| 后端（备选） | Spring Boot 3, MyBatis Plus (Java) |
| 前端 | React 18, React Router, Zustand, TailwindCSS, Vite |
| 影视数据 | TMDB, OMDb, Trakt, 豆瓣, IMDb |
| 游戏数据 | RAWG, Steam Web API, OpenXBL, PSNProfiles |

## 本地启动

### 方式一：Express 后端（当前默认）

```bash
cd express-backend
npm install
cp .env.example .env
# 编辑 .env，填入数据库连接和 API Key
npx prisma generate
npx prisma db push
npm run dev        # 默认端口 18889
```

### 方式二：Java Spring Boot 后端

```bash
# 在 src/main/resources/application-local.yml 中配置
mvn clean spring-boot:run
# 默认端口 8080
```

> 切换后端时，修改 `frontend/vite.config.ts` 中的 proxy target 指向对应端口。

### 启动前端

```bash
cd frontend
npm install
npm run dev
# 默认地址：http://localhost:18888
# 代理已配置指向 Express 后端 18889
```

## 主要接口

### CRUD

```text
GET    /api/movies              电影列表
GET    /api/movies/:id          电影详情
POST   /api/movies              创建电影
PUT    /api/movies/:id          更新电影
DELETE /api/movies/:id          删除电影

GET    /api/games               游戏列表
GET    /api/games/:id           游戏详情
POST   /api/games               创建游戏
PUT    /api/games/:id           更新游戏
DELETE /api/games/:id           删除游戏

GET    /api/tv-shows             电视剧列表
GET    /api/tv-shows/:id        电视剧详情
POST   /api/tv-shows            创建电视剧
PUT    /api/tv-shows/:id        更新电视剧
DELETE /api/tv-shows/:id        删除电视剧
```

### 搜索

```text
GET /api/search/movies?query=xxx&page=1&providers=tmdb
GET /api/search/tv-shows?query=xxx&page=1&providers=tmdb
GET /api/search/games?query=xxx&page=1&providers=rawg
```

### 导入

```text
POST /api/import/steam/owned?steamId=xxx&status=WANT
POST /api/import/xbox/owned?gamertag=xxx&status=UNSET
POST /api/import/psn/owned?psnId=xxx&status=UNSET
POST /api/import/covers/fill?limit=50
POST /api/import/tmdb-covers/fill?limit=50
POST /api/trakt/import/movies?status=WANT
POST /api/trakt/import/shows?status=WANT
```

### Trakt OAuth

```text
GET  /api/trakt/auth              发起 Trakt 授权
GET  /api/trakt/callback          授权回调
```

### 个人主页

```text
GET /api/profile/summary
```

返回内容包括：

- 总记录数、电影数、游戏数、电视剧数
- 各类已完成数量、评分均值
- 电影 / 游戏 / 电视剧状态分布
- 电影 / 游戏 / 电视剧来源/平台分布
- 最近新增记录（混合排序）

### 记录库

```text
GET   /api/library                  混合列表（movie + game + tv_show）
PATCH /api/library/:category/:id    更新记录（category: movie/game/tv_show）
```

### 鉴权

```text
POST /api/auth/login    登录获取 JWT Token
```

## 当前前端路由

```text
/                   个人主页统计首页
/movies/search      电影搜索
/tv-shows/search    电视剧搜索
/games/search       游戏搜索
/library            记录库列表 + 评分短评工作台
/login              登录页
```

## License

MIT