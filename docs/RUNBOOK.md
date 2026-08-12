# 运行与维护手册

## 启动

前置要求：Node.js 18 以上、MySQL 8、npm。Node 版本由 fnm 管理。

```bash
mysql -u root -p < db/init.sql

cd express-backend
npm install
cp .env.example .env
npx prisma generate
npx prisma db push
npm run dev

cd ../frontend
npm install
npm run dev
```

默认地址：

- 前端：`http://localhost:18888`
- 后端：`http://127.0.0.1:18889`

数据库位置以 `express-backend/.env` 的 `DATABASE_URL` 为准，不在文档中固化主机地址。

## 健康与交付检查

```bash
curl -fsS http://127.0.0.1:18889/api/health

cd express-backend && npm run check
cd ../frontend && npm run check
```

健康响应只有在服务和数据库均正常时才返回 200。开发服务可运行不代表 TypeScript 或
生产构建通过，两个 `check` 必须分别执行。

## 配置管理

优先在 `/settings` 修改配置。敏感值读取时只显示“已配置”，输入框留空表示保留旧值。

- OpenXBL、Microsoft Xbox 和 PSNProfiles 设置保存后即时更新运行时配置。
- 其他配置保存后按界面提示重启后端。
- `.env` 通过同目录临时文件原子替换，备份为 `.env.backup.local`。
- 不提交 `.env`、授权缓存、Cookie、API Key 或本地数据文件。

启用 `AUTH_ENABLED` 前必须设置：

- 至少 32 个字符且非示例值的 `JWT_SECRET`
- 非空 `JWT_USERNAME`
- 至少 8 个字符且非默认值的 `JWT_PASSWORD`

局域网访问必须同时配置 `HOST` 和 `CORS_ALLOWED_ORIGINS`，不能只把监听地址改成
`0.0.0.0`。

## 任务运维

```text
GET    /api/import/tasks
DELETE /api/import/tasks/:taskId
GET    /api/import/sources/history
```

任务状态保存在 `express-backend/data/tasks.json`。服务启动时，遗留的 `running` 任务会
标记为因重启中断，不会自动续跑。长任务运行时避免无意触发 `tsx watch` 重启。

取消任务后，执行器必须在下一次外部请求和数据库写入前检查取消信号。若任务页面显示旧
状态，先重新读取任务接口，不要重复启动同类型任务。

## 数据保护与备份

### 不可破坏的边界

- 禁止删除带 `doubanId` 的电影或剧集。
- 禁止改写豆瓣原始字段。
- 忽略导入只改变 `importReviewState`，不删除记录。
- 重复候选不能按标题自动合并；合并前必须重新生成只读预览并人工确认。
- 不使用强制参数绕过保护，也不直接执行批量清库 SQL。

### 导出安全快照

访问 `/tools` 或调用：

```bash
curl -OJ http://127.0.0.1:18889/api/tools/export-library
```

快照格式为 `pixelreel-library-export` v2，包含全部主记录、稳定排序的平台档案、计数清单
和记录区 SHA-256，不包含 Settings、环境变量或凭据。前端只有在正文、响应头和重新计算的
校验值一致时才保存文件。

### 恢复预览与增量恢复

在 `/tools` 选择一个 v2 快照，或调用：

```bash
curl -X POST \
  -F 'file=@pixelreel-library-2026-08-12T08-00-00Z.json;type=application/json' \
  http://127.0.0.1:18889/api/tools/restore-preview
```

接口接受最大 50 MiB 的 JSON，校验格式、版本、导出时间、计数、记录 ID、平台身份和
SHA-256，再与现库做只读比较。结果中的“现库独有”只表示差异，不会删除记录。

预览无冲突且存在快照独有数据时，工具页会展示增量恢复方案。确认前核对逐类创建数量、
内容不同跳过数量、现库独有保留数量和带豆瓣 ID 的新建数量；二次确认后才会调用
`POST /api/tools/restore`。确认令牌只能使用一次、十分钟过期，并绑定快照与当时的现库指纹。

增量恢复的固定边界：

- 先将当前资料库备份到 `express-backend/data/restore-backups/`，目录权限 `0700`、文件权限
  `0600`。
- 在可串行化事务中重新校验现库指纹，只创建快照独有主记录和平台档案。
- 不覆盖内容不同的记录，不合并身份，不删除现库独有数据；任何身份冲突会阻断整次操作。
- 成功后记录 `RESTORE / LIBRARY` 活动和恢复后 SHA-256，但不提供撤销，以免绕过豆瓣删除
  保护。安全备份用于审计和人工核对，不是自动回滚入口。

若恢复失败或数量异常，停止继续操作，保留错误、活动日志和安全备份进行核对；不要手工
删除带豆瓣 ID 的记录。任何数据库迁移、分类转换或合并前仍应先导出快照。

## 常见故障

### 前端地址无法访问

Vite 可能只监听 `localhost` 对应的 IPv6 地址。先访问
`http://localhost:18888`，再检查进程实际监听地址；单独访问
`127.0.0.1:18888` 失败不能证明前端已停止。

### 后端运行但 API 仍是旧响应

确认 `tsx watch` 已重新加载；API shape 改动后必要时重启后端，并重新请求真实接口。

### TMDB 超时

确认 `HTTPS_PROXY` 可用。`TMDB_API_KEY` 是 v4 Bearer Token，必须走
`Authorization: Bearer`，不能当成 `api_key` 查询参数。

### Xbox Microsoft 登录没有反应

- 确认后端可访问且本机 `8080` 端口未被占用。
- 使用同步中心重新生成登录地址，不复用过期 `state`。
- 默认社区登录不要求 Azure 配置；只有明确使用自有应用时才启用备用设置。

### PSN 返回零条或验证页

- 确认 Online ID 与公开 PSNProfiles 地址一致。
- 先执行只读验证，检查是否为档案不存在、限流或 Cloudflare 验证。
- 仅在明确提示时更新 `PSN_PROFILES_COOKIE`。

### Prisma BigInt

外部 ID 只有在 JavaScript 安全整数范围内才可转成 `Number()`；JSON 序列化时，超出
`Number.MAX_SAFE_INTEGER` 的值必须返回十进制字符串。

## 发布前清单

1. `git diff --check`
2. 后端 `npm run check`
3. 前端 `npm run check`
4. `/api/health` 验证数据库
5. 对改动涉及的页面或 API 做真实路径验证
6. 确认未写入、删除或合并用户数据，除非任务明确授权
7. 以 `type: 中文描述` 创建原子提交
