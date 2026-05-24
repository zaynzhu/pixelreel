# Showcase 大屏页面设计

## 概述

为 PixelReel 新增一个大屏展示页面 `/showcase`，支持两种模式：
- **网格模式**（默认）：四宫格布局，同时展示统计数据、海报轮播、时间线概览、随机推荐
- **全屏轮播模式**：单区块占满视口，自动轮播切换，适合 TV 展示和派对投屏

## 目标用户场景

- **TV 展示屏**：挂在电视或外接显示器上，像数字相册一样展示影视游数据
- **投屏/派对模式**：聚会时投到大屏幕上，随机推荐、一起看收藏

## 路由与导航

- 路由：`/showcase`
- 在 AppShell 导航栏新增 `SHOWCASE` 链接，位于 `Activity` 和 `Settings` 之间
- 页面组件：`ShowcasePage.tsx`

## 页面结构

### 模式管理

`ShowcasePage` 内部维护 `mode` 状态（`grid` / `slideshow`），右上角提供切换按钮（网格图标 ↔ 全屏图标），带 `hover-glitch` 效果。

### 网格模式

CSS Grid `1fr 1fr` 两行两列，间距 16px，占满视口高度（减去 header）。

| 位置 | 组件 | 内容 |
|------|------|------|
| 左上 | `StatsPanel` | 大字数字（总数/完成/评分），底部小条：电影/剧集/游戏各自的均分 |
| 右上 | `PosterCarousel` | 3×2 海报网格，每 5 秒换一批，点击弹出 `TimelinePopup` |
| 左下 | `TimelineMini` | 横向年份柱状图（按年统计数量），最近一年高亮 `accent-deep` |
| 右下 | `RandomPick` | 随机一张海报 + 标题 + 评分，"🎲 再来一个"按钮，点击可查看详情 |

每个区块用现有的 `dash-card` 样式，带角标装饰（`section-kicker`）。

### 全屏轮播模式

进入全屏后，页面变为单区块占满整个视口，自动轮播：

- **轮播顺序**：统计数据 → 海报墙 → 时间线 → 随机推荐 → 循环
- **切换间隔**：每个区块停留 10 秒，过渡动画 0.5s（淡入淡出）
- **底部指示器**：4 个小圆点，当前区块高亮 `accent`，点击可跳转
- **统计数据区块**：全屏放大版，数字用 `text-8xl` + 发光效果
- **海报墙区块**：全屏 5×3 海报网格，每批 15 张
- **时间线区块**：横向年份轴全屏展开，柱状图更高更醒目
- **随机推荐区块**：大海报居中 + 标题 + 评分 + 简介，自动每 10 秒换一个
- **交互**：点击海报弹出 `TimelinePopup`，点击"再来一个"立即换
- **退出**：按 `Esc` 或点右上角按钮回到网格模式

## 组件拆分

```
ShowcasePage.tsx          ← 页面容器，管理 mode 状态和轮播逻辑
├── StatsPanel.tsx        ← 统计数字区块
├── PosterCarousel.tsx    ← 海报轮播区块
├── TimelineMini.tsx      ← 时间线概览区块
├── RandomPick.tsx        ← 随机推荐区块
└── ShowcaseControls.tsx  ← 模式切换按钮 + 轮播指示器
```

- 每个子组件接收 `profileStore` 数据作为 props，不自己请求
- `ShowcasePage` 用 `useEffect` 管理轮播定时器和当前索引
- `PosterCarousel` 和 `RandomPick` 内部各维护自己的轮播/随机逻辑
- 复用现有组件：`StarRating`、`ImgWithFallback`、`TimelinePopup`

## 数据流

- 页面挂载时调用 `useProfileStore().fetchSummary()`，和 Dashboard 共用同一个 store
- 海报轮播从 `recentItems` 中按批次取 6 张（网格）或 15 张（全屏）
- 随机推荐从全库随机取一条，需要后端新增 `GET /api/library/random` 接口
- 时间线数据复用 `GET /api/library` 按年分组统计（前端聚合即可）

### 后端新增接口

```
GET /api/library/random
```

返回一条随机记录，字段与 `LibraryRecord` 一致。如果库为空返回 404。

## 视觉设计（加强版赛博朋克）

延续现有主题，在大屏场景下加强视觉冲击力：

- **统计数字**：`text-7xl` Syne 粗体 + `text-shadow` 发光（`0 0 30px rgba(212,255,0,0.5)`）
- **海报**：保持现有的去饱和 + 扫描线效果，hover 恢复色彩
- **区块边框**：双线效果（`border` + `box-shadow` 内发光）
- **背景**：复用现有的网格 + 噪点，全屏模式下加一个缓慢移动的径向渐变光晕
- **全屏模式过渡**：`opacity` + `transform: scale(0.98)` 淡入淡出
- **角标**：每个区块左上角 `section-kicker` 标签（`STATS`、`POSTERS`、`TIMELINE`、`PICK`）

## i18n

所有新增文本必须支持中英双语，在 `i18nStore.ts` 中添加 key：

- `showcase.title` — 页面标题
- `showcase.stats.*` — 统计区块标签
- `showcase.random.*` — 随机推荐区块文本
- `showcase.mode.*` — 模式切换按钮文本

## 不做的事

- 不做投屏协议（Chromecast/AirPlay），投屏由用户自行通过系统镜像完成
- 不做投票/多人互动功能
- 不做自定义布局（用户不能拖拽调整区块）
- 不做独立的全屏路由，统一在 `/showcase` 内切换
