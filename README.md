<div align="center">

# 🎬 PixelReel

**个人影剧游统一管理平台**

[中文](README.md) | [English](README_EN.md)

</div>

<div align="center">

![License](https://img.shields.io/github/license/zaynzhu/pixelreel?style=for-the-badge)
![Stars](https://img.shields.io/github/stars/zaynzhu/pixelreel?style=for-the-badge)
![Forks](https://img.shields.io/github/forks/zaynzhu/pixelreel?style=for-the-badge)
![Issues](https://img.shields.io/github/issues/zaynzhu/pixelreel?style=for-the-badge)
![Last Commit](https://img.shields.io/github/last-commit/zaynzhu/pixelreel?style=for-the-badge)

</div>

---

> [!TIP]
> PixelReel 是一个自托管的个人影剧游记录平台，将电影、电视剧和游戏统一管理。
> 支持从豆瓣、Trakt、Steam、Xbox、PSN 等多平台导入数据，聚合 TMDB、OMDb、RAWG 等数据源，
> 提供时间线、数据分析、大屏展示等丰富的可视化功能。

## ✨ Features

- **多平台搜索聚合** -- 同时搜索 TMDB、OMDb、豆瓣、IMDb、Trakt、RAWG、Steam，一个入口搜遍全网
- **一键数据导入** -- 从豆瓣、Trakt、Steam、Xbox、PSN 批量导入，自动填充海报和详情
- **统一记录库** -- 电影、电视剧、游戏混排展示，支持分类/年份/状态多维筛选和评分短评
- **时间线海报墙** -- 按月份分组的精美海报墙，支持年份切换和详情弹窗
- **雷达发现** -- 聚合 TMDB 热映/趋势 + 优酷/腾讯片单，一键加入想看列表
- **数据分析** -- 年度报告、月度趋势、评分分布、来源占比、跨平台评分对比
- **大屏展示** -- 网格模式 + 全屏轮播模式，适合投屏展示你的影剧游收藏
- **操作日志** -- 自动记录每次 CRUD 操作，支持撤销和筛选
- **后台任务恢复** -- 持久化导入/同步进度，服务重启后明确标记被中断任务，不再直接丢失状态

## 🚀 Quick Start

```bash
# 1. 克隆仓库
git clone https://github.com/zaynzhu/pixelreel.git
cd pixelreel

# 2. 初始化数据库
mysql -u root -p < db/init.sql

# 3. 启动后端
cd express-backend
npm install
cp .env.example .env   # 编辑 .env，填入数据库连接和 API Key
npx prisma generate
npx prisma db push
npm run dev             # http://localhost:18889

# 4. 启动前端（新终端）
cd frontend
npm install
npm run dev             # http://localhost:18888
```

> [!NOTE]
> 完整搭建步骤见 [db/setup.md](db/setup.md)。TMDB API 国内访问需要配置 `HTTPS_PROXY` 代理。

## 📦 Installation

### 前置要求

- Node.js >= 18
- MySQL 8.4+
- npm 或 pnpm

### 环境变量配置

编辑 `express-backend/.env`，配置以下关键项：

```bash
DATABASE_URL="mysql://user:password@host:3306/pixelreel"
TMDB_API_KEY="your_tmdb_bearer_token"    # TMDB API v4 Bearer Token
OMDB_API_KEY="your_omdb_key"             # OMDb API Key
TRAKT_CLIENT_ID="your_trakt_client_id"   # Trakt API
RAWG_API_KEY="your_rawg_key"             # RAWG API
STEAM_WEB_API_KEY="your_steam_key"       # Steam Web API
HTTPS_PROXY="http://127.0.0.1:7897"      # TMDB 国内必需
```

完整配置项见下方 [配置项](#配置项) 章节。

## 💡 Usage

### 搜索并添加记录

在搜索页面输入关键词，支持中英文混合搜索。点击搜索结果展开详情（评分、导演、演员、类型等），确认后一键加入记录库。

### 从已有平台导入

```bash
# 豆瓣全量导入（需要 Playwright）
curl -X POST http://localhost:18889/api/import/douban-harvest?mode=full

# Trakt 电影导入
curl -X POST http://localhost:18889/api/trakt/import/movies

# Steam 已购游戏导入
curl -X POST http://localhost:18889/api/import/steam/owned
```

### 雷达发现新片

访问 `/radar` 页面，浏览 TMDB 热映、即将上映、正在播出的影视，以及优酷和腾讯的热门片单。流媒体平台（Netflix/Disney+/Apple TV+/Max）支持独立筛选。发现感兴趣的直接一键加入想看。

---

## 🔄 Comparison

| 功能 | PixelReel | Letterboxd | Trakt | 豆瓣 |
|------|:---------:|:----------:|:-----:|:----:|
| 电影记录 | ✅ | ✅ | ✅ | ✅ |
| 电视剧记录 | ✅ | ❌ | ✅ | ✅ |
| 游戏记录 | ✅ | ❌ | ❌ | ❌ |
| 自托管 | ✅ | ❌ | ❌ | ❌ |
| 多平台数据聚合 | ✅ | ❌ | ⚠️ | ❌ |
| 豆瓣数据导入 | ✅ | ❌ | ❌ | -- |
| Steam/Xbox/PSN 导入 | ✅ | ❌ | ❌ | ❌ |
| 数据分析报告 | ✅ | ⚠️ | ✅ | ❌ |
| 雷达发现 | ✅ | ❌ | ✅ | ✅ |
| 操作撤销 | ✅ | ❌ | ❌ | ❌ |

## 📚 Documentation

| 主题 | 说明 |
|------|------|
| [数据模型](#数据模型) | Movie / TvShow / Game / RadarItem 表结构 |
| [前端路由](#前端路由) | 所有页面路由一览 |
| [API 接口](#关键接口) | 搜索、记录库、导入、雷达等全部 API |
| [配置项](#配置项) | .env 环境变量完整列表 |
| [db/setup.md](db/setup.md) | 从零搭建开发环境手顺 |

### 前端路由

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
| `/radar` | 雷达发现（TMDB + 优酷 + 腾讯聚合） |
| `/login` | 登录页 |

### 关键接口

#### 搜索

```text
GET /api/search/movies?query=&providers=omdb,tmdb,douban,imdb,trakt
GET /api/search/tv-shows?query=&providers=tmdb,douban
GET /api/search/games?query=&providers=rawg,steam
```

#### 详情接口

```text
GET /api/search/imdb/:imdbId        IMDb/OMDb 影视详情
GET /api/search/tmdb/:tmdbId        TMDB 影视详情 + credits
GET /api/search/douban/:doubanId    豆瓣影视详情
GET /api/search/rawg/:rawgId        RAWG 游戏详情
GET /api/search/steam/:steamAppId   Steam 游戏详情
GET /api/search/proxy/image?url=    图片代理（防盗链）
```

#### 记录库与时间线

```text
GET   /api/library?cursor=&limit=50&category=&year=&status=&query=&source=&review=
GET   /api/library/:category/:id
PATCH /api/library/:category/:id
GET   /api/library/random?limit=N

GET   /api/timeline?cursor=&limit=96&category=&year=
GET   /api/timeline/years?category=
```

#### 导入

```text
POST   /api/import/douban-harvest?mode=json|full|incremental
GET    /api/import/douban-harvest/status?taskId=xxx
POST   /api/trakt/import/movies
POST   /api/trakt/import/shows
POST   /api/import/steam/owned
POST   /api/import/xbox/owned
POST   /api/import/psn/owned
POST   /api/import/tmdb-enrich/backfill?limit=50
POST   /api/import/tmdb-detail/backfill?limit=50
POST   /api/import/steam/backfill
```

#### 雷达

```text
GET    /api/radar?category=&type=&platform=&source=&page=&limit=
GET    /api/radar/status
POST   /api/radar/sync
POST   /api/radar/sync/:source
POST   /api/radar/add-to-library
```

#### 其他

```text
GET    /api/profile/summary
GET    /api/analytics?year=
GET    /api/activity
POST   /api/activity/:id/undo
GET    /api/auth/status
POST   /api/auth/login
GET    /api/settings
PUT    /api/settings
```

### 数据模型

三张核心表，字段按来源分组（豆瓣为主、TMDB 为辅）：

| Model | 外部 ID | 显示字段 |
|-------|---------|---------|
| Movie | doubanId, tmdbId, imdbId, traktId | title, posterUrl, releaseDate, overview, rating(1-5星), shortReview |
| TvShow | doubanId, tmdbId, imdbId, traktId | title, posterUrl, firstAirDate, overview, rating(1-5星), shortReview |
| Game | rawgId, steamAppId, xboxId, psnId | title, posterUrl, rating(1-5星), shortReview, platform, playtimeMinutes |
| ActivityLog | -- | action, entityType, entityId, entityTitle, oldValues, newValues |
| RadarItem | sourceKey(唯一), source, sourceId, tmdbId | title, titleZh, overview, posterPath, type, category, platform |

### 配置项

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DATABASE_URL` | MySQL 连接字符串 | -- |
| `PORT` | 后端端口 | `18889` |
| `HOST` | 后端监听地址 | `127.0.0.1` |
| `CORS_ALLOWED_ORIGINS` | 允许的前端 Origin，逗号分隔 | 本机前端地址 |
| `JWT_SECRET` | JWT 签名密钥（启用认证时至少 32 个字符） | -- |
| `JWT_PASSWORD` | 登录密码（启用认证时至少 8 个字符） | -- |
| `AUTH_ENABLED` | 启用登录鉴权 | `false` |
| `TMDB_API_KEY` | TMDB API v4 Bearer Token | -- |
| `OMDB_API_KEY` | OMDb API Key | -- |
| `TRAKT_CLIENT_ID` | Trakt Client ID | -- |
| `RAWG_API_KEY` | RAWG API Key | -- |
| `STEAM_WEB_API_KEY` | Steam Web API Key | -- |
| `HTTPS_PROXY` | HTTPS 代理（TMDB 国内必需） | -- |
| `DOUBAN_USER_ID` | 豆瓣用户 ID | -- |
| `DOUBAN_HARVEST_ENABLED` | 启用浏览器收割 | `true` |
| `RADAR_ENABLED` | 雷达模块总开关 | `false` |
| `RADAR_SYNC_CORE_CRON` | 核心源同步 cron | `0 * * * *` |
| `RADAR_SYNC_SCRAPER_CRON` | 附加源同步 cron | `0 */6 * * *` |
| `RADAR_WATCH_REGION` | TMDB 流媒体平台地区 | `TW` |

## ❓ FAQ

<details>
<summary>TMDB API 请求超时怎么办？</summary>

TMDB API 在国内需要代理访问。在 `.env` 中配置 `HTTPS_PROXY=http://127.0.0.1:7897`（替换为你的代理地址）。

</details>

<details>
<summary>豆瓣全量导入和增量导入有什么区别？</summary>

- `mode=full`：每次从零开始爬取，使用 Playwright 浏览器自动化
- `mode=incremental`：只抓取上次同步之后的新数据，需要先全量同步过一次
- `mode=json`：直接读取本地 `collect.json` 文件，不需要浏览器

</details>

<details>
<summary>如何为已有记录补充 TMDB 海报和详情？</summary>

运行回填接口：
- `POST /api/import/tmdb-enrich/backfill?limit=50` — 按标题搜 TMDB 补充 tmdbId 和海报
- `POST /api/import/tmdb-detail/backfill?limit=50` — 按 tmdbId 回填完整详情

两个接口都是异步任务，可在 `/activity` 页面查看进度。

</details>

<details>
<summary>雷达模块的数据来源有哪些？</summary>

- **核心源（TMDB）**：热映、即将上映、趋势、正在播出，每小时同步
- **附加源**：优酷、腾讯热门片单，每 6 小时同步（可失败，不影响核心源）
- **流媒体平台**：Netflix、Disney+、Apple TV+、Max 通过 TMDB Discover API 筛选

所有源均可通过 `RADAR_ENABLED` 和 `RADAR_SCRAPERS_ENABLED` 开关控制。

</details>

<details>
<summary>如何关闭登录鉴权？</summary>

默认 `AUTH_ENABLED=false`，无需登录即可使用。启用前须配置至少 32 个字符的 `JWT_SECRET` 和至少 8 个字符的非默认 `JWT_PASSWORD`；启用后除认证状态、登录、健康检查和带一次性 `state` 校验的 Trakt OAuth 回调外，API 都需要有效 JWT Token。服务默认只监听 `127.0.0.1`；局域网部署时请同时配置 `HOST` 和 `CORS_ALLOWED_ORIGINS`。

</details>

<details>
<summary>设置页面会显示已保存的 API Key 吗？</summary>

不会。敏感配置只返回是否已配置，后端不会把现有明文回传给浏览器。密码框留空会保留原值，输入新值才会覆盖。

</details>

---

## 🤝 Contributing

欢迎贡献！请遵循以下步骤：

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 开启 Pull Request

### 开发环境

```bash
git clone https://github.com/zaynzhu/pixelreel.git
cd pixelreel

# 后端
cd express-backend && npm install && npm run dev

# 前端（新终端）
cd frontend && npm install && npm run dev
```

---

## ⭐ Star History

<a href="https://star-history.com/#zaynzhu/pixelreel&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=zaynzhu/pixelreel&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=zaynzhu/pixelreel&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=zaynzhu/pixelreel&type=Date" />
 </picture>
</a>

---

## 🙏 Contributors

<a href="https://github.com/zaynzhu/pixelreel/graphs/contributors">
 <img src="https://contrib.rocks/image?repo=zaynzhu/pixelreel" />
</a>

---

## 📄 License

本项目基于 [MIT License](LICENSE) 开源 -- 详见 [LICENSE](LICENSE) 文件。
