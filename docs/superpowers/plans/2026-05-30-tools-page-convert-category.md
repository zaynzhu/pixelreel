# 工具页面 - 修改记录类型 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建工具页面，提供修改记录类型功能（电影 ↔ 电视剧）

**Architecture:** 前端 ToolsPage 组件 + 后端 tools API，支持搜索记录并转换类型，自动备份数据

**Tech Stack:** React 18, Zustand, TailwindCSS, Express, Prisma

---

## 文件结构

| 文件 | 操作 | 说明 |
|------|------|------|
| `frontend/src/stores/i18nStore.ts` | 修改 | 添加 i18n key |
| `express-backend/src/routes/tools.ts` | 新增 | 工具 API |
| `express-backend/src/routes/index.ts` | 修改 | 注册路由 |
| `frontend/src/pages/ToolsPage.tsx` | 新增 | 工具页面 |
| `frontend/src/App.tsx` | 修改 | 添加路由 |
| `frontend/src/components/AppShell.tsx` | 修改 | 添加导航 |

---

### Task 1: 添加 i18n key

**Files:**
- Modify: `frontend/src/stores/i18nStore.ts`

- [ ] **Step 1: 添加英文 i18n key**

在 `dictionaries.en` 中添加以下 key（在 `"nav.settings"` 之后）：

```typescript
    // Tools
    "nav.tools": "TOOLS",
    "tools.kicker": "TOOLS // UTILITIES",
    "tools.title": "TOOLBOX",
    "tools.desc": "/// Data maintenance utilities.",
    "tools.convert.title": "CONVERT RECORD TYPE",
    "tools.convert.desc": "Convert between movie and TV show.",
    "tools.convert.search_placeholder": "Enter search query...",
    "tools.convert.search": "SEARCH",
    "tools.convert.searching": "SEARCHING...",
    "tools.convert.no_results": "NO RESULTS FOUND",
    "tools.convert.to_tv": "CONVERT TO TV SHOW",
    "tools.convert.to_movie": "CONVERT TO MOVIE",
    "tools.convert.converting": "CONVERTING...",
    "tools.convert.success": "CONVERT SUCCESS. NEW ID: {0}",
    "tools.convert.failed": "CONVERT FAILED",
    "tools.convert.confirm": "Are you sure you want to convert this record?",
```

- [ ] **Step 2: 添加中文 i18n key**

在 `dictionaries.zh` 中添加以下 key（在 `"nav.settings"` 之后）：

```typescript
    // Tools
    "nav.tools": "工具",
    "tools.kicker": "工具 // 实用工具",
    "tools.title": "工具箱",
    "tools.desc": "/// 数据维护工具集。",
    "tools.convert.title": "修改记录类型",
    "tools.convert.desc": "在电影和电视剧之间转换记录类型。",
    "tools.convert.search_placeholder": "输入搜索关键词...",
    "tools.convert.search": "搜索",
    "tools.convert.searching": "搜索中...",
    "tools.convert.no_results": "未找到结果",
    "tools.convert.to_tv": "转换为电视剧",
    "tools.convert.to_movie": "转换为电影",
    "tools.convert.converting": "转换中...",
    "tools.convert.success": "转换成功。新记录 ID: {0}",
    "tools.convert.failed": "转换失败",
    "tools.convert.confirm": "确定要转换这条记录的类型吗？",
```

- [ ] **Step 3: 提交**

```bash
cd /Users/zaynzhu/code/claude\ code/project/pixelreel
git add frontend/src/stores/i18nStore.ts
git commit -m "feat: 添加工具页面的 i18n key"
```

---

### Task 2: 创建后端 API

**Files:**
- Create: `express-backend/src/routes/tools.ts`
- Modify: `express-backend/src/routes/index.ts`

- [ ] **Step 1: 创建 tools.ts 路由**

创建 `express-backend/src/routes/tools.ts`：

