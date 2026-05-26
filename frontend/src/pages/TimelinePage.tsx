import { useEffect, useMemo, useRef, useState } from "react";
import { useTimelineStore } from "../stores/timelineStore";
import { useTimelineDetailStore } from "../stores/timelineDetailStore";
import { useI18nStore } from "../stores/i18nStore";
import type { TimelineRecord } from "../types/timeline";
import type { LibraryRecord, LibraryCategory, RecordStatus } from "../types/library";
import TimelinePopup from "../components/TimelinePopup";
import { StarRating } from "../components/StarRating";
import { proxiedImageUrl } from "../imageProxy";

type YearFilter = number | "ALL";
type CategoryFilter = "media" | "game" | "all";

interface MonthGroup {
  key: string; // "2025-03"
  year: number;
  month: number;
  labelMonth: string; // "MAR"
  labelYear: string;  // "2025"
  records: TimelineRecord[];
}

function getYear(dateStr: string): number {
  return new Date(dateStr).getFullYear();
}

function getYearMonth(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabelParts(key: string): { month: string; year: string } {
  const [year, month] = key.split("-");
  const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  return {
    month: monthNames[parseInt(month, 10) - 1],
    year,
  };
}

function categoryBadge(cat: LibraryCategory) {
  switch (cat) {
    case "movie": return { label: "MOV", color: "var(--accent)" };
    case "tv_show": return { label: "TV", color: "var(--accent-deep)" };
    case "game": return { label: "GAM", color: "#8888ff" };
  }
}

function statusBadge(status: RecordStatus, t: ReturnType<typeof useI18nStore.getState>['t']) {
  switch (status) {
    case "WANT": return t("global.status.want");
    case "IN_PROGRESS": return t("global.status.active");
    case "DONE": return t("global.status.done");
    default: return t("global.status.unset");
  }
}

function computeStats(records: TimelineRecord[]) {
  const total = records.length;
  const rated = records.filter((r) => r.rating != null);
  const avgRating = rated.length > 0 ? (rated.reduce((s, r) => s + r.rating!, 0) / rated.length).toFixed(1) : null;
  const peakRating = rated.length > 0 ? Math.max(...rated.map((r) => r.rating!)) : null;
  const doneCount = records.filter((r) => r.status === "DONE").length;
  const completionRate = total > 0 ? Math.round((doneCount / total) * 100) : 0;
  return { total, avgRating, peakRating, completionRate };
}

function computeMonthStats(records: TimelineRecord[]) {
  const rated = records.filter((r) => r.rating != null);
  const avg = rated.length > 0 ? (rated.reduce((s, r) => s + r.rating!, 0) / rated.length).toFixed(1) : null;
  return { count: records.length, avg };
}

export default function TimelinePage() {
  const { records, nextCursor, loading, loadingMore, error, years, yearsError, fetchRecords, fetchMore, fetchYears } = useTimelineStore();
  const { fetchDetail, cache: detailCache, loading: detailLoading, errors: detailErrors } = useTimelineDetailStore();
  const { t } = useI18nStore();
  const [selectedYear, setSelectedYear] = useState<YearFilter>("ALL");
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>("media");
  const [popupRecord, setPopupRecord] = useState<TimelineRecord | null>(null);

  const INITIAL_VISIBLE_GROUPS = 8;
  const GROUP_INCREMENT = 4;
  const [visibleGroupCount, setVisibleGroupCount] = useState(INITIAL_VISIBLE_GROUPS);

  // Fetch new records when category changes
  useEffect(() => {
    void fetchRecords({
      limit: 96,
      category: selectedCategory,
      year: selectedYear,
    });
    void fetchYears(selectedCategory);
    setVisibleGroupCount(INITIAL_VISIBLE_GROUPS);
  }, [selectedCategory]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch new records when year changes
  useEffect(() => {
    void fetchRecords({
      limit: 96,
      category: selectedCategory,
      year: selectedYear,
    });
    setVisibleGroupCount(INITIAL_VISIBLE_GROUPS);
  }, [selectedYear]); // eslint-disable-line react-hooks/exhaustive-deps

  const sentinelRef = useRef<HTMLDivElement>(null);
  const groupSentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !nextCursor) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && nextCursor && !loadingMore) {
          void fetchMore();
        }
      },
      { rootMargin: '1200px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [nextCursor, loadingMore, fetchMore]);

  // Server-side filtering handles category and year
  const yearOptions = useMemo(() => {
    if (years.length > 0) return years;
    return [...new Set(records.map((r) => getYear(r.createdAt)))].sort((a, b) => b - a);
  }, [years, records]);

  // 切换分类后，如果已选年份不在新列表里，重置为 ALL
  useEffect(() => {
    if (selectedYear !== "ALL" && !yearOptions.includes(selectedYear)) {
      setSelectedYear("ALL");
    }
  }, [yearOptions, selectedYear]);

  const stats = useMemo(() => computeStats(records), [records]);

  const monthGroups = useMemo((): MonthGroup[] => {
    const map = new Map<string, TimelineRecord[]>();
    for (const record of records) {
      const key = getYearMonth(record.createdAt);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(record);
    }
    const groups: MonthGroup[] = [];
    for (const [key, recs] of map.entries()) {
      const [yearStr, monthStr] = key.split("-");
      const parts = monthLabelParts(key);
      groups.push({
        key,
        year: parseInt(yearStr, 10),
        month: parseInt(monthStr, 10),
        labelMonth: parts.month,
        labelYear: parts.year,
        records: recs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      });
    }
    return groups.sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.month - a.month;
    });
  }, [records]);

  // Group expansion sentinel — reveal more month groups as user scrolls
  useEffect(() => {
    const sentinel = groupSentinelRef.current;
    if (!sentinel) return;
    const monthCount = monthGroups.length;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingMore) {
          setVisibleGroupCount((count) => Math.min(count + GROUP_INCREMENT, monthCount));
        }
      },
      { rootMargin: '800px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [visibleGroupCount, loadingMore, monthGroups.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative min-h-screen bg-black bg-[var(--page-bg)] overflow-hidden font-['JetBrains_Mono',monospace]">
      {/* Floating Filter Menu (Top Right) */}
      <div className="absolute top-8 right-8 z-50 hidden md:flex flex-col items-end gap-2">
        <div className="text-[10px] font-bold text-[var(--accent)] tracking-[0.2em] mb-2 uppercase">
          [ CATEGORY ]
        </div>
        <CategoryFilterBtn active={selectedCategory === "media"} onClick={() => setSelectedCategory("media")}>
          MOVIE + TV
        </CategoryFilterBtn>
        <CategoryFilterBtn active={selectedCategory === "game"} onClick={() => setSelectedCategory("game")}>
          GAMES
        </CategoryFilterBtn>
        <CategoryFilterBtn active={selectedCategory === "all"} onClick={() => setSelectedCategory("all")}>
          ALL
        </CategoryFilterBtn>

        <div className="text-[10px] font-bold text-[var(--accent)] tracking-[0.2em] mt-4 mb-2 uppercase">
          [ YEAR ]
        </div>
        {yearsError && (
          <div className="text-[9px] text-red-400 mb-1 uppercase tracking-widest">{yearsError}</div>
        )}
        <YearFilterBtn active={selectedYear === "ALL"} onClick={() => setSelectedYear("ALL")}>
          ALL_TIME
        </YearFilterBtn>
        {yearOptions.map((y) => (
          <YearFilterBtn key={y} active={selectedYear === y} onClick={() => setSelectedYear(y)}>
            {y}
          </YearFilterBtn>
        ))}
      </div>

      {/* Main Container */}
      <div className="mx-auto max-w-[90rem] pl-12 pr-6 sm:pl-32 sm:pr-12 py-24 sm:py-32 relative z-10">
        
        {/* The Timeline Axis */}
        <div className="absolute top-0 bottom-0 left-6 sm:left-16 w-px bg-gradient-to-b from-[var(--line)] via-[rgba(212,255,0,0.2)] to-transparent" />

        {/* Global Loading / Error */}
        {error && (
          <div className="border border-red-500/50 bg-red-500/10 p-4 mb-8 text-[10px] text-red-400 uppercase tracking-widest font-bold w-fit flex items-center gap-3">
            <span className="animate-pulse">_ERR</span> 
            {error}
          </div>
        )}
        {loading && records.length === 0 && (
          <div className="border border-[var(--line)] p-8 mb-8 text-center text-[10px] text-[var(--accent)] uppercase tracking-[0.3em] font-bold relative overflow-hidden group w-fit mx-auto">
            <div className="absolute inset-0 bg-[var(--accent)]/10 animate-pulse" />
            <span className="relative z-10">FETCHING_TELEMETRY...</span>
          </div>
        )}
        {!loading && monthGroups.length === 0 && (
          <div className="text-[10px] text-[var(--muted)] uppercase tracking-widest p-8">
            NO_DATA_AVAILABLE
          </div>
        )}

        {/* Month Groups */}
        <div className="space-y-16 sm:space-y-24 pb-24">
          {monthGroups.slice(0, visibleGroupCount).map((group, groupIndex) => {
            const mStats = computeMonthStats(group.records);
            return (
              <section key={group.key} className="relative">
                {/* Glowing Axis Node */}
                <div className="absolute top-10 -left-[1.8rem] sm:-left-[4.35rem] w-3 h-3 sm:w-4 sm:h-4 rounded-full border-2 border-[var(--page-bg)] bg-[var(--accent)] shadow-[0_0_15px_var(--accent)] z-20" />
                
                {/* Connection line from node to header */}
                <div className="absolute top-11 -left-[1.5rem] sm:-left-[4rem] w-6 sm:w-12 h-px bg-[var(--accent)]/50 z-10 hidden sm:block" />

                {/* Cinematic Watermark (Background) */}
                <div className="pointer-events-none absolute -top-16 sm:-top-24 -left-8 text-[6rem] sm:text-[14rem] font-display font-black leading-none text-white/[0.02] select-none tracking-tighter mix-blend-overlay">
                  {group.labelMonth}
                </div>

                {/* Section Header */}
                <div className="mb-8 flex flex-col sm:flex-row sm:items-baseline gap-2 sm:gap-6 relative z-10">
                  <div className="flex items-baseline gap-3">
                    <h2 className="text-4xl sm:text-7xl font-display font-bold text-white tracking-tight uppercase">
                      {group.labelMonth}
                    </h2>
                    <span className="text-2xl sm:text-4xl font-display text-[var(--accent)] font-bold">
                      {group.labelYear}
                    </span>
                  </div>
                  
                  {/* Tech Data Row */}
                  <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest font-bold text-[var(--muted)] mt-2 sm:mt-0 bg-[var(--surface)] border border-[var(--line)] px-3 py-1 w-fit">
                    <span className="text-white">SYS_STAT</span>
                    <span className="w-px h-3 bg-[var(--line)]" />
                    <span>{mStats.count} UNITS</span>
                    {mStats.avg && (
                      <>
                        <span className="w-px h-3 bg-[var(--line)]" />
                        <span>AVG <span className="text-[var(--accent)]">{mStats.avg}</span></span>
                      </>
                    )}
                  </div>
                </div>

                {/* Posters Grid */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7 relative z-10">
                  {group.records.map((record, idx) => (
                    <div 
                      key={record.id} 
                      className={`relative ${
                        idx === 0 ? "col-span-2 row-span-2 sm:col-span-2 sm:row-span-2" : ""
                      }`}
                    >
                      <PosterCard
                        record={record}
                        priority={groupIndex === 0 && idx < 10}
                        onClick={() => {
                          setPopupRecord(record);
                          void fetchDetail(record.category, record.id);
                        }}
                      />
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        {/* Group expansion sentinel */}
        {visibleGroupCount < monthGroups.length && (
          <div ref={groupSentinelRef} className="h-1" />
        )}

        {/* 无限滚动哨兵 */}
        {nextCursor && (
          <div ref={sentinelRef} className="h-1" />
        )}
        {loadingMore && (
          <div className="text-center text-[10px] text-[var(--muted)] uppercase tracking-widest py-8">
            LOADING_MORE...
          </div>
        )}
      </div>

      {/* Floating Stats Pill (Glassmorphism + Tech) */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[95%] sm:w-auto">
        <div className="flex flex-wrap sm:flex-nowrap items-center justify-center gap-4 sm:gap-8 rounded-full border border-white/10 bg-[rgba(5,5,5,0.7)] px-6 py-3 sm:px-10 sm:py-4 backdrop-blur-xl shadow-[0_20px_40px_rgba(0,0,0,0.8)] mx-auto">
          
          {/* Mobile Category Switcher */}
          <div className="md:hidden flex items-center border-r border-[var(--line)] pr-4 relative">
             <select
               className="bg-transparent text-[10px] text-[var(--accent)] uppercase font-bold outline-none tracking-widest appearance-none pr-4 w-full cursor-pointer"
               value={selectedCategory}
               onChange={(e) => setSelectedCategory(e.target.value as CategoryFilter)}
             >
               <option value="media">MOVIE+TV</option>
               <option value="game">GAMES</option>
               <option value="all">ALL</option>
             </select>
             <span className="absolute right-5 top-1/2 -translate-y-1/2 text-[8px] text-[var(--accent)] pointer-events-none">▼</span>
          </div>

          {/* Mobile Year Switcher */}
          <div className="md:hidden flex items-center border-r border-[var(--line)] pr-4 relative">
             <select
               className="bg-transparent text-[10px] text-[var(--accent)] uppercase font-bold outline-none tracking-widest appearance-none pr-4 w-full cursor-pointer"
               value={selectedYear}
               onChange={(e) => setSelectedYear(e.target.value === "ALL" ? "ALL" : parseInt(e.target.value, 10))}
             >
               <option value="ALL">ALL_TIME</option>
               {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
             </select>
             <span className="absolute right-5 top-1/2 -translate-y-1/2 text-[8px] text-[var(--accent)] pointer-events-none">▼</span>
          </div>

          <StatItem label="TOTAL_ENTRIES" value={stats.total} />
          <div className="w-1 h-1 rounded-full bg-[var(--accent)] opacity-50 hidden sm:block" />
          <StatItem label="AVG_RATING" value={stats.avgRating || "N/A"} highlight />
          <div className="w-1 h-1 rounded-full bg-[var(--accent)] opacity-50 hidden sm:block" />
          <StatItem label="PEAK_RATING" value={stats.peakRating || "N/A"} highlightDeep />
          <div className="w-1 h-1 rounded-full bg-[var(--accent)] opacity-50 hidden sm:block" />
          <StatItem label="COMPLETION" value={`${stats.completionRate}%`} />
        </div>
      </div>

      <TimelinePopup
        lightweightRecord={popupRecord}
        fullRecord={popupRecord ? detailCache[`${popupRecord.category}:${popupRecord.id}`] ?? null : null}
        loading={popupRecord ? detailLoading[`${popupRecord.category}:${popupRecord.id}`] ?? false : false}
        error={popupRecord ? detailErrors[`${popupRecord.category}:${popupRecord.id}`] ?? null : null}
        onClose={() => setPopupRecord(null)}
      />
    </div>
  );
}

function StatItem({ label, value, highlight, highlightDeep }: { label: string; value: string | number; highlight?: boolean; highlightDeep?: boolean }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
      <span className="text-[8px] sm:text-[9px] text-[var(--muted)] uppercase tracking-[0.2em]">{label}</span>
      <span 
        className="text-[11px] sm:text-xs font-bold font-display tracking-wider"
        style={{
          color: highlight ? "var(--accent)" : highlightDeep ? "var(--accent-deep)" : "white"
        }}
      >
        {value}
      </span>
    </div>
  );
}

function CategoryFilterBtn({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-[10px] font-bold tracking-widest uppercase transition-all duration-300 ${
        active
          ? "text-black text-[var(--page-bg)] bg-[var(--accent-deep)] px-3 py-1 scale-105 shadow-[0_0_10px_var(--accent-deep)]"
          : "text-[var(--muted)] hover:text-white px-3 py-1 hover:translate-x-[-4px]"
      }`}
    >
      {children}
    </button>
  );
}

function YearFilterBtn({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`text-[10px] font-bold tracking-widest uppercase transition-all duration-300 ${
        active 
          ? "text-black text-[var(--page-bg)] bg-[var(--accent)] px-3 py-1 scale-105 shadow-[0_0_10px_var(--accent)]" 
          : "text-[var(--muted)] hover:text-white px-3 py-1 hover:translate-x-[-4px]"
      }`}
    >
      {children}
    </button>
  );
}

function PosterCard({ record, priority, onClick }: { record: TimelineRecord; priority?: boolean; onClick: () => void }) {
  const { t } = useI18nStore();
  const badge = categoryBadge(record.category);
  const status = statusBadge(record.status, t);
  const hasRating = record.rating != null;
  const [imgError, setImgError] = useState(false);
  const resolvedPosterUrl = proxiedImageUrl(record.posterUrl);
  const showPlaceholder = !resolvedPosterUrl || imgError;
  const hideStatus = record.category === 'game' && record.status === 'WANT' && record.playtimeMinutes && record.playtimeMinutes > 0;

  return (
    <button
      onClick={onClick}
      className="group relative flex h-full w-full aspect-[2/3] overflow-hidden bg-[var(--surface)] text-left transition-all duration-500 border border-[var(--line)] hover:border-[var(--accent)] hover:shadow-[0_0_30px_rgba(212,255,0,0.15)]"
    >
      {/* Image with Cinematic Zoom */}
      {!showPlaceholder ? (
        <img
          src={resolvedPosterUrl!}
          alt={record.title}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          onError={() => setImgError(true)}
          className="absolute inset-0 h-full w-full object-cover grayscale-[20%] opacity-80 transition-all duration-700 ease-out group-hover:scale-110 group-hover:grayscale-0 group-hover:opacity-100"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden" style={{ background: `linear-gradient(135deg, #0a0a0a 0%, #111 50%, #0a0a0a 100%)` }}>
          {/* Grid Pattern */}
          <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
          {/* Category Icon */}
          <div className="relative mb-4 opacity-20">
            {record.category === 'game' ? (
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke={badge.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="6" y1="12" x2="10" y2="12" /><line x1="8" y1="10" x2="8" y2="14" />
                <line x1="15" y1="13" x2="15.01" y2="13" /><line x1="18" y1="11" x2="18.01" y2="11" />
                <path d="M17.32 5H6.68a4 4 0 0 0-3.978 3.59c-.006.052-.01.101-.017.152C2.604 9.416 2 14.456 2 16a3 3 0 0 0 3 3c1 0 1.5-.5 2-1l1.414-1.414A2 2 0 0 1 9.828 16h4.344a2 2 0 0 1 1.414.586L17 18c.5.5 1 1 2 1a3 3 0 0 0 3-3c0-1.544-.604-6.584-.685-7.258-.007-.05-.011-.1-.017-.151A4 4 0 0 0 17.32 5z" />
              </svg>
            ) : (
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke={badge.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
                <line x1="7" y1="2" x2="7" y2="22" /><line x1="17" y1="2" x2="17" y2="22" />
                <line x1="2" y1="12" x2="22" y2="12" /><line x1="2" y1="7" x2="7" y2="7" />
                <line x1="2" y1="17" x2="7" y2="17" /><line x1="17" y1="7" x2="22" y2="7" />
                <line x1="17" y1="17" x2="22" y2="17" />
              </svg>
            )}
          </div>
          {/* Title Initial */}
          <div className="text-3xl font-display font-bold opacity-10" style={{ color: badge.color }}>
            {record.title.charAt(0).toUpperCase()}
          </div>
          {/* Decorative Line */}
          <div className="absolute bottom-0 left-0 right-0 h-[2px] opacity-20" style={{ background: `linear-gradient(90deg, transparent, ${badge.color}, transparent)` }} />
        </div>
      )}

      {/* Cyber/Tech Borders & Brackets */}
      <div className="absolute inset-0 border border-white/5 z-10 pointer-events-none" />
      <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-white/30 z-10 transition-colors group-hover:border-[var(--accent)] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-white/30 z-10 transition-colors group-hover:border-[var(--accent)] pointer-events-none" />

      {/* CRT Scanline Overlay */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0)_50%,rgba(0,0,0,0.25)_50%)] bg-[length:100%_4px] opacity-20 mix-blend-overlay transition-opacity duration-300 group-hover:opacity-10 z-10" />

      {/* Status Tech-Dot */}
      {!hideStatus && (
        <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5 bg-black/50 backdrop-blur-md px-2 py-1 rounded border border-white/10">
           <div className={`w-1.5 h-1.5 rounded-full ${record.status === 'DONE' ? 'bg-[var(--accent)] shadow-[0_0_5px_var(--accent)] animate-pulse' : 'bg-[var(--muted)]'}`} />
           <span className="text-[8px] font-bold text-white uppercase tracking-widest leading-none">{status}</span>
        </div>
      )}

      {/* Category Tech Badge (Top Left) */}
      <div 
        className="absolute top-3 left-3 z-20 text-[8px] font-bold uppercase tracking-widest px-2 py-1 bg-black/50 backdrop-blur-md border border-white/10"
        style={{ color: badge.color }}
      >
        [{badge.label}]
      </div>

      {/* Cinematic Glassmorphism Bottom Panel */}
      <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col justify-end bg-gradient-to-t from-[rgba(0,0,0,0.95)] via-[rgba(0,0,0,0.7)] to-transparent p-3 sm:p-5 pt-12 transform transition-transform duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] sm:translate-y-4 group-hover:translate-y-0 backdrop-blur-[2px]">
        <h3 className="font-display font-bold text-white leading-tight mb-2 drop-shadow-lg line-clamp-2 text-lg sm:text-xl">
          {record.title}
        </h3>
        
        <div className="flex items-center gap-3 opacity-80 transition-opacity duration-300 group-hover:opacity-100">
          {hasRating ? (
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-[var(--muted)] uppercase tracking-widest">RTG</span>
              <span className="text-xs sm:text-sm font-bold text-[var(--accent)]"><StarRating value={record.rating!} /></span>
            </div>
          ) : (
            <span className="text-[8px] text-[var(--muted)] uppercase tracking-widest">UNRATED</span>
          )}
          {record.playtimeMinutes && record.playtimeMinutes > 0 ? (
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-[var(--muted)] uppercase tracking-widest">PLAY</span>
              <span className="text-xs sm:text-sm font-bold text-[var(--accent-deep)]">{Math.round(record.playtimeMinutes / 60)}h</span>
            </div>
          ) : null}
        </div>
      </div>
    </button>
  );
}
