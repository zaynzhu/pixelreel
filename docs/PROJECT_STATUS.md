# PixelReel 项目状态

## 项目简介
PixelReel 是一个个人影游记录平台，支持影视与游戏的搜索、记录、平台导入与首页统计总览。
当前阶段目标已经收口到三条主线：搜索、平台导入、个人主页统计。

## 已完成功能
- [x] 后端基础架构（Spring Boot 3 + MyBatis Plus + MySQL）
- [x] Movie / Game 基础 CRUD
- [x] 统一外部搜索聚合接口（影视 / 游戏）
- [x] 影视搜索 Provider：TMDB / OMDb / Trakt / 豆瓣
- [x] Steam：应用搜索（AppList 缓存）+ 已购导入
- [x] Xbox：OpenXBL 已玩导入
- [x] PSN：PSNProfiles 已玩导入
- [x] RAWG：游戏搜索接口已接入
- [x] RAWG：封面补全接口（posterUrl 兜底）
- [x] 个人主页统计接口：`GET /api/profile/summary`
- [x] 前端应用壳：React Router + AppShell + Vite + TailwindCSS
- [x] 记录库接口：`GET /api/library` + `PATCH /api/library/{category}/{id}`
- [x] 前端页面：主页统计页、电影搜索页、游戏搜索页、记录库工作台
- [x] 前端状态：Zustand 记录状态管理 + 主页统计数据拉取 + 记录库数据拉取
- [x] 评分与短评编辑体验：状态、评分、短评在记录库统一编辑

## 未完成 / 占位
- [ ] 多用户登录与权限体系
- [ ] 豆瓣 CSV 导入（已暂停）
- [ ] Switch 接入（占位）
- [ ] 多用户隔离下的记录库权限控制

## 各平台接入状态
- Steam：已接入（搜索 + 已购导入）
- Xbox：已接入（OpenXBL 导入）
- PSN：已接入（PSNProfiles 导入）
- RAWG：已接入（搜索 + 封面补全）
- Switch：占位
- OMDb：已接入（影视搜索）
- 豆瓣：已接入（影视搜索，CSV 导入暂停）

## 当前前端路由
- `/`：个人主页统计首页
- `/movies/search`：电影搜索
- `/games/search`：游戏搜索
- `/library`：记录库列表 + 评分短评编辑

## 关键接口
- `GET /api/search/movies`：电影搜索聚合
- `GET /api/search/games`：游戏搜索聚合
- `POST /api/import/steam/owned`：Steam 已购导入
- `POST /api/import/xbox/owned`：Xbox 已玩导入
- `POST /api/import/psn/owned`：PSN 已玩导入
- `POST /api/import/covers/fill`：RAWG 封面补全
- `GET /api/profile/summary`：个人主页统计汇总
- `GET /api/library`：混合记录库列表
- `PATCH /api/library/{category}/{id}`：更新状态 / 评分 / 短评

## 本地启动方式
1. 准备数据库并导入表结构：执行 `schema.sql`
2. 准备配置（建议使用 `application-local.yml` 或环境变量，避免将密钥提交 Git）
3. 启动后端：
```bash
mvn clean compile
mvn spring-boot:run
```
4. 启动前端：
```bash
cd frontend
npm install
npm run dev
```

建议配置项（实际用到时才需要填写）：
- `spring.datasource.url` / `spring.datasource.username` / `spring.datasource.password`
- `tmdb.api-key`
- `omdb.api-key`
- `trakt.client-id`
- `steam-webapi.api-key`
- `openxbl.api-key`
- `psnprofiles.user-agent` / `psnprofiles.cookie`
- `rawg.api-key`

## 最近已验证
- [x] 后端：`mvn test` 通过
- [x] 前端：`npm run build` 通过
- [x] 搜索、平台导入、个人主页统计、记录库编辑代码均已接通

## 下一步计划（按优先级）
1. 完善多用户登录与权限体系
2. 为 `/library` 增加服务端分页与更多组合筛选
3. 若找到稳定方案，补回豆瓣 CSV 导入
4. 评估 Switch 可用的数据源并接入