```typescript
import { Router, Request, Response } from 'express';
import { getDb } from '../config/db';
import fs from 'fs';
import path from 'path';

const router = Router();

// POST /api/tools/convert-category
// 将记录从电影转为电视剧，或从电视剧转为电影
router.post('/convert-category', async (req: Request, res: Response) => {
  const { id, from, to } = req.body;

  // 参数验证
  if (!id || !from || !to) {
    res.status(400).json({ error: 'id, from, to are required' });
    return;
  }

  if (from !== 'movie' && from !== 'tv_show') {
    res.status(400).json({ error: 'from must be movie or tv_show' });
    return;
  }

  if (to !== 'movie' && to !== 'tv_show') {
    res.status(400).json({ error: 'to must be movie or tv_show' });
    return;
  }

  if (from === to) {
    res.status(400).json({ error: 'from and to must be different' });
    return;
  }

  try {
    const db = getDb();

    // 1. 从源表读取记录
    const sourceRecord = from === 'movie'
      ? await db.movie.findUnique({ where: { id: BigInt(id) } })
      : await db.tvShow.findUnique({ where: { id: BigInt(id) } });

    if (!sourceRecord) {
      res.status(404).json({ error: `Record not found in ${from} table` });
      return;
    }

    // 2. 备份原始数据
    const tempDir = path.resolve(__dirname, '../../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const backupPath = path.join(tempDir, `convert_${id}_${Date.now()}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(sourceRecord, (key, value) =>
      typeof value === 'bigint' ? value.toString() : value
    , 2));

    // 3. 字段映射
    const { releaseDate, firstAirDate, ...rest } = sourceRecord as any;
    const targetData: any = { ...rest };

    if (from === 'movie' && to === 'tv_show') {
      // movie → tv_show: releaseDate → firstAirDate
      targetData.firstAirDate = releaseDate;
      targetData.releaseDate = null;
    } else {
      // tv_show → movie: firstAirDate → releaseDate
      targetData.releaseDate = firstAirDate;
      targetData.firstAirDate = null;
    }

    // 4. 在目标表创建新记录
    const newRecord = to === 'movie'
      ? await db.movie.create({ data: targetData })
      : await db.tvShow.create({ data: targetData });

    // 5. 删除源表记录
    if (from === 'movie') {
      await db.movie.delete({ where: { id: BigInt(id) } });
    } else {
      await db.tvShow.delete({ where: { id: BigInt(id) } });
    }

    // 6. 删除备份文件（转换成功后）
    fs.unlinkSync(backupPath);

    res.json({
      success: true,
      newId: Number(newRecord.id),
      backupPath: backupPath,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Convert failed' });
  }
});

// GET /api/tools/search
// 搜索电影和电视剧记录
router.get('/search', async (req: Request, res: Response) => {
  const query = req.query.query as string;

  if (!query || query.trim().length === 0) {
    res.json({ results: [] });
    return;
  }

  try {
    const db = getDb();
    const searchTerm = query.trim();

    // 搜索电影
    const movies = await db.movie.findMany({
      where: {
        OR: [
          { title: { contains: searchTerm } },
          { doubanTitle: { contains: searchTerm } },
          { tmdbTitle: { contains: searchTerm } },
        ],
      },
      select: {
        id: true,
        title: true,
        posterUrl: true,
        doubanDate: true,
        doubanId: true,
        tmdbId: true,
      },
      orderBy: { doubanDate: 'desc' },
      take: 20,
    });

    // 搜索电视剧
    const tvShows = await db.tvShow.findMany({
      where: {
        OR: [
          { title: { contains: searchTerm } },
          { doubanTitle: { contains: searchTerm } },
          { tmdbTitle: { contains: searchTerm } },
        ],
      },
      select: {
        id: true,
        title: true,
        posterUrl: true,
        doubanDate: true,
        doubanId: true,
        tmdbId: true,
      },
      orderBy: { doubanDate: 'desc' },
      take: 20,
    });

    // 合并结果并添加 category 标识
    const results = [
      ...movies.map(m => ({ ...m, category: 'movie' as const, id: Number(m.id) })),
      ...tvShows.map(t => ({ ...t, category: 'tv_show' as const, id: Number(t.id) })),
    ].sort((a, b) => {
      // 按 doubanDate 降序排序
      const dateA = a.doubanDate ? new Date(a.doubanDate).getTime() : 0;
      const dateB = b.doubanDate ? new Date(b.doubanDate).getTime() : 0;
      return dateB - dateA;
    });

    res.json({ results });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? 'Search failed' });
  }
});

export default router;
```

- [ ] **Step 2: 注册路由到 index.ts**

在 `express-backend/src/routes/index.ts` 中添加：

```typescript
import toolsRoutes from './tools';

