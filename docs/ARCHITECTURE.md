# PixelReel 架构

PixelReel 是单用户、自托管的影剧游资料库。后端负责外部来源接入、数据融合、
安全写入和统计；前端负责搜索、审核、浏览与数据维护。代码和 Prisma schema 是最终依据。

## 系统边界

```text
React / Vite :18888
        │ /api
        ▼
Express / TypeScript :18889
        │
        ├── Prisma ── MySQL
        ├── 影视来源：豆瓣、TMDB、OMDb、IMDb、Trakt
        ├── 游戏来源：RAWG、Steam、Xbox、PSNProfiles
        └── 发现来源：TMDB、优酷、腾讯
```

- 后端默认监听 `127.0.0.1`，前端由 Vite 代理 `/api`。
- Java Spring Boot 版本位于 `legacy/java-backend/`，只作归档。
- 所有业务查询通过 `getDb()` 使用带活动日志与豆瓣保护扩展的 Prisma 客户端。
- 外部 API 统一经过 `RateLimiter`；同一服务的请求起始时间至少间隔 2 秒。

## 领域模型

| 模型 | 职责 |
|------|------|
| `Movie` | 电影个人记录、来源身份及豆瓣/TMDB 原始字段 |
| `TvShow` | 剧集个人记录、来源身份及豆瓣/TMDB 原始字段 |
| `Game` | 游戏作品及唯一的个人状态、评分和短评 |
| `GamePlatformEntry` | 单个平台的公开身份、游玩时间、成就或奖杯摘要 |
| `ActivityLog` | CRUD、任务、合并和撤销事件 |
| `DuplicateReview` | 重复候选裁决及随候选变化失效的指纹 |
| `RadarItem` | 新片雷达和热门发现条目 |

`Game` 上的旧平台字段仅用于兼容。存在 `GamePlatformEntry` 时，平台档案是遥测权威来源：

- `playtimeMinutes=0` 表示已知为零，`null` 才是未知。
- PSN 使用“奖杯”，其他平台使用“成就”。
- 成就总数只有在大于零且不小于已解锁数时才可信；否则保留已解锁数但不计算比例。
- 不跨平台合计游玩时间、成就或奖杯。

## 核心数据流

### 搜索与手动入库

搜索 Provider 返回外部候选，前端展开详情后写入对应记录。手动新增和历史记录默认
`ACCEPTED`；外部批量导入的新记录显式写入 `PENDING`。

### 同步与导入审核

```text
来源配置 → 只读连接验证 → 后台同步任务
  → 新记录 PENDING / 已有平台档案刷新
  → /sync/review 人工接受或忽略
  → 重复候选人工预览、裁决或确认合并
```

- 同步任务、终态摘要和同步历史分别保存在后端本地数据文件中。
- 任务可取消；外部请求返回后、数据库写入前必须再次检查取消信号。
- 忽略导入只修改审核状态，不删除记录。
- 标题只能产生候选，不能触发自动合并或删除。

### 数据健康与合并

`/api/data-health` 提供缺失字段审计、重复候选、只读合并预览和定向修复。
游戏合并只有用户确认后才在单一事务中迁移平台档案、保存恢复快照并写入 `MERGE`
活动；撤销前会检查保留记录和平台档案是否已变化。

带 `doubanId` 的电影和剧集禁止删除，豆瓣原始字段禁止改写。分类转换只能在同一事务中
完整复制后删除源记录。

### 读取与前端一致性

- `/api/library` 提供混合资料库、服务端筛选、全局排序和游标分页。
- `/api/timeline` 返回轻量记录；完整详情按需读取 `/api/library/:category/:id`。
- 首页、年度分析、记录库和平台摘要共享后端口径，不在前端重复推导来源。
- 前端列表、详情、筛选、分页与轮询均采用“最新请求获胜”；旧响应不能污染新视图。
- 首次读取失败显示错误和重试；已有数据刷新失败保留旧数据并明确提示。

## 安全边界

- `AUTH_ENABLED=false` 时用于本机单用户访问。启用后，除认证、健康检查和经过
  一次性 `state` 校验的 OAuth 回调外，API 都要求 Bearer Token。
- 启用认证必须提供至少 32 字符的非示例 `JWT_SECRET` 和至少 8 字符的非默认密码。
- Settings 对敏感值只返回 `configured`，保存采用同目录临时文件原子替换。
- Xbox refresh token 只写入权限为 `0600` 的本机文件，不通过 API 或 Settings 回传。
- 图片代理有域名允许列表、大小限制和重定向复核。
- 4xx 保留可操作提示；5xx 对客户端固定返回“内部服务器错误”，堆栈只写服务端日志。

## API 分区

| 分区 | 主要路径 |
|------|----------|
| 认证与健康 | `/api/auth/*`, `/api/health` |
| 搜索与详情 | `/api/search/*` |
| 资料库与时间线 | `/api/library/*`, `/api/timeline/*`, `/api/profile/summary` |
| 同步与授权 | `/api/import/*`, `/api/trakt/*`, `/api/xbox/*` |
| 审计与维护 | `/api/activity/*`, `/api/data-health/*`, `/api/tools/*` |
| 分析与发现 | `/api/analytics`, `/api/radar/*` |
| 配置 | `/api/settings` |

完整调用示例见 [INTEGRATIONS.md](INTEGRATIONS.md)，运行与故障处理见
[RUNBOOK.md](RUNBOOK.md)。
