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
