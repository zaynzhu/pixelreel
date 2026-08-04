# PixelReel 文档索引

代码、Prisma schema 和自动化检查是当前行为的最终依据。本目录分为以下三类：

## 当前文档

- [项目总览与使用说明](../README.md)
- [开发环境搭建](../db/setup.md)
- [后端说明](../express-backend/README.md)
- [外部服务配置指南](../express-backend/docs/API_KEY_GUIDE.md)
- [游戏记录与平台档案分层 ADR](adr/0001-separate-game-platform-entries.md)

## 规划记录

`plans/` 保存阶段性方案与实现计划。文件名中的日期表示方案形成时间，不代表当前状态；
凡与代码冲突的内容均以当前实现为准。标有 `STALE` 的 Java/Spring 方案只用于追溯历史。

## 历史归档

`superpowers/` 保存已完成阶段的设计与执行记录，不是待执行任务清单，也不作为当前 API、
路径或数据模型的依据。新增事实应写入当前文档或 `AGENTS.md`，不要继续修改归档方案。
