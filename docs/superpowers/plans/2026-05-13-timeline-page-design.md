# Timeline Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/timeline` page that displays all library records as a chronological poster wall with monthly grouping, floating stats bar, year filter, and read-only detail popup.

**Architecture:** Reuse `libraryStore` for data fetching, compute all grouping/stats client-side with `useMemo`, split UI into `TimelinePage` (layout + data) and `TimelinePopup` (modal detail card). Follow existing cyberpunk styling patterns from `LibraryPage` and `DashboardPage`.

**Tech Stack:** React 18, TailwindCSS, Zustand, React Router

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `frontend/src/stores/i18nStore.ts` | Modify | Add timeline i18n keys (EN + ZH) |
| `frontend/src/App.tsx` | Modify | Register `/timeline` route |
| `frontend/src/components/AppShell.tsx` | Modify | Add TIMELINE nav link |
| `frontend/src/components/TimelinePopup.tsx` | Create | Read-only detail modal (poster, title, tags, rating, review, added date) |
| `frontend/src/pages/TimelinePage.tsx` | Create | Main page: stats bar, year switcher, monthly poster grid |

---

## Task 1: Add Timeline i18n Keys

**Files:**
- Modify: `frontend/src/stores/i18nStore.ts`

- [ ] **Step 1: Add EN timeline keys**

In `dictionaries.en`, add after `"global.sort.az": "A-Z"`:

```typescript
    // Timeline
    "timeline.title": "TIMELINE",
    "timeline.entries": "entries",
    "timeline.avg": "avg",
    "timeline.peak": "peak",
    "timeline.done": "done",
    "timeline.items": "items",
    "timeline.all": "ALL",
    "timeline.added": "Added",
```

- [ ] **Step 2: Add ZH timeline keys**

In `dictionaries.zh`, add after `"global.sort.az": "A-Z"`:

```typescript
    // Timeline
    "timeline.title": "时间线",
    "timeline.entries": "条记录",
    "timeline.avg": "平均",
    "timeline.peak": "最高",
    "timeline.done": "完成",
    "timeline.items": "条",
    "timeline.all": "全部",
    "timeline.added": "添加于",
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/stores/i18nStore.ts
git commit -m "i18n: add timeline page keys (en/zh)"
```

---

## Task 2: Register Route and Navigation

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/AppShell.tsx`

- [ ] **Step 1: Add `/timeline` route in App.tsx**

Import at top:
```typescript
import TimelinePage from "./pages/TimelinePage";
```

Add route inside the `AppShell` layout route (after `library`):
```typescript
          <Route path="timeline" element={<TimelinePage />} />
```

Full relevant section:
```typescript
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="movies/search" element={<MovieSearch />} />
          <Route path="games/search" element={<GameSearch />} />
          <Route path="tv-shows/search" element={<TvShowSearch />} />
          <Route path="library" element={<LibraryPage />} />
          <Route path="timeline" element={<TimelinePage />} />
        </Route>
```

- [ ] **Step 2: Add nav link in AppShell.tsx**

Add to `NAV_ITEMS` array (after library):
```typescript
    { to: "/timeline", label: t("timeline.title") },
```

Full `NAV_ITEMS`:
```typescript
  const NAV_ITEMS = [
    { to: "/", label: t("nav.overview") },
    { to: "/movies/search", label: t("nav.movies") },
    { to: "/games/search", label: t("nav.games") },
    { to: "/tv-shows/search", label: t("nav.tv") },
    { to: "/library", label: t("nav.library") },
    { to: "/timeline", label: t("timeline.title") },
  ];
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/AppShell.tsx
git commit -m "feat(timeline): add /timeline route and nav link"
```

---

## Task 3: Create TimelinePopup Component

**Files:**
- Create: `frontend/src/components/TimelinePopup.tsx`

- [ ] **Step 1: Write TimelinePopup.tsx**

```typescript
import { useEffect } from "react";
import type { LibraryRecord, RecordStatus } from "../types/library";
import { useI18nStore } from "../stores/i18nStore";

