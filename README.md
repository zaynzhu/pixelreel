# PixelReel

> 个人影游记录平台，把电影和游戏放进同一套自己的库。

## 简介

PixelReel 是一个面向个人使用的影视与游戏记录项目。
当前代码状态已经覆盖三条主线能力：

- 搜索：电影多 Provider 搜索、游戏 RAWG / Steam 搜索
- 平台导入：Steam / Xbox / PSN
- 个人主页统计：首页总览、状态分布、来源分布、最近新增

## 已完成功能

- 电影 / 游戏基础 CRUD
- 影视搜索：TMDB / OMDb / Trakt / 豆瓣
- 游戏搜索：RAWG 主搜索、Steam 精搜
- Steam 已购导入
- Xbox 已玩导入（OpenXBL）
- PSN 已玩导入（PSNProfiles）
- RAWG 封面补全
- 平台 + 外部 ID 去重
- 成就 / 奖杯总数与已解锁统计
- 个人主页统计接口与前端首页
- 前端路由骨架：主页 / 电影搜索 / 游戏搜索 / 记录库占位页

## 当前未完成

- 多用户登录与权限体系
- 豆瓣 CSV 导入稳定方案
- Switch 接入
- 评分与短评体验完善
- 记录库完整列表页

## 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Spring Boot 3, MyBatis Plus |
| 数据库 | MySQL |
| 前端 | React 18, React Router, Zustand, TailwindCSS, Vite |
| 影视数据 | TMDB, OMDb, Trakt, 豆瓣 |
| 游戏数据 | RAWG, Steam Web API, OpenXBL, PSNProfiles |

## 本地启动

### 1. 初始化数据库

执行根目录下的 `schema.sql`。

### 2. 配置后端环境

建议在 `src/main/resources/application-local.yml` 中覆盖本地配置，或直接使用环境变量。

常用配置项：

- `spring.datasource.url`
- `spring.datasource.username`
- `spring.datasource.password`
- `TMDB_API_KEY`
- `RAWG_API_KEY`
- `OPENXBL_API_KEY`
- `PSNPROFILES_COOKIE`

### 3. 启动后端

```bash
mvn clean spring-boot:run
```

默认地址：`http://localhost:8080`

### 4. 启动前端

```bash
cd frontend
npm install
npm run dev
```

默认地址：`http://localhost:5173`

前端已配置 `/api` 代理到 `http://localhost:8080`。

### 5. 构建验证

后端：

```bash
mvn test
```

前端：

```bash
cd frontend
npm run build
```

## 主要接口

### 搜索

```text
GET /api/search/movies?query=xxx&page=1&providers=tmdb
GET /api/search/games?query=xxx&page=1&providers=rawg
```

### 导入

```text
POST /api/import/steam/owned?steamId=xxx&status=WANT
POST /api/import/xbox/owned?gamertag=xxx&status=UNSET
POST /api/import/psn/owned?psnId=xxx&status=UNSET
POST /api/import/covers/fill?limit=50
```

### 个人主页

```text
GET /api/profile/summary
```

返回内容包括：

- 总记录数、电影数、游戏数
- 已完成数量
- 评分均值
- 电影来源分布
- 游戏平台分布
- 最近新增记录

## 当前前端路由

```text
/                个人主页统计首页
/movies/search   电影搜索
/games/search    游戏搜索
/library         记录库占位页
```

## License

MIT
