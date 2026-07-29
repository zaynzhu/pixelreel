<div align="center">

# 🎬 PixelReel

**个人影剧游统一管理平台**

[中文](README.md) | [English](README_EN.md)

</div>

<div align="center">

![Stars](https://img.shields.io/github/stars/zaynzhu/pixelreel?style=for-the-badge)
![Forks](https://img.shields.io/github/forks/zaynzhu/pixelreel?style=for-the-badge)
![Issues](https://img.shields.io/github/issues/zaynzhu/pixelreel?style=for-the-badge)
![Last Commit](https://img.shields.io/github/last-commit/zaynzhu/pixelreel?style=for-the-badge)

</div>

---

> [!TIP]
> PixelReel 是一个自托管的个人影剧游记录平台，将电影、电视剧和游戏统一管理。
> 支持从豆瓣、Trakt、Steam、Xbox、PSN 导入数据，聚合 TMDB、OMDb、RAWG 等数据源，
> 提供时间线、数据分析、大屏展示等丰富的可视化功能。

## ✨ Features

- **多平台搜索聚合** -- 同时搜索 TMDB、OMDb、豆瓣、IMDb、Trakt、RAWG、Steam，一个入口搜遍全网
- **一键数据导入** -- 从豆瓣、Trakt、Steam、Xbox、PSN 批量导入；重复同步会刷新游戏平台指标并单独统计更新数量
- **导入审核队列** -- 新同步记录先进入待审核区，可按豆瓣、Steam、Xbox、PSN 等稳定来源身份筛选并查看游戏成就进度；未裁决的跨平台重复候选会在接受前提示并直达数据健康页，忽略不会删除数据
- **资料库安全快照** -- 一键下载电影、剧集、游戏和豆瓣原始字段的只读 JSON，不包含设置与密钥
- **统一记录库** -- 电影、电视剧、游戏混排展示，支持分类/年份/状态多维筛选和评分短评
- **时间线海报墙** -- 按月份分组的精美海报墙，支持年份切换和详情弹窗
- **雷达发现** -- 聚合 TMDB 热映/趋势 + 优酷/腾讯片单，一键加入想看列表
- **数据分析** -- 年度报告、月度趋势、评分分布、来源占比、跨平台评分对比
- **数据健康审计** -- 检查缺失字段，识别疑似重复记录，可纠正来源匹配、确认不同，或在冲突校验后合并游戏记录；游戏合并可从操作日志撤销
- **大屏展示** -- 网格模式 + 全屏轮播模式，适合投屏展示你的影剧游收藏
- **操作日志** -- 自动记录每次 CRUD 操作，支持撤销和筛选
- **后台任务恢复** -- 同步中心与命令抽屉共用持久化任务，服务重启后明确标记被中断任务，不再直接丢失状态
- **临时账号记忆** -- Xbox Gamertag 与 PSN Online ID 可由用户选择保存在当前浏览器，取消勾选立即清除；密码和授权令牌不会进入浏览器存储
- **游戏平台遥测** -- 首页按平台档案汇总总游玩时长、档案数量和 Xbox/PSN 成就进度，并展示各平台指标覆盖率与最近同步时间；合并后的跨平台记录不会丢失来源指标
- **安全合并预览** -- 跨平台重复游戏合并前展示保留结果、迁移档案和个人记录冲突；确认后仍保存完整快照并支持从操作日志撤销

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
OPENXBL_API_KEY="your_openxbl_key"       # OpenXBL API Key
OPENXBL_GAMERTAG="name#1234"             # 默认 Xbox Gamertag
OPENXBL_ENABLED="true"                   # 启用 Xbox 同步
# 以下 Microsoft Xbox 配置仅供自有 Azure 应用备用；默认社区登录无需填写
MICROSOFT_XBOX_CLIENT_ID=""
MICROSOFT_XBOX_CLIENT_SECRET=""
MICROSOFT_XBOX_REDIRECT_URI="http://localhost:18889/api/xbox/callback"
MICROSOFT_XBOX_ENABLED="false"
PSN_PROFILES_ACCOUNT_ID="online-id"       # 默认 PSN Online ID
PSN_PROFILES_ENABLED="true"               # 启用 PSN 同步
HTTPS_PROXY="http://127.0.0.1:7897"      # TMDB 国内必需
```

完整配置项见下方 [配置项](#配置项) 章节。

## 💡 Usage

### 搜索并添加记录

在搜索页面输入关键词，支持中英文混合搜索。点击搜索结果展开详情（评分、导演、演员、类型等），确认后一键加入记录库。

### 从已有平台导入

日常同步推荐直接访问 `/sync`；如需自动化，请使用同一套可持久化、可取消的任务接口：

```bash
# 豆瓣全量导入（需要 Playwright）
curl -X POST http://localhost:18889/api/import/douban-harvest?mode=full

# Trakt 电影导入任务
curl -X POST 'http://localhost:18889/api/trakt/import/movies/task?status=WANT'

# Steam 已购游戏导入任务
curl -X POST 'http://localhost:18889/api/import/steam/owned/task?status=WANT'

# Xbox 游戏历史导入任务（Microsoft 官方授权直连）
curl -X POST 'http://localhost:18889/api/import/xbox/owned/task?provider=microsoft&status=WANT'

# OpenXBL 兼容方式（默认 Gamertag 在 Settings 配置）
curl -X POST 'http://localhost:18889/api/import/xbox/owned/task?provider=openxbl&status=WANT'

# PSN 游戏导入任务（默认在线 ID 在 Settings 配置）
curl -X POST 'http://localhost:18889/api/import/psn/owned/task?status=WANT'

# 只读验证默认 Xbox / PSN 账号（不会启动任务或写入资料库）
curl -X POST 'http://localhost:18889/api/import/xbox/verify?provider=microsoft'
curl -X POST 'http://localhost:18889/api/import/psn/verify'
```

Xbox 支持两种来源：默认使用 OpenXbox 公开桌面客户端跳转 Microsoft 官方 OAuth 页面登录，无需注册 Azure；OpenXBL 继续作为兼容方式。PixelReel 不接收 Microsoft 密码，refresh token 仅以 `0600` 权限保存在本机 `express-backend/data/xbox-microsoft-auth.json`，API 与 Settings 均不回传令牌。社区 Client ID 由 OpenXbox 项目维护，将来若被撤销，可改用 Settings 中的自有 Azure 应用高级配置。PSN 逐页读取公开 PSNProfiles 档案。

首次接入建议：

1. 打开 `/sync`，Xbox 来源选择“Microsoft 账号登录”，点击“登录 Microsoft 账号（无需 Azure）”。
2. 浏览器只在 Microsoft 官方页面完成登录，成功后自动返回同步中心；本机 `8080` 端口仅在登录期间临时接收回调。
3. 如继续使用 OpenXBL，在 OpenXBL 区域填写 API Key、默认 Gamertag 并启用；现代 Gamertag 请填写完整的 `名称#数字后缀`。
4. 在 PSNProfiles 区域填写默认 Online ID 并启用 PSN。公开档案通常无需 Cookie；遇到 Cloudflare 验证页时再更新 Cookie。
5. 在 `/sync` 先验证连接，再启动正式同步；新记录进入 `/sync/review` 审核队列。

Xbox 会写入游戏与成就摘要；部分 Xbox title history 只提供已解锁数而把总数返回为 `0`，PixelReel 会把这种总数视为未知并显示“已解锁 N”，不会伪装成 `N / 0`。只有所选来源的游戏历史响应提供游玩时长时，才会写入 `playtimeMinutes`。首次真实同步会创建游戏记录，建议通过 `/sync` 页面发起并在审核队列确认结果。

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
| Steam 导入 | ✅ | ❌ | ❌ | ❌ |
| Xbox/PSN 导入 | ✅ | ❌ | ❌ | ❌ |
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
| `/library/:category/:id` | 统一记录详情、来源账本、个人记录和变更历史 |
| `/timeline` | 时间线页面（按月份分组的海报墙） |
| `/activity` | 操作日志（筛选、无限滚动、撤销） |
| `/showcase` | 大屏展示（网格 + 全屏轮播） |
| `/analytics` | 数据分析（年度报告 + 习惯洞察） |
| `/sync` | 多来源同步中心（配置状态、同步操作、任务进度与结果） |
| `/sync/review` | 新导入审核队列（按来源筛选、查看游戏进度、接受、忽略、修正） |
| `/tools` | 数据维护工具与资料库安全快照 |
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
GET   /api/library?cursor=&limit=50&category=&year=&status=&query=&source=&review=&importReview=&sort=
GET   /api/library/:category/:id
PATCH /api/library/:category/:id
POST  /api/library/import-review
GET   /api/library/random?limit=N&category=game&status=WANT

GET   /api/timeline?cursor=&limit=96&category=&year=
GET   /api/timeline/years?category=
```

#### 导入

```text
POST   /api/import/douban-harvest?mode=json|full|incremental
GET    /api/import/douban-harvest/status?taskId=xxx
GET    /api/import/sources/status
GET    /api/import/sources/history
GET    /api/import/tasks
DELETE /api/import/tasks/:taskId
POST   /api/trakt/import/movies/task?status=WANT
POST   /api/trakt/import/shows/task?status=WANT
POST   /api/import/steam/owned/task?status=WANT
POST   /api/import/xbox/owned/task?gamertag=&status=WANT
POST   /api/import/psn/owned/task?psnId=&status=WANT
POST   /api/import/xbox/verify?gamertag=
POST   /api/import/psn/verify?psnId=
GET    /api/import/platforms/status  # Xbox/PSN 配置可用性，不返回密钥或 Cookie
POST   /api/import/tmdb-enrich/backfill?limit=50
POST   /api/import/tmdb-detail/backfill?limit=50
POST   /api/import/steam/backfill
```

#### 工具

```text
GET    /api/tools/export-library    下载完整资料库 JSON 快照
GET    /api/tools/search?query=     搜索待转换的影视记录
POST   /api/tools/convert-category  在电影与剧集之间转换类型
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
GET    /api/data-health/summary
GET    /api/data-health/issues?category=&issue=&cursor=&limit=
GET    /api/data-health/duplicates?category=&cursor=&limit=
POST   /api/data-health/duplicates/review
DELETE /api/data-health/duplicates/review/:id
POST   /api/data-health/duplicates/merge-preview
POST   /api/data-health/duplicates/merge
POST   /api/data-health/repair
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
| `OPENXBL_API_KEY` | OpenXBL API Key | -- |
| `OPENXBL_BASE_URL` | OpenXBL API 根地址 | `https://api.xbl.io/v2` |
| `OPENXBL_GAMERTAG` | 默认 Xbox Gamertag | -- |
| `OPENXBL_ENABLED` | 启用 Xbox 同步 | `false` |
| `MICROSOFT_XBOX_CLIENT_ID` | 可选，自有 Microsoft Entra 应用 Client ID | -- |
| `MICROSOFT_XBOX_CLIENT_SECRET` | 可选，自有 Microsoft Entra 应用 Client Secret | -- |
| `MICROSOFT_XBOX_REDIRECT_URI` | 自有应用 OAuth 回调地址 | `http://localhost:18889/api/xbox/callback` |
| `MICROSOFT_XBOX_ENABLED` | 启用自有 Microsoft Xbox 应用备用登录 | `false` |
| `PSN_PROFILES_BASE_URL` | PSNProfiles 站点地址 | `https://psnprofiles.com` |
| `PSN_PROFILES_USER_AGENT` | 请求 PSNProfiles 时使用的 User-Agent | 内置浏览器 User-Agent |
| `PSN_PROFILES_COOKIE` | 可选 Cookie，遇到 Cloudflare 验证时更新 | -- |
| `PSN_PROFILES_ACCOUNT_ID` | 默认 PSN Online ID | -- |
| `PSN_PROFILES_ENABLED` | 启用 PSN 同步 | `false` |
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
