# Showcase 视觉效果增强设计

## 概述

对已完成的 Showcase 大屏页面进行全面视觉增强：重新布局 + 赛博朋克视觉效果加强。

## 问题

当前实现的四个问题：
1. `dash-card` 太素 — 1px 灰边框，无发光、无内阴影，和普通卡片没区别
2. 海报太小太挤 — 3×2 网格在面板里每张海报很小，去饱和度 + 扫描线后更看不清
3. 统计数字缺乏冲击力 — `text-7xl` 在普通卡片里不够炸裂
4. 四面板等权 — 没有视觉焦点，内容层次不分明

## 布局改造

### 网格模式

从 `grid-cols-2 grid-rows-2` 改为自定义三区域布局：

```
┌─────────────────────────────────────┐
│ STATS 全宽横条 (高度 ~120px)         │  ← 区域1: 全宽
├──────────────────┬──────────────────┤
│                  │  TIMELINE        │
│  POSTER GRID     │  (flex-1)        │  ← 区域2+3: 60%/40%
│  4×2 (8张)       ├──────────────────┤
│                  │  RANDOM PICK     │
│                  │  (固定高度)       │
└──────────────────┴──────────────────┘
```

**StatsPanel 横条布局：**
- 左侧：大数字总数 + 均分（水平排列）
- 右侧：三个分类小卡片（MOV/TV/GAM 均分）水平排列
- 高度固定约 120px，不参与 flex 拉伸

**PosterCarousel：**
- 4×2 网格（8 张海报），每张更大更清晰
- 占左侧 60% 宽度

**右侧堆叠：**
- TimelineMini 上半部分（flex-1 占剩余空间）
- RandomPick 下半部分（固定高度约 200px）

### 全屏轮播模式

每个 slide 占满视口，布局调整：
- **统计 slide**：数字 `text-9xl`，分类均分横排下方，整体居中
- **海报 slide**：5×3 网格（15 张），全屏铺开
- **时间线 slide**：柱状图全屏展开，柱子更高更粗
- **随机推荐 slide**：大海报居中（300×420），标题+评分+简介在右侧
- 切换过渡：`opacity` + `transform: scale(0.97)` 淡入淡出 0.5s

## 视觉效果增强

### 1. 动态背景

ShowcasePage 容器加缓慢移动的径向渐变光晕：

```css
.showcase-bg {
  position: relative;
}
.showcase-bg::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(
    600px circle at 50% 50%,
    rgba(212,255,0,0.06) 0%,
    transparent 100%
  );
  animation: showcase-drift 20s ease-in-out infinite;
  pointer-events: none;
  z-index: 0;
}

@keyframes showcase-drift {
  0%   { transform: translate(-20%, -20%); }
  25%  { transform: translate(20%, -10%); }
  50%  { transform: translate(10%, 20%); }
  75%  { transform: translate(-10%, 10%); }
  100% { transform: translate(-20%, -20%); }
}
```

### 2. 面板发光边框

showcase 专用面板类 `.showcase-panel`，替换 `dash-card`：

```css
.showcase-panel {
  background: var(--surface);
  border: 1px solid rgba(212,255,0,0.25);
  box-shadow:
    0 0 15px rgba(212,255,0,0.12),
    inset 0 0 30px rgba(212,255,0,0.03);
  transition: border-color 0.3s, box-shadow 0.3s;
}
.showcase-panel:hover {
  border-color: rgba(212,255,0,0.5);
  box-shadow:
    0 0 25px rgba(212,255,0,0.2),
    inset 0 0 40px rgba(212,255,0,0.05);
}
```

### 3. 数字脉冲发光

统计数字用三层 text-shadow + 呼吸动画：

```css
.showcase-number {
  color: var(--accent);
  text-shadow:
    0 0 20px rgba(212,255,0,0.6),
    0 0 40px rgba(212,255,0,0.3),
    0 0 80px rgba(212,255,0,0.15);
  animation: glow-pulse 3s ease-in-out infinite;
}

@keyframes glow-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.85; }
}
```

### 4. 海报增强

- 扫描线从 `rgba(0,0,0,0.15)` 加强到 `rgba(0,0,0,0.25)`
- hover 恢复色彩时加发光边框：
  ```css
  border-color: var(--accent);
  box-shadow: 0 0 15px rgba(212,255,0,0.3);
  ```

### 5. 时间线柱子发光

最新年份的柱子加更强的 glow：
```css
box-shadow: 0 0 15px rgba(255,68,0,0.5), 0 0 30px rgba(255,68,0,0.2);
```

## 改动文件清单

| 文件 | 改动 |
|------|------|
| `frontend/src/styles.css` | 新增 `.showcase-panel`、`.showcase-number`、`@keyframes showcase-drift`、`@keyframes glow-pulse` |
| `frontend/src/pages/ShowcasePage.tsx` | 布局从 2×2 改为三区域，加 `showcase-bg` 类 |
| `frontend/src/components/showcase/StatsPanel.tsx` | 改为横条布局，使用 `.showcase-number` |
| `frontend/src/components/showcase/PosterCarousel.tsx` | 改为 4×2 网格，扫描线加强，hover 发光 |
| `frontend/src/components/showcase/TimelineMini.tsx` | 柱子加发光，适配新容器高度 |
| `frontend/src/components/showcase/RandomPick.tsx` | 适配新容器，海报尺寸调整 |

## 不做的事

- 不改路由、不改后端、不改 i18n
- 不改组件拆分结构（仍是 5 个子组件）
- 不加新依赖
