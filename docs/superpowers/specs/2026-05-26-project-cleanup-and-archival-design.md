# 项目清理与归档设计

**日期**：2026-05-26
**状态**：已批准

## 背景

PixelReel 目前存在以下问题：
- 根目录 `douban-harvester/` 是独立的旧版 CLI 工具，功能已集成到 `express-backend/` 内但代码已分叉
- Java Spring Boot 后端（`src/` + `pom.xml`）标记为"备选/遗留"但未归档，文档中仍提供启动说明
- `express-backend/.env.backup` 含明文数据库密码和 JWT 凭证
- `README.md` 和 `docs/PROJECT_STATUS.md` 大量重复内容且存在矛盾（多用户登录、CSV 导入 UI 的态度不一致）

## 决策

| 项目 | 决策 |
|------|------|
| `douban-harvester/` | 彻底删除 |
| Java 后端 | 移到 `legacy/java-backend/`，文档不再提供启动说明 |
| `.env.backup` | 直接删除 |
| `clear_data.sql` | 直接删除 |
| 测试覆盖 | 暂不补充 |
| README + PROJECT_STATUS | 合并为一份 README.md，删除 PROJECT_STATUS.md |
| `douban-exporter-guide.md` | 随 douban-harvester 一起删除 |

## 执行计划（分 3 次提交）

### 第一步：敏感文件清理

**提交信息**：`chore: remove sensitive .env.backup and clear_data.sql`

- 删除 `express-backend/.env.backup`（含明文凭证）
- 删除 `express-backend/clear_data.sql`（无保留价值）
- 确认 `.gitignore` 已包含 `.env` 和 `.env.*` 模式

### 第二步：代码归档

**提交信息**：`chore: archive Java backend to legacy/, remove standalone douban-harvester`

- 删除 `douban-harvester/` 整个目录（独立 CLI 版本已过时分叉）
- 删除 `douban-exporter-guide.md`（对应工具已删除）
- 移动 `src/` → `legacy/java-backend/src/`
- 移动 `pom.xml` → `legacy/java-backend/pom.xml`
- `db/legacy/java-schema.sql` 保留在原位（数据库层资料，与 Java 代码逻辑无关）

### 第三步：文档合并

**提交信息**：`docs: merge PROJECT_STATUS into README, remove Java backend references`

**README.md 合并后结构**：

1. 项目简介 — 一句话
2. 技术栈 — Express + Prisma 为唯一后端；底部注释"Java 后端代码在 `legacy/java-backend/`，不再维护"
3. 已完成功能 — 清单
4. 不计划实现 — 多用户登录、CSV 导入 UI（消除与旧 PROJECT_STATUS 的矛盾）
5. 前端路由
6. 关键接口
7. 本地启动 — 仅 Express 后端 + 前端，移除 Java 启动说明
8. 配置项（.env）
9. 数据模型

**CLAUDE.md 同步修改**：

- 技术栈表移除 Java 行，加一句 "Java 后端代码在 `legacy/java-backend/`，不再维护"
- 项目结构图中 `src/` → `legacy/java-backend/`
- 删除 Java 后端启动命令段
- 切换后端说明精简为一句
- 更新 `db/legacy/` 路径说明
- 移除 `douban-harvester/` 相关目录条目

## 不在范围内

- 测试覆盖（暂不补充）
- 前端代码清理
- 数据库 schema 变更