interface TimelinePopupProps {
  record: LibraryRecord | null;
  onClose: () => void;
}

export default function TimelinePopup({ record, onClose }: TimelinePopupProps) {
  const { t } = useI18nStore();

  useEffect(() => {
    if (!record) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [record, onClose]);

  if (!record) return null;

  const formatDate = (value?: string | null) => {
    if (!value) return "NULL_DATE";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "NULL_DATE" : d.toISOString().split("T")[0];
  };

  const statusLabel = (status: RecordStatus) => {
    switch (status) {
      case "WANT": return t("global.status.want");
      case "IN_PROGRESS": return t("global.status.active");
      case "DONE": return t("global.status.done");
      default: return t("global.status.unset");
    }
  };

  const categoryBadge = (cat: string) => {
    switch (cat) {
      case "movie": return { label: "MOV", color: "#d4ff00" };
      case "tv_show": return { label: "TV", color: "#ff4400" };
      case "game": return { label: "GAM", color: "#8888ff" };
      default: return { label: cat.toUpperCase(), color: "#d4ff00" };
    }
  };

  const badge = categoryBadge(record.category);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative mx-4 flex max-w-[420px] overflow-hidden border border-[var(--line)] bg-[var(--surface)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left: Poster */}
        <div className="w-[120px] shrink-0">
          <div className="aspect-[2/3] bg-gradient-to-br from-[#1a1a2e] to-[#16213e] relative">
            {record.posterUrl ? (
              <img
                src={record.posterUrl}
                alt={record.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-[10px] font-bold uppercase tracking-widest text-[var(--line)]">
                NO_IMG
              </div>
            )}
            <div
              className="absolute top-2 left-2 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider"
              style={{
                background: `${badge.color}33`,
                border: `1px solid ${badge.color}4d`,
                color: badge.color,
              }}
            >
              {badge.label}
            </div>
          </div>
        </div>

        {/* Right: Info */}
        <div className="flex flex-1 flex-col gap-3 p-4">
          <h3 className="font-display text-sm font-bold uppercase text-white leading-tight">
            {record.title}
          </h3>

          <div className="flex flex-wrap items-center gap-2">
            <span className="neo-badge text-[10px]">{record.sourceLabel}</span>
            <span className="neo-badge text-[10px]">{statusLabel(record.status)}</span>
          </div>

          {record.rating != null && (
            <div className="flex items-baseline gap-1">
              <span className="font-display text-2xl font-bold" style={{ color: "var(--accent)" }}>
                {record.rating}
              </span>
              <span className="text-[10px] text-[var(--muted)]">/ 10</span>
            </div>
          )}

          {record.shortReview?.trim() && (
            <p className="text-[10px] leading-relaxed text-[var(--muted)] uppercase">
              {record.shortReview.trim()}
            </p>
          )}

          <p className="mt-auto text-[8px] uppercase tracking-widest text-[var(--dim)]">
            {t("timeline.added")} {formatDate(record.createdAt)}
          </p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/TimelinePopup.tsx
git commit -m "feat(timeline): add TimelinePopup detail modal component"
```

---

## Task 4: Create TimelinePage Component

**Files:**
- Create: `frontend/src/pages/TimelinePage.tsx`

- [ ] **Step 1: Write TimelinePage.tsx imports and types**

```typescript
import { useEffect, useMemo, useState } from "react";
import { useLibraryStore } from "../stores/libraryStore";
import { useI18nStore } from "../stores/i18nStore";
import type { LibraryRecord, LibraryCategory, RecordStatus } from "../types/library";
import TimelinePopup from "../components/TimelinePopup";

type YearFilter = number | "ALL";

interface MonthGroup {
  key: string; // "2025-03"
  year: number;
  month: number;
  label: string; // "MAR 2025"
  records: LibraryRecord[];
}
```

- [ ] **Step 2: Add helper functions**

After imports, add:

```typescript
function getYear(dateStr: string): number {
  return new Date(dateStr).getFullYear();
}

function getYearMonth(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [year, month] = key.split("-");
  const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  return `${monthNames[parseInt(month, 10) - 1]} ${year}`;
}

function statusLabel(status: RecordStatus, t: (key: string) => string): string {
  switch (status) {
    case "WANT": return t("global.status.want");
    case "IN_PROGRESS": return t("global.status.active");
    case "DONE": return t("global.status.done");
    default: return t("global.status.unset");
  }
}

function categoryBadge(cat: LibraryCategory) {
  switch (cat) {
    case "movie": return { label: "MOV", bg: "rgba(212,255,0,0.2)", border: "rgba(212,255,0,0.3)", text: "#d4ff00" };
    case "tv_show": return { label: "TV", bg: "rgba(255,68,0,0.2)", border: "rgba(255,68,0,0.3)", text: "#ff4400" };
    case "game": return { label: "GAM", bg: "rgba(100,100,255,0.2)", border: "rgba(100,100,255,0.3)", text: "#8888ff" };
  }
}

function computeStats(records: LibraryRecord[]) {
  const total = records.length;
  const rated = records.filter((r) => r.rating != null);
  const avgRating = rated.length > 0 ? (rated.reduce((s, r) => s + r.rating!, 0) / rated.length).toFixed(1) : null;
  const peakRating = rated.length > 0 ? Math.max(...rated.map((r) => r.rating!)) : null;
  const doneCount = records.filter((r) => r.status === "DONE").length;
  const completionRate = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  return { total, avgRating, peakRating, completionRate };
}

function computeMonthStats(records: LibraryRecord[]) {
  const rated = records.filter((r) => r.rating != null);
  const avg = rated.length > 0 ? (rated.reduce((s, r) => s + r.rating!, 0) / rated.length).toFixed(1) : null;
  return { count: records.length, avg };
}
```

- [ ] **Step 3: Add TimelinePage component body**

```typescript
export default function TimelinePage() {
  const { records, loading, error, fetchRecords } = useLibraryStore();
  const { t } = useI18nStore();
  const [selectedYear, setSelectedYear] = useState<YearFilter>("ALL");
  const [popupRecord, setPopupRecord] = useState<LibraryRecord | null>(null);

  useEffect(() => {
    void fetchRecords();
  }, [fetchRecords]);

  const years = useMemo(() => {
    const ys = [...new Set(records.map((r) => getYear(r.createdAt)))].sort((a, b) => b - a);
    return ys;
  }, [records]);

  const filteredRecords = useMemo(() => {
    if (selectedYear === "ALL") return records;
    return records.filter((r) => getYear(r.createdAt) === selectedYear);
  }, [records, selectedYear]);

  const stats = useMemo(() => computeStats(filteredRecords), [filteredRecords]);

  const monthGroups = useMemo((): MonthGroup[] => {
    const map = new Map<string, LibraryRecord[]>();
    for (const record of filteredRecords) {
      const key = getYearMonth(record.createdAt);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(record);
    }
    const groups: MonthGroup[] = [];
    for (const [key, recs] of map.entries()) {
      const [yearStr, monthStr] = key.split("-");
      groups.push({
        key,
        year: parseInt(yearStr, 10),
        month: parseInt(monthStr, 10),
        label: monthLabel(key),
        records: recs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      });
    }
    return groups.sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    });
  }, [filteredRecords]);

  return (
    <div>
      {/* Floating Stats Bar */}
      <div
        className="sticky top-0 z-40 border-b border-[var(--line)] px-4 py-3 sm:px-6"
        style={{ background: "rgba(5,5,5,0.92)", backdropFilter: "blur(8px)" }}
      >
        <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--accent)]">
              {t("timeline.title")}
            </span>

            <div className="hidden h-4 w-px bg-[var(--line)] sm:block" />

            <StatItem label={t("timeline.entries")} value={stats.total} accent />
            <Divider />
            <StatItem
              label={t("timeline.avg")}
              value={stats.avgRating != null ? `${stats.avgRating} / 10` : "—"}
            />
            <Divider />
            <StatItem
              label={t("timeline.peak")}
              value={stats.peakRating != null ? stats.peakRating : "—"}
              deep
            />
            <Divider />
            <StatItem
              label={t("timeline.done")}
              value={`${stats.completionRate}%`}
            />
          </div>

          {/* Year Switcher */}
          <div className="flex flex-wrap gap-1.5">
            <YearPill
              label={t("timeline.all")}
              active={selectedYear === "ALL"}
              onClick={() => setSelectedYear("ALL")}
            />
            {years.map((year) => (
              <YearPill
                key={year}
                label={String(year)}
                active={selectedYear === year}
                onClick={() => setSelectedYear(year)}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Monthly Sections */}
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {error && (
          <div className="border-l-4 border-red-500 bg-red-500/10 px-4 py-3 text-xs text-red-400 font-bold uppercase">
            [ERR] {error}
          </div>
        )}

        {loading && records.length === 0 && (
          <div className="border border-dashed border-[var(--line)] px-5 py-8 text-center text-[10px] uppercase tracking-widest text-[var(--muted)]">
            FETCHING TELEMETRY...
          </div>
        )}

        {!loading && monthGroups.length === 0 && (
          <div className="border border-dashed border-[var(--line)] px-5 py-8 text-center text-[10px] uppercase tracking-widest text-[var(--muted)]">
            NO_DATA_AVAILABLE
          </div>
        )}

        <div className="space-y-8">
          {monthGroups.map((group) => {
            const mStats = computeMonthStats(group.records);
            return (
              <section key={group.key}>
                {/* Month Header */}
                <div className="mb-3 flex items-center gap-3">
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
                    {group.label}
                  </span>
                  <span className="text-[9px] text-[var(--dim)]">
                    {mStats.count} {t("timeline.items")}
                  </span>
                  {mStats.avg != null && (
                    <span className="text-[9px] text-[var(--dim)]">
                      {t("timeline.avg")} {mStats.avg}
                    </span>
                  )}
                  <div className="h-px flex-1 bg-[var(--line)] opacity-40" />
                </div>

                {/* Poster Grid */}
                <div className="grid grid-cols-3 gap-1 sm:grid-cols-5 lg:grid-cols-8 lg:gap-1">
                  {group.records.map((record) => (
                    <PosterCard
                      key={`${record.category}:${record.id}`}
                      record={record}
                      onClick={() => setPopupRecord(record)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <TimelinePopup record={popupRecord} onClose={() => setPopupRecord(null)} />
    </div>
  );
}
```

- [ ] **Step 4: Add sub-components**

Append to the same file after `TimelinePage`:

```typescript
function StatItem({
  label,
  value,
  accent = false,
  deep = false,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
  deep?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px] uppercase tracking-widest text-[var(--muted)]">{label}</span>
      <span
        className="text-xs font-bold"
        style={{
          color: deep ? "var(--accent-deep)" : accent ? "var(--accent)" : "white",
        }}
      >
        {value}
      </span>
    </div>
  );
}

function Divider() {
  return <span className="hidden text-[var(--line)] sm:inline">|</span>;
}

function YearPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider transition-all ${
        active
          ? "border border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]"
          : "border border-[var(--line)] bg-[var(--surface-hover)] text-[var(--muted)] hover:text-white hover:border-white"
      }`}
    >
      {label}
    </button>
  );
}

function PosterCard({ record, onClick }: { record: LibraryRecord; onClick: () => void }) {
  const badge = categoryBadge(record.category);
  const hasRating = record.rating != null;

  return (
    <button
      onClick={onClick}
      className="group relative aspect-[2/3] overflow-hidden border border-[var(--line)] bg-gradient-to-br from-[#1a1a2e] to-[#16213e] transition-colors hover:border-[rgba(212,255,0,0.4)]"
    >
      {/* Poster Image */}
      {record.posterUrl ? (
        <img
          src={record.posterUrl}
          alt={record.title}
          className={`h-full w-full object-cover transition-all duration-300 ${
            hasRating ? "opacity-90" : "opacity-80 mix-blend-luminosity"
          } group-hover:opacity-100 group-hover:mix-blend-normal`}
        />
      ) : (
        <div className="flex h-full items-center justify-center p-2 text-[8px] font-bold uppercase tracking-widest text-[var(--line)]">
          NO_IMG
        </div>
      )}

      {/* Scanline overlay */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0)_50%,rgba(0,0,0,0.25)_50%)] bg-[length:100%_4px] opacity-50" />

      {/* Category Badge */}
      <div
        className="absolute top-1 left-1 px-1 py-0.5 text-[6px] font-bold uppercase tracking-wider sm:text-[7px]"
        style={{
          background: badge.bg,
          border: `1px solid ${badge.border}`,
          color: badge.text,
        }}
      >
        {badge.label}
      </div>

      {/* Rating Overlay */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[rgba(0,0,0,0.9)] to-transparent px-2 pb-2 pt-6">
        <p className="truncate text-[7px] font-bold uppercase tracking-wide text-white sm:text-[8px]">
          {record.title}
        </p>
        {hasRating && (
          <p className="mt-0.5 text-[8px] font-bold sm:text-[9px]" style={{ color: "var(--accent)" }}>
            {record.rating}
          </p>
        )}
      </div>
    </button>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/TimelinePage.tsx
git commit -m "feat(timeline): add TimelinePage with stats bar, year filter, monthly grid"
```

---

## Task 5: Manual Verification

- [ ] **Step 1: Start dev server and navigate to `/timeline`**

Run in terminal:
```bash
cd frontend && npm run dev
```

Open browser to `http://localhost:18888/timeline`.

- [ ] **Step 2: Verify stats bar**

Check: TIMELINE label visible, 4 stat items display correct numbers, year pills present.

- [ ] **Step 3: Verify year filter**

Click a year pill — grid should update to show only that year's records, stats should recalculate. Click ALL — returns to full view.

- [ ] **Step 4: Verify monthly grouping**

Months sorted newest-first. Each month header shows label, item count, average rating. Months with 0 items are not shown.

- [ ] **Step 5: Verify poster grid**

3/5/8 columns at mobile/tablet/desktop breakpoints. Category badges (MOV/TV/GAM) with correct colors. Rating shown when present. Hover changes border. Scanline overlay present.

- [ ] **Step 6: Verify detail popup**

Click any poster — popup appears with poster, title, source badge, status badge, rating, review text, added date. Click backdrop or press Escape — closes. No edit capability.

- [ ] **Step 7: Verify i18n**

Toggle EN/ZH — all timeline labels switch correctly.

---

## Self-Review Checklist

1. **Spec coverage:**
   - [x] Floating stats bar with blur backdrop — Task 4
   - [x] 4 stat items (total, avg, peak, completion) — Task 4
   - [x] Year switcher with ALL option — Task 4
   - [x] Monthly sections, newest-first, skip empty — Task 4
   - [x] 8-column responsive grid — Task 4
   - [x] Poster card with aspect ratio, badge, rating overlay, hover, scanline — Task 4
   - [x] Detail popup with poster, title, tags, rating, review, date — Task 3
   - [x] Escape/click to close, read-only — Task 3
   - [x] i18n keys (EN+ZH) — Task 1
   - [x] Route `/timeline` — Task 2
   - [x] Nav link in AppShell — Task 2
   - [x] Reuse libraryStore — Task 4
   - [x] Client-side grouping/stats — Task 4

2. **Placeholder scan:** No TBD, TODO, "implement later", or vague instructions found.

3. **Type consistency:** `LibraryRecord` fields match `types/library.ts`. `categoryBadge` handles all 3 categories. `statusLabel` handles all 4 statuses. No mismatched function names.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-13-timeline-page-design.md`. Two execution options:

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?