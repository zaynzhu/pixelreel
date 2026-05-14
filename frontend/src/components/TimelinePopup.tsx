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
