# PixelReel Runtime Source Settings

> **日期：** 2026-05-25
>
> **目标：** 记录豆瓣收割机、Playwright 和雷达数据源在本地与 Docker 部署中的配置边界。

## 豆瓣收割机

`mode=json` 只读取已有 JSON 数据，不启动 Chromium。

`mode=full` 和 `mode=incremental` 会启动 Playwright Chromium。部署环境应保持：

```env
DOUBAN_HARVEST_HEADLESS=true
```

如需完全关闭浏览器收割：

```env
DOUBAN_HARVEST_ENABLED=false
```

关闭后，JSON 导入仍可使用。`mode=full` 和 `mode=incremental` 请求会返回 403。

### 豆瓣收割机配置项

| 环境变量 | 默认值 | 说明 |
|---------|--------|------|
| `DOUBAN_HARVEST_ENABLED` | `true` | 是否启用浏览器收割（JSON 导入不受影响） |
| `DOUBAN_HARVEST_HEADLESS` | `true` | Playwright 是否无头模式 |
| `DOUBAN_HARVEST_MAX_PAGES_PER_RUN` | `200` | 单次收割最大页数 |
| `DOUBAN_HARVEST_SLEEP_MIN` | `3` | 页间最小等待（秒） |
| `DOUBAN_HARVEST_SLEEP_MAX` | `7` | 页间最大等待（秒） |
| `DOUBAN_HARVEST_LONG_BREAK_EVERY` | `40` | 每隔多少页主动休息 |
| `DOUBAN_HARVEST_LONG_BREAK_SECONDS` | `180` | 主动休息时长（秒） |
| `DOUBAN_HARVEST_NAVIGATION_TIMEOUT_MS` | `30000` | 页面导航超时（毫秒） |

## Docker

启用浏览器收割或未来爱奇艺 Radar 源时，镜像需要安装 Chromium 依赖：

```dockerfile
RUN npx playwright install --with-deps chromium
```

如果不启用任何 Playwright 源，可以不触发 Chromium 运行路径。

## 数据目录

容器部署时建议把 `DOUBAN_DATA_DIR` 指向持久化 volume：

```env
DOUBAN_DATA_DIR=/data/douban-harvester
```

否则容器重建后 `collect.json`、进度和同步状态会丢失。

## 雷达

Radar 的国内页面爬虫和爱奇艺 Playwright 源应为 optional source：

```env
RADAR_SCRAPERS_ENABLED=true
RADAR_IQIYI_ENABLED=false
```

第一版 Radar 不应因为 optional source 失败而影响 TMDB 核心数据展示。

### 雷达配置项

| 环境变量 | 默认值 | 说明 |
|---------|--------|------|
| `RADAR_ENABLED` | `true` | 是否启用雷达模块 |
| `RADAR_CRON_ENABLED` | `true` | 是否启用定时同步 |
| `RADAR_SYNC_ON_START` | `true` | 启动时是否执行一次核心源同步 |
| `RADAR_SCRAPERS_ENABLED` | `true` | 是否启用国内页面爬虫 |
| `RADAR_IQIYI_ENABLED` | `false` | 是否启用爱奇艺源（需要 Playwright） |
| `RADAR_PLAYWRIGHT_HEADLESS` | `true` | 雷达 Playwright 是否无头模式 |
| `RADAR_SYNC_CORE_CRON` | `0 * * * *` | 核心源同步 cron 表达式（每小时） |
| `RADAR_SYNC_SCRAPER_CRON` | `0 */6 * * *` | 爬虫源同步 cron 表达式（每6小时） |
| `RADAR_REQUEST_TIMEOUT_MS` | `15000` | 外部请求超时（毫秒） |