# API Key 获取指南

PixelReel 依赖多个外部平台 API 实现影视/游戏搜索和平台导入功能。以下是各平台 API Key 的获取方式。

## 必须

| 变量 | 平台 | 获取方式 |
|------|------|---------|
| `DATABASE_URL` | MySQL | 本地 Docker 已配置，无需修改 |

## 影视搜索

### TMDB（推荐优先配置）

- **变量**: `TMDB_API_KEY`
- **用途**: 搜电影，数据丰富有海报
- **获取步骤**:
  1. 访问 https://www.themoviedb.org/ 注册账号
  2. 进入 https://www.themoviedb.org/settings/api 点击「Create」创建 API Key
  3. 选择「Developer」→ 填写基本信息（个人用途随意填）
  4. 创建后复制 **API Key (v3 auth)** 填入 `.env`
- **免费额度**: 每天 50 次请求（个人用足够）
- **备注**: 还需配置 `TMDB_IMAGE_BASE_URL`，默认已填 `https://image.tmdb.org/t/p/w500`

### OMDb

- **变量**: `OMDB_API_KEY`
- **用途**: 备用电影搜索，IMDb 数据为主
- **获取步骤**:
  1. 访问 https://www.omdbapi.com/apikey.aspx
  2. 填写邮箱，选择 Free 类型
  3. 邮件收到 Key 填入 `.env`
- **免费额度**: 每天 1000 次

### Trakt

- **变量**: `TRAKT_CLIENT_ID`
- **用途**: 搜电影，有 IMDb ID 关联
- **获取步骤**:
  1. 访问 https://trakt.tv/ 注册账号
  2. 进入 https://trakt.tv/oauth/applications → 「Create New App」
  3. Redirect URI 填 `http://localhost` 即可
  4. 创建后复制 **Client ID** 填入 `.env`

### 豆瓣

- **变量**: `DOUBAN_COOKIE`
- **用途**: 搜中文电影
- **获取步骤**:
  1. 用浏览器登录 https://movie.douban.com/
  2. 按 F12 打开开发者工具 → Network 标签
  3. 随便搜索一个电影，找到请求头中的 `Cookie` 字段
  4. 完整复制 Cookie 值填入 `.env`
- **备注**: Cookie 有时效性，过期后需重新获取

## 游戏搜索

### RAWG（推荐优先配置）

- **变量**: `RAWG_API_KEY`
- **用途**: 搜游戏，数据最全有封面
- **获取步骤**:
  1. 访问 https://rawg.io/apidocs 点击「Get API Key」
  2. 注册账号并填写申请表（个人用途）
  3. 获取 Key 后填入 `.env`
- **免费额度**: 每月约 20000 次请求

## Steam 已购游戏导入

### Steam Web API

- **变量**: `STEAM_WEB_API_KEY` + `STEAM_DEFAULT_STEAM_ID`
- **用途**: 导入你的 Steam 已购游戏列表
- **获取步骤**:
  1. 登录 Steam 网页版 https://steamcommunity.com/
  2. 访问 https://steamcommunity.com/dev/apikey → 填域名（随便填如 `localhost`）→ 获取 API Key
  3. 获取你的 SteamID64（17 位数字）:
     - 打开你的 Steam 个人主页
     - 右键 → 「复制网页地址」
     - URL 中 `profiles/` 后面那串数字就是 SteamID64
     - 如果 URL 是 `/id/xxx` 而非 `/profiles/数字`，访问 https://steamid.io/ 输入你的自定义 ID 转换
  4. `STEAM_WEB_API_KEY` 填 API Key，`STEAM_DEFAULT_STEAM_ID` 填你的 SteamID64
- **调用方式**: `POST /api/import/steam/owned?steamId=你的SteamID&status=WANT`

## Xbox / PSN

### Xbox（推荐 Microsoft 账号直连）

1. 在同步中心选择“Microsoft 账号登录”
2. 点击登录按钮，在 Microsoft 官方页面完成授权
3. 返回同步中心后先执行只读连接验证，再启动同步