// 在其他路由注册之后添加
router.use('/tools', toolsRoutes);
```

- [ ] **Step 3: 提交**

```bash
cd /Users/zaynzhu/code/claude\ code/project/pixelreel
git add express-backend/src/routes/tools.ts express-backend/src/routes/index.ts
git commit -m "feat: 添加工具 API（搜索和转换记录类型）"
```

---

### Task 3: 创建前端页面

**Files:**
- Create: `frontend/src/pages/ToolsPage.tsx`

- [ ] **Step 1: 创建 ToolsPage 组件**

创建 `frontend/src/pages/ToolsPage.tsx`：

```tsx
import { useState } from "react";
import { useI18nStore } from "../stores/i18nStore";
import { apiFetch } from "../api";
import { ImgWithFallback } from "../components/ImgWithFallback";
import { proxiedImageUrl } from "../imageProxy";

interface SearchResult {
  id: number;
  category: "movie" | "tv_show";
  title: string;
  posterUrl?: string | null;
  doubanDate?: string | null;
  doubanId?: string | null;
  tmdbId?: number | null;
}

export default function ToolsPage() {
  const { t } = useI18nStore();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [converting, setConverting] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 搜索记录
  const handleSearch = async () => {
    if (!query.trim()) return;

    setSearching(true);
    setError(null);
    setMessage(null);
    setResults([]);

    try {
      const data = await apiFetch<{ results: SearchResult[] }>(
        `/tools/search?query=${encodeURIComponent(query.trim())}`
      );
      setResults(data.results || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("tools.convert.failed"));
    } finally {
      setSearching(false);
    }
  };

  // 转换记录类型
  const handleConvert = async (record: SearchResult) => {
    const targetCategory = record.category === "movie" ? "tv_show" : "movie";

    // 确认对话框
    if (!window.confirm(t("tools.convert.confirm"))) {
      return;
    }

    setConverting(record.id);
    setError(null);
    setMessage(null);

    try {
      const data = await apiFetch<{ success: boolean; newId: number }>(
        "/tools/convert-category",
        {
          method: "POST",
          body: JSON.stringify({
            id: record.id,
            from: record.category,
            to: targetCategory,
          }),
        }
      );

      setMessage(t("tools.convert.success", String(data.newId)));

      // 重新搜索以更新结果
      await handleSearch();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("tools.convert.failed"));
    } finally {
      setConverting(null);
    }
  };

  // 获取来源标签
  const getSourceLabel = (record: SearchResult) => {
    if (record.doubanId) return "豆瓣";
    if (record.tmdbId) return "TMDB";
    return "未知";
  };

  // 格式化日期
  const formatDate = (date?: string | null) => {
    if (!date) return "——";
    return date;
  };

  return (
    <div className="grid gap-6">
      <section className="dash-card overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-[var(--accent)]" />

        <div>
          <p className="section-kicker">{t("tools.kicker")}</p>
          <h2 className="font-display mt-2 text-3xl text-white sm:text-4xl">
            {t("tools.title")}
          </h2>
          <p className="mt-3 max-w-2xl text-xs leading-6 text-[var(--muted)] uppercase">
            {t("tools.desc")}
          </p>
        </div>

        {/* 修改记录类型工具 */}
        <div className="mt-8 border border-[var(--line)] bg-[var(--surface-hover)] p-5 relative">
          <div className="absolute top-0 right-0 w-8 h-1 bg-[var(--accent)] opacity-50" />

          <h3 className="font-display text-xl text-white uppercase">
            {t("tools.convert.title")}
          </h3>
          <p className="mt-2 text-xs text-[var(--muted)] uppercase">
            {t("tools.convert.desc")}
          </p>

          {/* 搜索框 */}
          <div className="mt-4 flex gap-3">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder={t("tools.convert.search_placeholder")}
              className="tech-input flex-1"
            />
            <button
              onClick={handleSearch}
              disabled={searching || !query.trim()}
              className="brutal-btn-accent px-6"
            >
              {searching ? t("tools.convert.searching") : t("tools.convert.search")}
            </button>
          </div>

          {/* 消息提示 */}
          {message && (
            <div className="mt-4 border-l-4 border-[var(--accent)] bg-[var(--accent)]/10 px-4 py-3 text-xs text-[var(--accent)] font-bold uppercase">
              [SYS] {message}
            </div>
          )}

          {/* 错误提示 */}
          {error && (
            <div className="mt-4 border-l-4 border-red-500 bg-red-500/10 px-4 py-3 text-xs text-red-400 font-bold uppercase">
              [ERR] {error}
            </div>
          )}

          {/* 搜索结果 */}
          <div className="mt-4 space-y-3">
            {results.map((record) => (
              <div
                key={`${record.category}-${record.id}`}
                className="flex items-center gap-4 p-3 border border-[var(--line)] bg-[var(--surface)]"
              >
                {/* 海报 */}
                <div className="w-16 h-24 overflow-hidden bg-[#0a0a0a] border border-[var(--line)] flex-shrink-0">
                  <ImgWithFallback
                    src={proxiedImageUrl(record.posterUrl) ?? ""}
                    alt={record.title}
                    className="w-full h-full object-cover"
                    fallback={
                      <div className="flex items-center justify-center w-full h-full">
                        <span className="text-lg font-bold opacity-20">
                          {record.title.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    }
                  />
                </div>

                {/* 信息 */}
                <div className="flex-1 min-w-0">
                  <h4 className="font-display text-white uppercase truncate">
                    {record.title}
                  </h4>
                  <div className="mt-1 flex items-center gap-2">
                    <span
                      className="neo-badge-accent text-[10px]"
                      style={{
                        background:
                          record.category === "movie"
                            ? "var(--accent)"
                            : "var(--accent-deep)",
                      }}
                    >
                      {record.category === "movie" ? "MOV" : "TVS"}
                    </span>
                    <span className="neo-badge text-[10px] text-[var(--muted)]">
                      {getSourceLabel(record)}
                    </span>
                    <span className="text-[10px] text-[var(--muted)]">
                      {formatDate(record.doubanDate)}
                    </span>
                  </div>
                </div>

                {/* 转换按钮 */}
                <button
                  onClick={() => handleConvert(record)}
                  disabled={converting === record.id}
                  className="brutal-btn px-4 py-2 text-xs"
                >
                  {converting === record.id
                    ? t("tools.convert.converting")
                    : record.category === "movie"
                    ? t("tools.convert.to_tv")
                    : t("tools.convert.to_movie")}
                </button>
              </div>
            ))}
          </div>

          {/* 无结果 */}
          {!searching && results.length === 0 && query.trim() && !error && (
            <div className="mt-4 p-8 text-center text-[10px] uppercase tracking-widest text-[var(--muted)]">
              {t("tools.convert.no_results")}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: 提交**

```bash
cd /Users/zaynzhu/code/claude\ code/project/pixelreel
git add frontend/src/pages/ToolsPage.tsx
git commit -m "feat: 创建 ToolsPage 组件"
```

---

### Task 4: 注册路由和导航

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/AppShell.tsx`

- [ ] **Step 1: 在 App.tsx 中添加路由**

在 `frontend/src/App.tsx` 的 `<Route>` 列表中添加：

```tsx
<Route path="/tools" element={<ToolsPage />} />
```

需要在文件顶部添加 import：

```tsx
import ToolsPage from "./pages/ToolsPage";
```

- [ ] **Step 2: 在 AppShell.tsx 中添加导航**

在 `frontend/src/components/AppShell.tsx` 的 `NAV_ITEMS` 数组中，在 `/settings` 之前添加：

```tsx
{ to: "/tools", labelKey: "nav.tools" as const },
```

- [ ] **Step 3: 提交**

```bash
cd /Users/zaynzhu/code/claude\ code/project/pixelreel
git add frontend/src/App.tsx frontend/src/components/AppShell.tsx
git commit -m "feat: 注册工具页面路由和导航"
```

---

## 验证清单

1. ✅ 页面可访问 `/tools`
2. ✅ 搜索功能正常工作
3. ✅ 搜索结果显示正确的记录信息（标题、类型、来源、日期）
4. ✅ 点击转换按钮后，记录类型正确变更
5. ✅ 转换前自动备份数据到 `temp/`
6. ✅ 转换成功后显示新记录 ID
7. ✅ i18n 中英文正常显示
8. ✅ 导航菜单中显示"工具"入口
