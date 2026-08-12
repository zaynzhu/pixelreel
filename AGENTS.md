# PixelReel 项目规则

个人影剧游统一管理平台。当前后端为 Express 5 + TypeScript + Prisma 6 + MySQL，
前端为 React 18 + Vite + Zustand + TailwindCSS。

## 开发速查

```bash
# 后端
cd express-backend && npm run dev

# 前端
cd frontend && npm run dev

# 交付检查
cd express-backend && npm run check
cd frontend && npm run check

# Prisma schema 变更后
cd express-backend && npx prisma generate && npx prisma db push
```

- 后端默认 `127.0.0.1:18889`，前端默认 `localhost:18888`。
- 数据库位置以 `express-backend/.env` 的 `DATABASE_URL` 为准。
- Java 后端位于 `legacy/java-backend/`，不再维护。
- JavaScript/TypeScript 不使用分号，2 空格缩进，注释使用中文。

## 权威来源

1. 当前代码与 `express-backend/prisma/schema.prisma`
2. 本文件、`README.md` 与 `docs/` 当前文档
3. `docs/plans/` 和 `docs/superpowers/` 历史记录

运行进程、记录数、覆盖率、待审核数和测试数量都是快照，使用前必须实时核对。

## 不可破坏的红线

### 豆瓣数据

- 禁止删除带 `doubanId` 的 `Movie` 或 `TvShow`，禁止改写豆瓣原始字段。
- 忽略导入只修改 `importReviewState`，不能删除记录。
- 分类转换只能在同一事务完整复制记录后删除源记录。
- 快照恢复预览必须保持只读；没有独立确认的实际恢复设计时不得据此写库。
- 不执行批量清库 SQL，不绕过 Prisma 写入保护。

### 重复候选与合并

- 标题只能产生候选，不能自动绑定外部 ID、合并或删除记录。
- 合并前必须重新生成只读预览，并展示主记录、移除记录、个人字段冲突和全部平台档案。
- 游戏合并必须在单一事务中迁移平台档案、保存恢复快照并写入 `MERGE` 活动。
- 撤销前若保留记录或平台档案已变化，必须拒绝撤销。

### 密钥与认证

- Settings 敏感字段只返回 `configured`，不得回传现有明文；空输入表示保留原值。
- `.env` 更新必须校验白名单和类型，并使用同目录临时文件原子替换。
- `AUTH_ENABLED=true` 前校验非示例的 32 字符以上 `JWT_SECRET` 和 8 字符以上密码。
- 默认只监听本机；局域网访问必须同时配置 `HOST` 与 `CORS_ALLOWED_ORIGINS`。
- Microsoft refresh token 仅以 `0600` 权限保存在后端本机，不经 API、Settings 或浏览器存储回传。

## 数据与业务语义

### 游戏平台档案

- `Game` 表示作品及唯一的个人状态、评分和短评；`GamePlatformEntry` 表示平台身份与遥测。
- 有平台档案时以其为权威来源，旧 `Game` 平台字段仅作兼容回退，不能同时累计两套数据。
- `playtimeMinutes=0` 是已知零，`null` 才是未知；只有大于零的时长可把 WANT 推导为有效进行中。
- 不跨平台合计时长、成就或奖杯。PSN 使用“奖杯”，其他平台使用“成就”。
- 总数只有在大于零且不小于已解锁数时才可信；未知总数保留已解锁数但不显示比例。

### 导入与同步

- 外部导入的新记录写入 `PENDING`；手动新增和历史记录默认 `ACCEPTED`。
- 同步只刷新来源指标和允许补充的空字段，不覆盖个人状态、评分或短评。
- Xbox 默认使用 Microsoft OAuth；OpenXBL 是兼容来源。PSN 读取公开 PSNProfiles 档案。
- 账号覆盖只在用户明确勾选时保存到当前浏览器；密码、Cookie 和令牌不得进入该存储。
- Xbox/PSN 连接验证必须只读，不创建任务、不查询或写入资料库。
- 同类型同步任务只允许一个运行实例；取消后在外部请求和写库前再次检查取消信号。
- 同步状态和历史不返回凭据；空结果、整体失败和部分成功必须明确区分。

### 外部 API

- 所有外部 API 使用全局 `RateLimiter`，同一服务请求起始时间至少间隔 2 秒。
- 外部请求设置有界超时并传播任务取消信号；429 按服务策略退避。
- 基础 URL 只接受无查询参数和片段的绝对 HTTP(S) 地址。
- 外部 ID、分页、状态、日期、数组和文本长度在进入 Prisma 前完成校验。

## 前端一致性规则

- 所有新 UI 必须支持中英文、同步页面 `lang`，无文字控件提供本地化可访问名称。
- 列表、详情、筛选、分页、轮询和搜索均采用“最新请求获胜”；页面切换或卸载使旧请求失效。
- 首次读取失败显示具体错误和原地重试，不能伪装成空状态。
- 已有数据刷新或分页失败时保留现有结果与原游标，只重试失败的原请求。
- 新筛选立即清空旧视图；旧成功或旧错误不能追加或覆盖当前视图。
- `apiFetch` 已解析 JSON，调用方不要再执行 `.json()`。
- 页面级模块使用 `React.lazy`；不要把 Recharts 等重依赖静态引入首屏。
- 390px 视口不得出现页面级横向滚动；抽屉和弹窗在自身内部滚动。

## 后端写入与错误边界

- 所有业务路由和服务通过 `getDb()` 使用 Prisma 扩展客户端。
- Library PATCH 只允许状态、1–5 评分和最多 1000 字符短评；路径 ID 必须是安全正整数。
- 数据健康修复每批最多 50 条，只填充用户选择的空字段；游戏外部 ID 不按标题自动绑定。
- 活动日志必须覆盖 CRUD、撤销、任务和合并；豆瓣 CREATE 不提供撤销入口。
- 4xx 返回可操作提示并记录单行警告；5xx 固定返回“内部服务器错误”，堆栈只写服务端。
- Express 框架指纹保持关闭；图片代理保持域名白名单、大小限制和重定向复核。

## 验证要求

- 修改前先只读检查 Git、相关代码、运行 API 和数据边界。
- 优先运行最小相关测试；交付前分别执行后端和前端 `npm run check`。
- API shape 修改后确认实际进程已重载，并请求真实接口；仅开发服务可运行不算完成。
- 页面改动应结合真实 API、可访问 DOM 和必要截图验证。
- 不在验证中接受、忽略、合并或删除真实记录，除非用户明确授权。
- 每个独立任务验证后创建 `type: 中文描述` 的原子提交。

## 深入文档

| 主题 | 文档 |
|------|------|
| 系统分层、数据模型、核心数据流和安全边界 | `docs/ARCHITECTURE.md` |
| 跨页面与跨接口的产品行为约束 | `docs/PRODUCT_BEHAVIOR.md` |
| 豆瓣、Trakt、Steam、Xbox、PSN 接入 | `docs/INTEGRATIONS.md` |
| 启动、配置、健康检查、备份和故障排查 | `docs/RUNBOOK.md` |
| 当前能力、接手顺序和后续方向 | `docs/HANDOFF.md` |
| 领域术语 | `CONTEXT.md` |
| 文档状态及历史归档边界 | `docs/README.md` |
