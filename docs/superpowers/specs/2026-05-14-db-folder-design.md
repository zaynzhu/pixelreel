# 数据库初始化文件夹设计

**日期**: 2026-05-14
**状态**: 已确认

## 问题

换环境开发时，没有明确的数据库初始化入口。根目录的 `schema.sql` 是 Java 遗留文件，Prisma schema 才是当前真相来源，但新开发者不知道先做什么。

## 方案

采用 **Prisma 为主 + SQL 辅助** 方案：表结构只在 `schema.prisma` 定义，`init.sql` 只管建库。

## 文件结构

```
db/
  init.sql                  ← CREATE DATABASE + USE，不建表
  setup.md                  ← 从零搭建的完整手顺
  legacy/
    java-schema.sql         ← 原 schema.sql，加注释标明 Java 后端用
```

## 各文件职责

### db/init.sql

只做建库：

```sql
CREATE DATABASE IF NOT EXISTS pixelreel
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE pixelreel;
```

建表交给 `npx prisma db push`（从 schema.prisma 生成），不重复定义表结构。

### db/setup.md

从零开始的手顺文档，每步有具体命令：

1. 安装 MySQL
2. 执行 `db/init.sql` 建库
3. 配置 `.env`（DATABASE_URL 等）
4. `cd express-backend && npm install`
5. `npx prisma db push` 建表
6. 启动后端 `npm run dev`
7. 启动前端 `cd frontend && npm run dev`

（不提供 seed 数据，避免污染真实数据。开发者通过前端搜索添加记录即可。）

### db/legacy/java-schema.sql

原根目录 `schema.sql` 移入，文件头加注释标明 Java Spring Boot 后端用。Express + Prisma 不使用此文件。

## 清理

- 删除根目录 `schema.sql`（已移至 `db/legacy/java-schema.sql`）
- 更新 `CLAUDE.md` 开发命令部分，加入 `db/init.sql` 步骤