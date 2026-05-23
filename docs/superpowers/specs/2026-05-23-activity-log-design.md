# Activity Log — 操作日志设计

## 概述

为 PixelReel 新增操作日志功能，记录用户对影视/游戏条目的所有变更、导入任务执行历史，并支持撤销操作。

### 核心能力

- **统一时间线**：所有操作按时间倒序展示，支持游标分页 + 无限滚动
- **三类事件**：数据变更（CRUD）、任务历史（开始/完成/失败）、导入事件
- **变更详情**：记录操作前后的具体字段值（旧值 → 新值）
- **筛选器**：按类型、时间范围、操作类型筛选
- **撤销/回滚**：对 CREATE/UPDATE/DELETE 操作可一键撤销
- **条目级历史**：在条目编辑抽屉中查看该条目的所有变更记录

## 数据模型

新增 `activity_log` 表：

```sql
CREATE TABLE activity_log (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  action        VARCHAR(20)  NOT NULL,    -- CREATE|UPDATE|DELETE|TASK_START|TASK_DONE|TASK_FAIL
  entity_type   VARCHAR(20)  NOT NULL,    -- MOVIE|TV_SHOW|GAME|TASK
  entity_id     BIGINT       NULL,        -- 关联条目 ID（任务事件可为 null）
  entity_title  VARCHAR(255) NOT NULL,    -- 条目标题快照（条目删除后仍可显示）
  old_values    JSON         NULL,        -- 变更前字段值（CREATE 时为 null）
  new_values    JSON         NULL,        -- 变更后字段值（DELETE 时为 null）
  metadata      JSON         NULL,        -- 额外信息（任务类型、错误信息等）
  created_at    DATETIME(0)  NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

  INDEX idx_activity_created (created_at),
  INDEX idx_activity_entity (entity_type, entity_id)
);
```

### 变更详情示例

```json
// 修改评分
{
  "action": "UPDATE",
  "entity_type": "MOVIE",
  "entity_title": "漫画威龙2",
  "old_values": { "rating": 3 },
  "new_values": { "rating": 5 }
}

// 任务完成
{
  "action": "TASK_DONE",
  "entity_type": "TASK",
  "entity_title": "TMDB 数据回填",
  "metadata": { "taskType": "tmdb-enrich-backfill", "total": 930, "imported": 663, "skipped": 267 }
}
```

## 后端架构

### Prisma Middleware（自动捕获数据变更）

`express-backend/src/middlewares/activity-log.ts`

拦截 `Movie`、`TvShow`、`Game` 三个模型的写操作：

- `create` → 记录 `new_values`（全字段快照，排除系统字段 id/createdAt/updatedAt）
- `update` → 对比 `before`/`after`，只记录实际变更的字段到 `old_values` + `new_values`
- `delete` → 记录 `old_values`（删除前快照）

在 `express-backend/src/index.ts` 入口注册 middleware。

### 手动记录（任务/导入事件）

在以下位置插入日志写入：

- `task-manager.ts` 的 `startTask` / `completeTask` / `failTask` → 记录 `TASK_START` / `TASK_DONE` / `TASK_FAIL`
- 导入 service 完成后记录批量结果到 `metadata`

### API 路由

```
GET  /api/activity                              # 统一时间线（游标分页）
     ?limit=50&cursor=...
     &action=UPDATE                              # 按操作类型筛选
     &entityType=MOVIE                           # 按实体类型筛选
     &entityId=123                               # 按条目 ID 筛选（条目级历史）
     &from=2026-05-01&to=2026-05-23             # 按时间范围筛选

POST /api/activity/:id/undo                     # 撤销操作
```

响应格式：

```json
{
  "records": [
    {
      "id": 1,
      "action": "UPDATE",
      "entityType": "MOVIE",
      "entityId": 4,
      "entityTitle": "漫画威龙2",
      "oldValues": { "rating": 3 },
      "newValues": { "rating": 5 },
      "metadata": null,
      "createdAt": "2026-05-23T14:32:00Z",
      "undoable": true
    }
  ],
  "nextCursor": "2026-05-23T14:30:00Z__2"
}
```

