import { useEffect } from "react";
import type { LibraryRecord, RecordStatus } from "../types/library";
import { useI18nStore } from "../stores/i18nStore";
import { StarRating } from "./StarRating";

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
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
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
  const hasDouban = record.doubanLink != null;
  const hasTmdb = record.tmdbTitle != null;

  // TMDB genre ID → 名称映射
  const genreNames = (ids: string | null | undefined): string[] => {
    if (!ids) return [];
    const map: Record<number, string> = {
      28: '动作', 12: '冒险', 16: '动画', 35: '喜剧', 80: '犯罪',
      99: '纪录', 18: '剧情', 10751: '家庭', 14: '奇幻', 36: '历史',
      27: '恐怖', 10402: '音乐', 9648: '悬疑', 10749: '爱情', 878: '科幻',
      10770: '电视电影', 53: '惊悚', 10752: '战争', 37: '西部',
      10759: '动作冒险', 10762: '儿童', 10763: '新闻', 10764: '综艺',
      10765: '科幻奇幻', 10766: '肥皂剧', 10767: '谈话', 10768: '战争政治',
    };
    return ids.split(',').map(Number).map(id => map[id] || `G${id}`).filter(Boolean);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[720px] overflow-hidden border border-[var(--line)] bg-[var(--surface)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 text-[var(--muted)] hover:text-white text-lg font-bold leading-none"
        >
          ✕
        </button>

        {/* Top: Poster + Title block */}
        <div className="flex gap-0 border-b border-[var(--line)]">
          {/* Poster */}
          <div className="w-[200px] shrink-0">
            <div className="aspect-[2/3] bg-gradient-to-br from-[#1a1a2e] to-[#16213e] relative">
              {record.posterUrl ? (
                <img
                  src={record.posterUrl}
                  alt={record.title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs font-bold uppercase tracking-widest text-[var(--line)]">
                  NO_IMG
                </div>
              )}
              <div
                className="absolute top-2 left-2 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider"
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

          {/* Title + meta */}
          <div className="flex flex-1 flex-col gap-3 p-5">
            <h3 className="font-display text-lg font-bold uppercase text-white leading-tight">
              {record.title}
            </h3>

            {record.doubanAltTitle && (
              <p className="text-[11px] text-[var(--muted)] leading-relaxed">
                {record.doubanAltTitle}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <span className="neo-badge text-[10px]">{record.sourceLabel}</span>
              <span className="neo-badge text-[10px]">{statusLabel(record.status)}</span>
              {record.tmdbReleaseDate && (
                <span className="neo-badge text-[10px]">{record.tmdbReleaseDate}</span>
              )}
            </div>

            {/* TMDB 类型标签 */}
            {genreNames(record.tmdbGenreIds).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {genreNames(record.tmdbGenreIds).map(name => (
                  <span key={name} className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 border border-[var(--line)] text-[var(--muted)]">
                    {name}
                  </span>
                ))}
              </div>
            )}

            {/* 个人评分（星星） */}
            {record.rating != null && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--muted)] uppercase tracking-widest">MY RATING</span>
                <StarRating value={record.rating} />
              </div>
            )}

            {/* 短评 */}
            {record.shortReview?.trim() && (
              <p className="text-[11px] leading-relaxed text-[var(--muted)] border-l-2 border-[var(--accent)] pl-3 mt-1">
                {record.shortReview.trim()}
              </p>
            )}

            {/* 豆瓣条目链接 */}
            {record.doubanLink && (
              <a
                href={record.doubanLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-[var(--accent)] hover:underline uppercase tracking-widest mt-auto"
              >
                DOUBAN →
              </a>
            )}
          </div>
        </div>

        {/* Bottom: Platform ratings + overview */}
        <div className="p-5 space-y-4">
          {/* 平台评分行 */}
          <div className="flex flex-wrap gap-4">
            {hasDouban && (
              <PlatformScore label="豆瓣" rating={record.doubanAvgRating} />
            )}
            {hasTmdb && (
              <PlatformScore label="TMDB" rating={record.tmdbVoteAverage} extra={record.tmdbPopularity != null ? `POP ${record.tmdbPopularity.toFixed(1)}` : undefined} />
            )}
            {record.imdbRating != null && (
              <PlatformScore label="IMDb" rating={record.imdbRating} />
            )}
          </div>

          {/* TMDB 原始标题 */}
          {record.tmdbTitle && record.tmdbTitle !== record.title && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--muted)] mb-1">TMDB TITLE</p>
              <p className="text-[11px] leading-relaxed text-[var(--muted)]">{record.tmdbTitle}</p>
            </div>
          )}

          {/* 简介 */}
          {record.tmdbOverview && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--muted)] mb-1">OVERVIEW</p>
              <p className="text-[11px] leading-relaxed text-[var(--muted)]">
                {record.tmdbOverview}
              </p>
            </div>
          )}

          {/* 豆瓣 intro（原始信息：导演/类型等） */}
          {record.doubanIntro && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--muted)] mb-1">DOUBAN INFO</p>
              <p className="text-[11px] leading-relaxed text-[var(--muted)]">
                {record.doubanIntro}
              </p>
            </div>
          )}

          {/* 底部日期 */}
          <div className="flex items-center justify-between text-[9px] uppercase tracking-widest text-[var(--dim)] border-t border-[var(--line)] pt-3">
            <span>{t("timeline.added")} {formatDate(record.createdAt)}</span>
            {record.doubanDate && (
              <span>豆瓣标记 {record.doubanDate}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PlatformScore({ label, rating, extra }: { label: string; rating?: number | null; extra?: string }) {
  if (rating == null) return null;
  return (
    <div className="border border-[var(--line)] bg-[var(--surface-hover)] px-4 py-2">
      <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--muted)]">{label}</p>
      <p className="font-display mt-1 text-xl text-white">{rating.toFixed(1)}</p>
      {extra && <p className="mt-0.5 text-[8px] text-[var(--dim)]">{extra}</p>}
    </div>
  );
}