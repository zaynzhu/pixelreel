# PixelReel 项目状态

## 项目简介
PixelReel 是一个个人影游记录平台，支持影视与游戏的搜索、记录与导入。后端采用 Spring Boot 3 + MyBatis Plus + MySQL，前端采用 React + TailwindCSS。

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
- [x] 前端：影视/游戏搜索组件（可切平台 Tab）与 Zustand 游戏状态管理

## 未完成 / 占位
- [ ] 豆瓣 CSV 导入（已暂停）
- [ ] Switch 接入（占位）
- [ ] 个人主页统计接口与前端展示
- [ ] 多用户登录与权限体系

## 各平台接入状态
- Steam：已接入（搜索 + 已购导入）
- Xbox：已接入（OpenXBL 导入）
- PSN：已接入（PSNProfiles 导入）
- RAWG：已接入（搜索 + 封面补全）
- Switch：占位
- OMDb：已接入（影视搜索）
- 豆瓣：已接入（影视搜索，CSV 导入暂停）

## 本地启动方式
1. 准备数据库并导入表结构：执行 `schema.sql`
2. 准备配置（建议使用 `application-local.yml` 或环境变量，避免将密钥提交 Git）
3. 启动后端：
```bash
mvn clean compile
mvn spring-boot:run
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

## 下一步计划（按优先级）
1. 实现个人主页统计接口与 UI
2. 完善多用户登录与权限体系
3. 若找到稳定方案，补回豆瓣 CSV 导入
4. 评估 Switch 可用的数据源并接入
