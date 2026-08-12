# 外部来源接入指南

日常同步统一从前端 `/sync` 发起。先保存所需配置，再执行只读连接验证，确认成功后启动
正式任务。新记录进入 `/sync/review`，不会直接覆盖个人状态、评分或短评。

## 来源速查

| 来源 | 必要配置 | 正式任务 |
|------|----------|----------|
| 豆瓣 | `DOUBAN_USER_ID`；浏览器收割按需启用 | `POST /api/import/douban-harvest?mode=` |
| Trakt | Client ID/Secret 或已有 Access Token | `POST /api/trakt/import/{movies|shows}/task` |
| Steam | API Key 和 SteamID64 | `POST /api/import/steam/owned/task` |
| Xbox Microsoft | 本机 Microsoft OAuth 授权 | `POST /api/import/xbox/owned/task?provider=microsoft` |
| Xbox OpenXBL | 启用开关、API Key、Gamertag | `POST /api/import/xbox/owned/task?provider=openxbl` |
| PSN | 启用开关和 PSN Online ID | `POST /api/import/psn/owned/task` |

账号参数可只用于本次同步。Xbox Gamertag 与 PSN Online ID 只有在用户明确勾选时才保存在
当前浏览器；密码、Cookie 和授权令牌不得进入浏览器存储。

## 状态、任务与历史

```text
GET    /api/import/sources/status
GET    /api/import/platforms/status
GET    /api/import/sources/history
GET    /api/import/tasks
DELETE /api/import/tasks/:taskId
```

- 状态接口只返回可用性与缺失原因，不返回密钥、Cookie 或令牌。
- 当前任务优先展示；历史接口返回每个正式来源最后一次终态摘要。
- 正常空列表记为完成；只有错误且没有有效条目记为失败；部分成功保留完整错误摘要。
- 同一任务类型只允许一个运行实例，冲突返回 409。

## Xbox Microsoft 账号直连

默认流程复用 OpenXbox 公开桌面客户端，不需要注册 Microsoft Entra 应用：

1. `POST /api/xbox/auth-url` 获取 Microsoft 官方登录地址。
2. 浏览器完成授权。本机 `127.0.0.1:8080` 只在社区登录期间接收已登记回调。
3. 回调完成后，先执行：

```bash
curl -X POST \
  'http://localhost:18889/api/import/xbox/verify?provider=microsoft'
```

4. 验证成功后启动同步：

```bash
curl -X POST \
  'http://localhost:18889/api/import/xbox/owned/task?provider=microsoft&status=WANT'
```

Microsoft 链路为 OAuth → Xbox User Token → XSTS → title history。refresh token 和
`community|custom` 来源标记只保存在
`express-backend/data/xbox-microsoft-auth.json`。自有 Entra 应用仅作为社区 Client ID
不可用时的高级备用。

## Xbox OpenXBL

在 Settings 中配置 `OPENXBL_API_KEY`、`OPENXBL_GAMERTAG` 并启用
`OPENXBL_ENABLED`。现代 Gamertag 应填写完整的 `名称#数字后缀`。

```bash
curl -X POST \
  'http://localhost:18889/api/import/xbox/verify?provider=openxbl&gamertag=名称%231234'

curl -X POST \
  'http://localhost:18889/api/import/xbox/owned/task?provider=openxbl&gamertag=名称%231234&status=WANT'
```

服务会精确匹配完整 Gamertag、解析合法 XUID，再读取 title history。同一批次按
`titleId` 去重。

## PSNProfiles

`PSN Online ID` 是公开个人主页使用的在线 ID，例如
`https://psnprofiles.com/example` 中的 `example`，不是邮箱或登录密码。

在 Settings 中配置 `PSN_PROFILES_ACCOUNT_ID` 并启用 `PSN_PROFILES_ENABLED`：

```bash
curl -X POST \
  'http://localhost:18889/api/import/psn/verify?psnId=example'

curl -X POST \
  'http://localhost:18889/api/import/psn/owned/task?psnId=example&status=WANT'
```

连接验证只读取档案第一页。正式任务使用
`ajax=1&completion=all&order=last-played&pf=all&page=N` 分页，最多读取 100 页，
并以 `/trophies/{数字ID}-{slug}` 中的数字 ID 作为稳定 `psnId`。

若 PSNProfiles 返回 Cloudflare 403 或 HTTP 200 验证页，界面会提示更新可选 Cookie。
Cookie 只保存在后端 Settings，不写入浏览器账号记忆。

## Steam、Trakt 与豆瓣

```bash
curl -X POST \
  'http://localhost:18889/api/import/steam/owned/task?status=WANT'

curl -X POST \
  'http://localhost:18889/api/trakt/import/movies/task?status=WANT'

curl -X POST \
  'http://localhost:18889/api/trakt/import/shows/task?status=WANT'

curl -X POST \
  'http://localhost:18889/api/import/douban-harvest?mode=json'
```

豆瓣 `mode=json` 只读取已有 `collect.json`；`full` 和 `incremental` 使用 Playwright，
并受 `DOUBAN_HARVEST_ENABLED` 控制。豆瓣导入只补空值，不能改写豆瓣原始字段。

## 结果语义

- `total`：来源返回的有效条目数。
- `imported`：创建的新记录数。
- `updated`：刷新既有记录或平台档案的数量。
- `skipped`：无需变更或被规则跳过的数量。
- `errors`：可展开的局部或整体错误列表。

Xbox、PSN 和 Steam 指标写入 `GamePlatformEntry`。零时长是有效值；成就或奖杯总数
未知时只展示可信的已解锁数量。

更多 API Key 获取方式见
[express-backend/docs/API_KEY_GUIDE.md](../express-backend/docs/API_KEY_GUIDE.md)。

## 资料库快照工具

工具页 `/tools` 可导出并只读校验资料库快照：

```bash
curl -OJ http://127.0.0.1:18889/api/tools/export-library

curl -X POST \
  -F 'file=@pixelreel-library-2026-08-12T08-00-00Z.json;type=application/json' \
  http://127.0.0.1:18889/api/tools/restore-preview
```

恢复预览只支持 `pixelreel-library-export` v2，最大 50 MiB。响应区分快照独有、内容不同、
完全相同、身份冲突和现库独有记录；接口不会创建、更新、合并或删除任何资料库数据。
