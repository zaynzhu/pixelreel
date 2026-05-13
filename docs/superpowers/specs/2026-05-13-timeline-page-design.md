# Timeline Page Design

## Overview

A new `/timeline` page for PixelReel that displays all media records (movies, TV shows, games) as a poster wall organized by month, with a floating statistics bar at the top. The page provides a visual, chronological view of the user's media consumption.

## Confirmed Decisions

| Decision | Choice |
|----------|--------|
| Page type | New page at `/timeline` |
| Date field | `createdAt` (when record was added to DB) |
| Category display | Mixed — movies, TV shows, games in same grid |
| Data aggregation | Client-side (fetch full library, group/compute in browser) |
| Click behavior | Popup detail card |
| Layout style | Poster wall + floating stats bar |

## Layout Structure

### 1. Floating Stats Bar (sticky top)

A sticky bar at the top of the page with `backdrop-filter: blur(8px)` and semi-transparent background (`rgba(5,5,5,0.92)`).

**Contents (left to right):**
- Section label: `TIMELINE` (accent color, uppercase)
- 4 stat inline items separated by `|` dividers:
  - **Total entries** — count, accent color
  - **Average rating** — X.X / 10
  - **Peak score** — highest rated item, accent-deep color
  - **Completion rate** — percentage of DONE items
- **Year switcher** (right-aligned) — pill buttons for each year present in data + `ALL` option. Active year highlighted with accent border/bg.

Stats update dynamically when switching years.

### 2. Monthly Sections

Each month is a distinct section. Months are sorted newest-first.

**Month header row:**
- Month label (e.g. `MAR 2025`) — uppercase, 10px, muted color, letter-spacing 2px
- Item count (e.g. `6 items`) — 9px, dim color
- Average rating (e.g. `avg 8.2`) — 9px, dim color
- Extending thin line to the right edge

**Empty months:** Skip months with 0 items — do not show empty sections.

### 3. Poster Grid

8-column responsive grid (`grid-template-columns: repeat(8, 1fr)`) with 4px gap.

**Each poster card:**
- Aspect ratio: 2/3
- Background: gradient placeholder (`#1a1a2e` → `#16213e`) when no poster image, or actual `posterUrl` image
- **Category badge** (top-left, 6px): `MOV` (accent), `TV` (accent-deep), `GAM` (blue-purple)
- **Rating overlay** (bottom): gradient fade from transparent to `rgba(0,0,0,0.9)`, showing title (7px, single-line ellipsis) and rating (8px, accent bold)
- **Hover effect**: border color transitions to `rgba(212,255,0,0.4)`
- **Scanline overlay**: same CRT scanline effect as existing poster cards
- **No rating items**: show title only, no rating number. Use `mix-blend-luminosity` at 80% opacity (matching library page style)

**Responsive breakpoints:**
- Desktop (≥1280px): 8 columns
- Tablet (≥768px): 5 columns
- Mobile (<768px): 3 columns

### 4. Detail Popup (on poster click)

A modal overlay (dark backdrop) with a centered card.

**Card layout** (horizontal, max-width 420px):
- **Left**: Poster image (120px wide, 2:3 aspect), category badge
- **Right**:
  - Title (14px, bold)
  - Tags row: source badge (TMDB/Steam/etc.) + status badge (DONE/WANT/etc.)
  - Rating: large display (24px, accent) with "/ 10" suffix
  - Short review text (10px, muted, multi-line)
  - Added date (8px, dim): `Added YYYY-MM-DD`

**Interactions:**
- Click backdrop or press Escape to close
- No editing capability — pure read-only display (editing stays in Library page)

## Data Flow

### Store

Reuse existing `libraryStore`. The timeline page calls `fetchRecords()` on mount (same as LibraryPage).

### Client-side Processing

```typescript
// Pseudocode for timeline data preparation
const records = useLibraryStore(s => s.records);

// 1. Extract available years from createdAt
const years = [...new Set(records.map(r => new Date(r.createdAt).getFullYear()))].sort();

// 2. Filter by selected year (or all)
const filtered = selectedYear === 'ALL'
  ? records
  : records.filter(r => new Date(r.createdAt).getFullYear() === selectedYear);

// 3. Group by year-month
const grouped = groupBy(filtered, r => {
  const d = new Date(r.createdAt);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
});
// Sort groups descending (newest month first)

// 4. Compute stats
const totalItems = filtered.length;
const ratedItems = filtered.filter(r => r.rating != null);
const avgRating = ratedItems.length > 0
  ? (ratedItems.reduce((s, r) => s + r.rating!, 0) / ratedItems.length).toFixed(1)
  : null;
const peakRating = ratedItems.length > 0
  ? Math.max(...ratedItems.map(r => r.rating!))
  : null;
const doneCount = filtered.filter(r => r.status === 'DONE').length;
const completionRate = totalItems > 0
  ? Math.round((doneCount / totalItems) * 100)
  : 0;

// 5. Per-month stats (for month header)
const monthStats = monthRecords => ({
  count: monthRecords.length,
  avg: monthRecords.filter(r => r.rating).length > 0
    ? (monthRecords.filter(r => r.rating).reduce((s, r) => s + r.rating!, 0)
       / monthRecords.filter(r => r.rating).length).toFixed(1)
    : null
});
```

### Category Badge Colors

| Category | Label | Background | Text |
|----------|-------|------------|------|
| movie | MOV | `rgba(212,255,0,0.2)` border `rgba(212,255,0,0.3)` | `#d4ff00` |
| tv_show | TV | `rgba(255,68,0,0.2)` border `rgba(255,68,0,0.3)` | `#ff4400` |
| game | GAM | `rgba(100,100,255,0.2)` border `rgba(100,100,255,0.3)` | `#8888ff` |

## Route & Navigation

- Route: `/timeline`
- Add to router in `App.tsx`
- Add nav link in `AppShell` sidebar (alongside Dashboard, Library, Search pages)
- i18n keys needed for all UI strings (EN + ZH)

## i18n Keys

| Key | EN | ZH |
|-----|----|----|
| `timeline.title` | TIMELINE | 时间线 |
| `timeline.entries` | entries | 条记录 |
| `timeline.avg` | avg | 平均 |
| `timeline.peak` | peak | 最高 |
| `timeline.done` | done | 完成 |
| `timeline.items` | items | 条 |
| `timeline.all` | ALL | 全部 |
| `timeline.added` | Added | 添加于 |

## Files to Create/Modify

| File | Action |
|------|--------|
| `frontend/src/pages/TimelinePage.tsx` | **Create** — main page component |
| `frontend/src/components/TimelinePopup.tsx` | **Create** — detail popup component |
| `frontend/src/App.tsx` | **Modify** — add `/timeline` route |
| `frontend/src/components/AppShell.tsx` | **Modify** — add nav link |
| `frontend/src/stores/i18nStore.ts` | **Modify** — add timeline i18n keys |

## Out of Scope

- Editing records from timeline (use Library page)
- Backend changes (all computation is client-side)
- Sorting options (always chronological)
- Filtering by category (mixed display only)
- Drag-and-drop reordering
- Poster upload from timeline
