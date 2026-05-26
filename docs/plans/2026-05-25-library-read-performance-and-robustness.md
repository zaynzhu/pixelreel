# Library 读取性能与健壮性优化记录

> **日期：** 2026-05-25
>
> **目标：** 优化 PixelReel 记录库和时间线的数据读取体验，减少滚动加载断层、重复请求、重复记录和分页不稳定问题。

## 背景

时间线页面在向下滚动时经常出现加载断层感。排查后发现问题不只在前端渲染，也和后端分页实现有关。

原有 `/api/library` 读取逻辑：

- 对 `movie`、`game`、`tv_show` 三张表分别查询 cursor 之后的全部记录。
- 在 Node.js 内存中合并、排序、截取前 `limit` 条。
- 每次加载更多都会重新计算全库 totals。
- 前端加载更多失败时静默吞掉错误。
- 前端追加数据时没有去重和游标校验。
- 时间线 IntersectionObserver 触发距离较近，滚动到页尾附近才开始请求下一页。
- 时间线海报图片没有显式配置懒加载、异步解码和首屏优先级。

随着数据量增加，这会导致：

- 后端每页读取越来越重。
- 滚动到底部时下一页还没回来。
- 并发请求或刷新请求交错时可能出现重复、错页或状态覆盖。
- 图片加载和数据加载同时抢占，视觉上更容易出现断层。

## 本次改动

### 后端分页读取

修改文件：

- `express-backend/src/routes/library.ts`
- `express-backend/src/services/LibraryService.ts`
- `express-backend/src/dto/library.ts`

主要改动：

- `limit` 参数统一限制在 `1~200`，避免异常 query 导致无效或过大查询。
- 每张表只读取 `limit + 1` 条，而不是读取 cursor 后全部记录。
- 三张表结果仍在服务端合并排序，再截取当前页。
- 新增 `includeTotals=false` 参数。
- 首次加载默认返回 totals；加载更多时可跳过 totals 计算。
- `PaginatedLibraryResponse.totals` 改为可选，适配加载更多场景。

这个改动保持了原有 API 结构和前端数据模型，但显著减少了每次分页的数据库读取量。

### 数据库索引

修改文件：

- `express-backend/prisma/schema.prisma`

新增索引：

```prisma
@@index([createdAt, id], map: "idx_movie_created_id")
@@index([createdAt, id], map: "idx_tv_show_created_id")
@@index([createdAt, id], map: "idx_game_created_id")
```

原因：

- 当前分页按 `createdAt desc, id desc` 排序。
- cursor 条件也基于 `createdAt + id`。
- 复合索引能让 MySQL 更好地处理分页排序和范围查询。

### 前端 store 健壮性

修改文件：

- `frontend/src/stores/libraryStore.ts`

主要改动：

- `fetchRecords` 支持传入 `limit`。
- 记录当前 `pageSize`，加载更多沿用首屏分页大小。
- 增加请求序号 `latestFetchRequest`，避免旧请求覆盖新请求。
- `fetchMore` 捕获当前 cursor，请求返回后校验 cursor 是否仍然一致。
- 追加记录时按 `category:id` 去重。
- 加载更多失败时写入错误信息，不再静默失败。
- 避免首屏加载中同时触发加载更多。

这些改动主要解决并发、重复追加、错页和失败不可见的问题。

### 时间线加载体验

修改文件：

- `frontend/src/pages/TimelinePage.tsx`
- `frontend/src/components/ImgWithFallback.tsx`

主要改动：

- 时间线首屏改为 `fetchRecords({ limit: 96 })`。
- 时间线加载更多预取距离从 `200px` 提前到 `1200px`。
- 首屏前 10 张海报使用 `loading="eager"`。
- 非首屏海报使用 `loading="lazy"`。
- 图片统一加 `decoding="async"`，减少解码阻塞主线程。

这个改动的目标是让下一页数据和图片在用户真正滚到底部前开始准备。

### 记录库页面加载体验

修改文件：

- `frontend/src/pages/LibraryPage.tsx`

主要改动：

- 记录库加载更多预取距离从 `200px` 提前到 `800px`。

记录库页面不是本次主要痛点，但它复用同一个 `libraryStore`，因此顺手同步了更稳的加载策略。

## 数据库执行结果

已执行：

```bash
cd express-backend
npx prisma db push
```

执行结果：

- 成功连接 MySQL：`localhost:3306`
- 数据库：`pixelreel`
- Prisma schema 已同步到数据库
- Prisma Client 已重新生成

第一次在受限环境内执行失败，原因是 Prisma 尝试访问 `binaries.prisma.sh` 校验 schema engine 时被本地代理拒绝。随后在授权的沙箱外执行成功。

## 验证结果

已验证：

```bash
cd express-backend
npm run build
```

结果：通过。

```bash
cd frontend
npx tsc --noEmit
```

结果：通过。

未完成验证：

```bash
cd frontend
npm run build
```

原因：

- 在受限环境中，Vite/esbuild 子进程启动遇到 `EPERM`。
- 这不是数据库连接问题。
- 后续可在正常本机 shell 中重新执行完整前端构建。

## 预期效果

后端：

- 分页查询不再随 cursor 后剩余记录总量线性膨胀。
- 加载更多时跳过 totals 聚合，减少额外 count 查询。
- 新索引让 `createdAt + id` 游标分页更稳定。

前端：

- 滚动到下一页时更早预取。
- 加载更多请求不容易互相覆盖。
- 重复返回的数据不会重复插入列表。
- 加载更多失败能被用户感知。
- 时间线图片解码更少阻塞渲染。

## 后续建议

### 1. 做服务端分类/年份过滤

当前时间线会先从 `/api/library` 拉混合数据，再在前端按分类和年份过滤。

如果后续数据量继续增大，建议让 `/api/library` 支持：

- `category=movie|tv_show|game|media|all`
- `year=2026`
- `status=DONE`

这样可以避免前端为了筛选而加载大量当前视图不需要的数据。

### 2. 为时间线单独设计轻量接口

当前时间线复用 LibraryRecord，字段很多，包括豆瓣/TMDB 原始字段、简介、评分等。

时间线首屏其实只需要：

- id
- category
- title
- posterUrl
- status
- rating
- playtimeMinutes
- createdAt

后续可以新增：

```text
GET /api/timeline
```

只返回时间线所需字段，点击弹窗时再请求详情。这样能明显减少首屏 payload。

### 3. 增加列表虚拟滚动

如果时间线一次加载很多月份和海报，DOM 数量仍会持续增长。

后续可以评估：

- `react-window`
- `@tanstack/react-virtual`
- 按月份分组的虚拟列表

不过虚拟滚动会增加布局复杂度，建议等数据量继续变大或当前优化仍不够时再做。

### 4. 图片缓存和代理优化

如果断层主要来自外部图片加载，可以继续做：

- 图片代理缓存
- WebP/AVIF 缩略图缓存
- 海报尺寸裁剪
- 图片失败重试

这部分需要结合实际网络环境和图片来源再判断。

## 结论

本次优化先处理了最确定、低风险、收益直接的路径：

- 后端少读数据。
- 数据库补分页索引。
- 前端防并发和去重。
- 时间线提前预取。
- 图片异步解码和懒加载。

这不会改变现有产品行为，但会让记录库和时间线的数据读取更稳，滚动加载更少出现断层。