默认登录复用 OpenXbox 公开桌面客户端，不需要注册 Azure，也不需要 OpenXBL API Key。
PixelReel 不接收 Microsoft 密码；refresh token 仅以 `0600` 权限保存在本机
`express-backend/data/xbox-microsoft-auth.json`，不会通过 API 或 Settings 回传。
自有 Microsoft Entra 应用仅作为高级备用配置。

### Xbox（OpenXBL 兼容来源）

1. 在 [OpenXBL](https://xbl.io) 创建 API Key
2. 在 Settings 的 OpenXBL 分类填写 `OPENXBL_API_KEY`，并将 `OPENXBL_ENABLED` 设为 `true`
3. 在同步中心输入 Xbox Gamertag，或调用 `POST /api/import/xbox/owned/task?provider=openxbl&gamertag=玩家代号&status=WANT`

服务先按完整 Gamertag 精确匹配 XUID，再读取游戏历史。现代 Gamertag 应包含
`#数字后缀`。新记录写入导入审核队列，不覆盖已有个人状态、评分或短评。

### PSN（PSNProfiles）

1. 将 `PSN_PROFILES_ENABLED` 设为 `true`
2. 在同步中心输入 PSN 在线 ID，或调用 `POST /api/import/psn/owned/task?psnId=在线ID&status=WANT`
3. 公开档案可能直接返回 Cloudflare 403；同步任务会明确提示更新 Cookie，此时在 Settings 的 PSN 分类填写新的 `PSN_PROFILES_COOKIE`，保存后即可重试

服务按 `ajax=1&completion=all&order=last-played&pf=all&page=N` 逐页读取公开档案，
最多 100 页，并以奖杯链接中的数字列表 ID 作为稳定 `psnId`。新记录写入导入审核队列，
不覆盖已有个人状态、评分或短评。

`GET /api/import/platforms/status` 只返回两项来源的配置可用性，不返回 API Key 或 Cookie。外部服务响应可能变化，首次使用应先用真实账号做小范围核对。

## RAWG 封面补全

### 无需额外 Key

- 使用上面配置的 `RAWG_API_KEY`
- **调用方式**: `POST /api/import/covers/fill?limit=50`
- 自动对没有封面图的游戏调用 RAWG 搜索补全
- Xbox/PSN 导入遇到原始平台缺图时也会自动使用同一 RAWG 查询回退

## 豆瓣 CSV 导入

### 无需 Key

- **调用方式**: `POST /api/import/douban` （multipart 文件上传）
- 支持 CSV 列表上传，自动识别列名（中英文均可）

## 配置示例

编辑 `express-backend/.env`，以下是一个常用配置示例：

```env
# 数据库
DATABASE_URL="mysql://root:pixelreel123@localhost:3306/pixelreel"

# 服务
PORT=18889

# JWT
JWT_SECRET=随便一串随机字符
JWT_USERNAME=zaynzhu
JWT_PASSWORD=123456

# TMDB（搜电影）
TMDB_API_KEY=eyJhbGciOiJIUzI1NiJ9.xxxxx
TMDB_BASE_URL=https://api.themoviedb.org/3
TMDB_IMAGE_BASE_URL=https://image.tmdb.org/t/p/w500

# RAWG（搜游戏 + 封面补全）
RAWG_API_KEY=你的RAWG_KEY
RAWG_BASE_URL=https://api.rawg.io/api

# Steam（导入已购游戏）
STEAM_WEB_API_KEY=你的STEAM_KEY
STEAM_DEFAULT_STEAM_ID=你的17位SteamID64
STEAM_WEB_API_BASE_URL=https://api.steampowered.com

# OMDb（备用搜电影）
OMDB_API_KEY=你的OMDB_KEY
OMDB_BASE_URL=https://www.omdbapi.com
```

OpenXBL 与 PSNProfiles 配置在 Settings 保存后即时生效；其他环境配置完成后重启 Express 后端即可生效：

```bash
cd express-backend
npm run dev
```
