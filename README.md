# 🎮🎬 PixelReel

> 你的个人影游记录平台 —— 把看过的电影和玩过的游戏，都收进自己的库。

---

## ✨ 项目简介

PixelReel 是一个专为个人设计的影视与游戏记录平台。
不依赖豆瓣、不依赖 Steam 主页，数据完全由自己掌控。
支持从多个平台一键导入你的游戏库，配合影视搜索与记录功能，
让你的观影和游戏历史有一个统一的归宿。

---

## 🚀 已完成功能

- [x] 影视搜索（OMDb API）
- [x] 游戏搜索（RAWG API）
- [x] Steam 游戏库导入
- [x] Xbox 游戏库导入（OpenXBL）
- [x] PSN 游戏库导入（PSNProfiles）
- [x] 游戏封面自动补全（RAWG 兜底）
- [x] 记录状态管理（想看 / 在看 / 已看 / UNSET）
- [x] 平台 + 外部 ID 去重
- [x] 成就 / 奖杯统计（total / unlocked）

## 🔧 开发中 / 待完成

- [ ] 前端页面（React + TailwindCSS）
- [ ] 豆瓣 CSV 导入
- [ ] Nintendo Switch 接入
- [ ] 个人主页统计展示
- [ ] 评分与短评功能
- [ ] 部署到 GitHub Pages + Railway

---

## 🛠 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Spring Boot 3 + MyBatis Plus |
| 数据库 | MySQL |
| 前端 | React + TailwindCSS（开发中） |
| 影视数据 | OMDb API / TMDB API |
| 游戏数据 | RAWG API |
| 游戏导入 | Steam Web API / OpenXBL / PSNProfiles |

---

## ⚙️ 本地启动

### 1. 克隆项目

\`\`\`bash
git clone https://github.com/你的用户名/pixelreel.git
cd pixelreel
\`\`\`

### 2. 配置 API Key

复制示例配置文件并填入你的密钥：

\`\`\`bash
cp src/main/resources/application-local.yml.example \
   src/main/resources/application-local.yml
\`\`\`

需要申请的 Key：

| 服务 | 申请地址 | 免费额度 |
|------|---------|---------|
| OMDb | omdbapi.com | 1000次/天 |
| RAWG | rawg.io/apiv2 | 20000次/月 |
| OpenXBL | xbl.io | 500次/月 |
| Steam | steamcommunity.com/dev/apikey | 免费 |

### 3. 初始化数据库

\`\`\`bash
mysql -u root -p < src/main/resources/schema.sql
\`\`\`

### 4. 启动项目

\`\`\`bash
mvn clean spring-boot:run
\`\`\`

---

## 📡 主要接口

\`\`\`
POST /api/import/xbox/owned?gamertag={你的Gamertag}
POST /api/import/psn/owned?psnId={你的PSNID}
POST /api/import/covers/fill?limit=50
\`\`\`

---

## 📄 License

MIT — 随便用，随便改。
```
