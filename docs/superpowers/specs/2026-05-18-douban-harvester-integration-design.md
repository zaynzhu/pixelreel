# Douban Harvester 集成设计

## 概述

将 `douban-harvester`（TypeScript + Playwright 豆瓣爬虫）作为子模块集成到 PixelReel Express 后端，实现：

1. 已有 `collect.json` 数据直接导入数据库
2. 增量/全量爬取后自动写库（不再只输出 JSON）
3. 调 TMDB API 丰富数据（判断 movie/tv 类型、拿海报、拿详情）
4. 综艺数据归入 TvShow 表，后续用 subType 字段区分

## 代码迁移

### 目标结构

```
express-backend/src/services/douban-harvester/
├── types.ts          ← 从 harvester 搬入，保持不变
├── parser.ts         ← 从 harvester 搬入，保持不变
├── scraper.ts        ← 从 harvester 搬入，保持不变
├── storage.ts        ← 从 harvester 搬入，适配 dataDir 配置
├── config.ts         ← 合并进 express-backend/src/config/index.ts
├── import-service.ts ← 新文件：核心导入服务
└── verify.ts         ← 从 harvester 搬入，保持不变
```

原 `pixelreel.ts`（桩代码）删除，逻辑由 `import-service.ts` 替代。

原 `main.ts`（CLI 交互入口）不再需要——由 API 路由触发。

### storage.ts 适配

原 harvester 的 `storage.ts` 使用硬编码相对路径 `data/collect.json`。集成后改为从 config 读取 `dataDir`：

```typescript
// 改前
const PROGRESS_FILE = "data/progress.json";

// 改后
import { config } from '../../config';
const PROGRESS_FILE = path.join(config.douban.dataDir, "progress.json");
```

### config 扩展

在 `express-backend/src/config/index.ts` 的 `douban` 字段扩展：

```typescript
douban: {
  baseUrl: process.env.DOUBAN_BASE_URL || 'https://movie.douban.com',
  cookie: process.env.DOUBAN_COOKIE || '',
  userId: process.env.DOUBAN_USER_ID || '',
  dataDir: process.env.DOUBAN_DATA_DIR || path.resolve(__dirname, '../../data/douban-harvester'),
},
```

### 依赖

在 `express-backend/package.json` 新增：

- `playwright`（爬取核心依赖）
- `exceljs`（Excel 导出，可选，后续再加）

## 数据映射

### CollectItem → Movie / TvShow

douban-harvester 爬到的 `CollectItem` 需要通过 TMDB 判断类型后，映射到不同表：

| CollectItem 字段 | Movie 字段 | TvShow 字段 | 说明 |
|---|---|---|---|
| `link` → 提取 ID | `doubanId` | `doubanId` | 从 `/subject/XXXXX/` 提取 |
| TMDB 搜索结果 | `tmdbId` | `tmdbId` | 用 title 搜 TMDB |
| `title` | `title` | `title` | 中文片名 |
| TMDB 海报 | `posterUrl` | `posterUrl` | 从 TMDB 搜索结果取 |
| `rating` (1-5) | `rating` | `rating` | ×2 变 2-10，与 DoubanCsvImportService 一致 |
| `comment` | `shortReview` | `shortReview` | 短评 |
| `date` | `createdAt` | `createdAt` | 标记日期 |
| — | `status` | `status` | 默认 `DONE`（已看过的才在豆瓣） |

### TMDB 丰富流程

对每条 CollectItem：

1. 用 `title` 调 TMDB `/search/movie` 和 `/search/tv`
2. 取最佳匹配（标题相似度 + 评分人数/受欢迎度）
3. 如果 movie 搜索结果更好 → 写入 Movie 表
4. 如果 tv 搜索结果更好 → 写入 TvShow 表
5. 如果都没搜到 → 仅用豆瓣数据创建记录（tmdbId=null, posterUrl=null）
6. 搜索间隔 250ms，429 时退避重试（复用 TmdbCoverFillService 的逻辑）

### 去重逻辑

1. 先按 `doubanId` 查重 → 已存在则跳过
2. 再按 `tmdbId` 查重 → 已存在则补充 doubanId
3. 两者都不存在 → 新建记录

### 综艺处理

综艺暂归 TvShow 表。TMDB 的 `/search/tv` 返回结果中有 `genre_ids`，可以通过 TMDB 的综艺类型 ID（10764 综艺、10763 脱口秀）识别。后续可在 TvShow 表加 `subType` 字段区分。

## API 路由

在 `routes/import.ts` 新增：

```
POST /api/import/douban-harvest
  ?mode=json          ← 读现有 collect.json/reviews.json 导入（默认）
  ?mode=full          ← 全量爬取 + TMDB 丰富 + 写库
  ?mode=incremental   ← 增量爬取 + TMDB 丰富 + 写库
```

爬取是长时间异步任务。返回结构：

```json
{
  "taskId": "douban-harvest-20260518-123456",
  "status": "running",
  "mode": "json"
}
```

增加状态查询端点：

```
GET /api/import/douban-harvest/status?taskId=xxx
```

返回：

```json
{
  "taskId": "...",
  "status": "running | completed | failed",
  "mode": "json",
  "progress": { "processed": 120, "total": 428, "currentTitle": "低智商犯罪" },
  "result": { "total": 428, "imported": 350, "skipped": 70, "errors": [] }
}
```

## 前端

Library 页面或 Dashboard 加"豆瓣同步"按钮：

- 默认 mode=json（导入现有数据）
- 可切换 mode=incremental（增量爬取）
- 显示进度条和结果摘要
- 失败时展示错误列表

## 已有数据导入

用户已有 `douban-harvester/data/collect.json` 中的数据。`mode=json` 模式下：

1. 从配置的 `dataDir` 读取 `collect.json`
2. 逐条处理：提取 doubanId → 查重 → TMDB 丰富 → 写库
3. 返回导入摘要

`dataDir` 默认指向 `express-backend/data/douban-harvester/`，但用户可以将现有 JSON 文件复制过去，或配置环境变量指向 harvester 原目录。

## 防风控

保持 harvester 原有的防风控策略不变：

- 不减小延迟参数（SLEEP_MIN/MAX）
- 不设置 headless: true
- 不移除反检测脚本
- 被封后等 2 小时再跑

API 触发的爬取任务在单独的异步进程中运行，不阻塞主 Express 服务。