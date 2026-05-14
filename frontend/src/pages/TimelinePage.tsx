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
  labelMonth: string; // "MAR"
  labelYear: string;  // "2025"
  records: LibraryRecord[];
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

function statusBadge(status: RecordStatus, t: (key: string) => string) {
  switch (status) {
    case "WANT": return t("global.status.want");
    case "IN_PROGRESS": return t("global.status.active");
    case "DONE": return t("global.status.done");
    default: return t("global.status.unset");
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
  }, [filteredRecords]);

  return (
    <div className="relative min-h-screen bg-black bg-[var(--page-bg)] overflow-hidden font-['JetBrains_Mono',monospace]">
      {/* Floating Filter Menu (Top Right) */}
      <div className="absolute top-8 right-8 z-50 hidden md:flex flex-col items-end gap-2">
        <div className="text-[10px] font-bold text-[var(--accent)] tracking-[0.2em] mb-2 uppercase">
          [ FILTERS ]
        </div>
        <YearFilterBtn active={selectedYear === "ALL"} onClick={() => setSelectedYear("ALL")}>
          ALL_TIME
        </YearFilterBtn>
        {years.map((y) => (
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
          {monthGroups.map((group, index) => {
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
                      <PosterCard record={record} onClick={() => setPopupRecord(record)} />
                    </div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {/* Floating Stats Pill (Glassmorphism + Tech) */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[95%] sm:w-auto">
        <div className="flex flex-wrap sm:flex-nowrap items-center justify-center gap-4 sm:gap-8 rounded-full border border-white/10 bg-[rgba(5,5,5,0.7)] px-6 py-3 sm:px-10 sm:py-4 backdrop-blur-xl shadow-[0_20px_40px_rgba(0,0,0,0.8)] mx-auto">
          
          {/* Mobile Year Switcher inside pill */}
          <div className="md:hidden flex items-center border-r border-[var(--line)] pr-4 relative">
             <select 
               className="bg-transparent text-[10px] text-[var(--accent)] uppercase font-bold outline-none tracking-widest appearance-none pr-4 w-full cursor-pointer"
               value={selectedYear}
               onChange={(e) => setSelectedYear(e.target.value === "ALL" ? "ALL" : parseInt(e.target.value, 10))}
             >
               <option value="ALL">ALL_TIME</option>
               {years.map(y => <option key={y} value={y}>{y}</option>)}
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

      <TimelinePopup record={popupRecord} onClose={() => setPopupRecord(null)} />
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

function PosterCard({ record, onClick }: { record: LibraryRecord; onClick: () => void }) {
  const { t } = useI18nStore();
  const badge = categoryBadge(record.category);
  const status = statusBadge(record.status, t);
  const hasRating = record.rating != null;

  return (
    <button
      onClick={onClick}
      className="group relative flex h-full w-full aspect-[2/3] overflow-hidden bg-[var(--surface)] text-left transition-all duration-500 border border-[var(--line)] hover:border-[var(--accent)] hover:shadow-[0_0_30px_rgba(212,255,0,0.15)]"
    >
      {/* Image with Cinematic Zoom */}
      {record.posterUrl ? (
        <img
          src={record.posterUrl}
          alt={record.title}
          className="absolute inset-0 h-full w-full object-cover grayscale-[20%] opacity-80 transition-all duration-700 ease-out group-hover:scale-110 group-hover:grayscale-0 group-hover:opacity-100"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
          <span className="text-[10px] text-[var(--line)] uppercase tracking-[0.3em] font-bold">NO_IMAGE</span>
        </div>
      )}

      {/* Cyber/Tech Borders & Brackets */}
      <div className="absolute inset-0 border border-white/5 z-10 pointer-events-none" />
      <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-white/30 z-10 transition-colors group-hover:border-[var(--accent)] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-white/30 z-10 transition-colors group-hover:border-[var(--accent)] pointer-events-none" />

      {/* CRT Scanline Overlay */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0)_50%,rgba(0,0,0,0.25)_50%)] bg-[length:100%_4px] opacity-20 mix-blend-overlay transition-opacity duration-300 group-hover:opacity-10 z-10" />

      {/* Status Tech-Dot */}
      <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5 bg-black/50 backdrop-blur-md px-2 py-1 rounded border border-white/10">
         <div className={`w-1.5 h-1.5 rounded-full ${record.status === 'DONE' ? 'bg-[var(--accent)] shadow-[0_0_5px_var(--accent)] animate-pulse' : 'bg-[var(--muted)]'}`} />
         <span className="text-[8px] font-bold text-white uppercase tracking-widest leading-none">{status}</span>
      </div>

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
              <span className="text-xs sm:text-sm font-bold text-[var(--accent)]">{record.rating}</span>
            </div>
          ) : (
            <span className="text-[8px] text-[var(--muted)] uppercase tracking-widest">UNRATED</span>
          )}
        </div>
      </div>
    </button>
  );
}