### 撤销逻辑

`POST /api/activity/:id/undo`：

1. 读取 activity_log 记录
2. 根据 `action` 类型执行反向操作：
   - `CREATE` → 删除该条目（需确认条目仍存在且未被后续操作修改）
   - `UPDATE` → 将 `old_values` 写回目标条目
   - `DELETE` → 重新创建条目（从 `old_values` 恢复）
3. 撤销操作本身也记录为一条 activity_log（action=`UNDO`），形成可追溯链
4. 如果目标条目已被后续操作修改，返回 409 Conflict 提示冲突

## 前端设计

### 页面路由

`/activity` → `ActivityPage.tsx`

### 布局（方案 A：全宽时间线）

```
┌──────────────────────────────────────────────────┐
│  ACTIVITY LOG                                     │
│  [全部] [数据变更] [任务] [导入]  时间▼ [今天][7天][30天] │
├──────────────────────────────────────────────────┤
│  05-23 14:32 │ UPDATE  漫画威龙2  评分 3★→5★  [↩ UNDO] │
│  05-23 14:30 │ TASK    TMDB回填   663/930 成功         │
│  05-23 13:15 │ TASK_FAIL 豆瓣同步  页面超时              │
│  05-23 12:00 │ CREATE  低智商犯罪  豆瓣导入 5★    [↩ UNDO] │
│  05-23 11:45 │ UPDATE  怪奇物语   状态 在看→已看  [↩ UNDO] │
│  ...                                              │
│  [加载更多...]                                     │
└──────────────────────────────────────────────────┘
```

### 操作标签颜色

| 操作 | 颜色 |
|------|------|
| CREATE | 绿色 `#6f6` |
| UPDATE | 黄色 `#d4ff00` |
| DELETE | 红色 `#f44` |
| TASK_DONE | 蓝色 `#4af` |
| TASK_FAIL | 红色 `#f44` |
| TASK_START | 灰色 `#888` |

### 条目级历史

在 `RightActionDrawer`（条目编辑抽屉）底部新增「变更历史」按钮，点击后展开该条目的所有 activity_log 记录（复用时间线组件，`entityId` 筛选）。

### 撤销交互

1. 点击 UNDO 按钮
2. 弹出确认对话框：「确认撤销此操作？将恢复到变更前的状态。」
3. 调用 `POST /api/activity/:id/undo`
4. 成功后刷新时间线，显示撤销记录
5. 失败（409 冲突）时提示：「该条目已被后续操作修改，无法撤销」

### 新增/修改的前端文件

- `frontend/src/pages/ActivityPage.tsx` — 新页面
- `frontend/src/stores/activityStore.ts` — Zustand store（游标分页 + 筛选状态）
- `frontend/src/components/ActivityTimeline.tsx` — 时间线列表组件（可复用于条目级历史）
- `frontend/src/components/ActivityFilters.tsx` — 筛选栏组件
- `frontend/src/components/RightActionDrawer.tsx` — 修改：新增「变更历史」按钮

### 新增/修改的后端文件

- `prisma/schema.prisma` — 新增 ActivityLog model
- `express-backend/src/middlewares/activity-log.ts` — Prisma middleware
- `express-backend/src/routes/activity.ts` — 新路由
- `express-backend/src/routes/index.ts` — 注册新路由
- `express-backend/src/services/task-manager.ts` — 修改：任务生命周期写日志

## 技术约束

- 与现有游标分页模式一致（`createdAt__id` 格式）
- 赛博朋克主题风格（CSS 自定义属性、JetBrains Mono 字体）
- 大字段（old_values/new_values）用 JSON 类型存储，不单独建列
- Prisma middleware 只记录实际变更的字段，不全量快照 UPDATE
