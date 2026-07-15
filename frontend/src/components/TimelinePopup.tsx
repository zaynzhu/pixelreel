import { useEffect, useRef } from "react";
import type { LibraryRecord, RecordStatus } from "../types/library";
import type { TimelineRecord } from "../types/timeline";
import { useI18nStore } from "../stores/i18nStore";
import { StarRating } from "./StarRating";
import { ImgWithFallback } from "./ImgWithFallback";
import { proxiedImageUrl } from "../imageProxy";

interface TimelinePopupProps {
  lightweightRecord: TimelineRecord | null;
  fullRecord: LibraryRecord | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onRescrape?: (record: LibraryRecord) => void;
}

export default function TimelinePopup({ lightweightRecord, fullRecord, loading, error, onClose, onRescrape }: TimelinePopupProps) {
  const { t } = useI18nStore();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!lightweightRecord) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [lightweightRecord, onClose]);

  useEffect(() => {
    if (!lightweightRecord) return;
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    closeButtonRef.current?.focus();
    return () => {
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [lightweightRecord]);

  if (!lightweightRecord) return null;

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
      case "DROPPED": return t("global.status.dropped");
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

  const badge = categoryBadge(lightweightRecord.category);

  // Derive display values: prefer full record, fall back to lightweight
  const title = fullRecord?.title ?? lightweightRecord.title;
  const posterUrl = proxiedImageUrl(fullRecord?.posterUrl ?? lightweightRecord.posterUrl);
  const status = fullRecord?.status ?? lightweightRecord.status;
  const rating = fullRecord?.rating ?? lightweightRecord.rating;
  const category = fullRecord?.category ?? lightweightRecord.category;
  const playtimeMinutes = fullRecord?.playtimeMinutes ?? lightweightRecord.playtimeMinutes;
  const sourceLabel = fullRecord?.sourceLabel ?? lightweightRecord.sourceLabel;
  const createdAt = fullRecord?.createdAt ?? lightweightRecord.createdAt;

  // Fields only available from full record
  const doubanAltTitle = fullRecord?.doubanAltTitle ?? null;
  const doubanLink = fullRecord?.doubanLink ?? null;
  const hasDouban = fullRecord?.doubanAvgRating != null;
  const hasTmdb = fullRecord?.tmdbTitle != null;
  const tmdbReleaseDate = fullRecord?.tmdbReleaseDate ?? null;
  const tmdbGenreIds = fullRecord?.tmdbGenreIds ?? null;
  const shortReview = fullRecord?.shortReview ?? null;
  const doubanAvgRating = fullRecord?.doubanAvgRating ?? null;
  const tmdbVoteAverage = fullRecord?.tmdbVoteAverage ?? null;
  const tmdbPopularity = fullRecord?.tmdbPopularity ?? null;
  const imdbRating = fullRecord?.imdbRating ?? null;
  const tmdbTitle = fullRecord?.tmdbTitle ?? null;
  const tmdbOverview = fullRecord?.tmdbOverview ?? null;
  const doubanIntro = fullRecord?.doubanIntro ?? null;
  const doubanDate = fullRecord?.doubanDate ?? null;
  const hideStatus = category === 'game' && status === 'WANT' && playtimeMinutes && playtimeMinutes > 0;

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
        role="dialog"
        aria-modal="true"
        aria-labelledby="timeline-popup-title"
        className="relative w-full max-w-[720px] overflow-hidden border border-[var(--line)] bg-[var(--surface)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label={t("timeline.close")}
          className="absolute top-3 right-3 z-10 text-[var(--muted)] hover:text-white text-lg font-bold leading-none"
        >
          ✕
        </button>

        {/* Top: Poster + Title block */}
        <div className="flex gap-0 border-b border-[var(--line)]">
          {/* Poster */}
          <div className="w-[200px] shrink-0">
            <div className="aspect-[2/3] bg-gradient-to-br from-[#1a1a2e] to-[#16213e] relative">
              {posterUrl ? (
                <ImgWithFallback
                  src={posterUrl}
                  alt={title}
                  className="h-full w-full object-cover"
                  fallback={
                    <div className="flex h-full w-full items-center justify-center bg-[#0a0a0a] relative overflow-hidden">
                      <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.15) 1px, transparent 1px)', backgroundSize: '12px 12px' }} />
                      <span className="text-3xl font-display font-bold opacity-15" style={{ color: badge.color }}>{title.charAt(0).toUpperCase()}</span>
                    </div>
                  }
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-[#0a0a0a] relative overflow-hidden">
                  <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.15) 1px, transparent 1px)', backgroundSize: '12px 12px' }} />
                  <span className="text-3xl font-display font-bold opacity-15" style={{ color: badge.color }}>{title.charAt(0).toUpperCase()}</span>
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
            <h3 id="timeline-popup-title" className="font-display text-lg font-bold uppercase text-white leading-tight">
              {title}
            </h3>

            {doubanAltTitle && (
              <p className="text-[11px] text-[var(--muted)] leading-relaxed">
                {doubanAltTitle}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {sourceLabel && <span className="neo-badge text-[10px]">{sourceLabel}</span>}
              {!hideStatus && (
                <span className="neo-badge text-[10px]">{statusLabel(status)}</span>
              )}
              {tmdbReleaseDate && (
                <span className="neo-badge text-[10px]">{tmdbReleaseDate}</span>
              )}
              {loading && (
                <span className="text-[9px] text-[var(--muted)] uppercase tracking-widest animate-pulse">LOADING...</span>
              )}
              {error && (
                <span className="text-[9px] text-red-400 uppercase tracking-widest">ERR</span>
              )}
            </div>

            {/* TMDB 类型标签 */}
            {genreNames(tmdbGenreIds).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {genreNames(tmdbGenreIds).map(name => (
                  <span key={name} className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 border border-[var(--line)] text-[var(--muted)]">
                    {name}
                  </span>
                ))}
              </div>
            )}

            {/* 个人评分（星星） */}
            {rating != null && (
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[var(--muted)] uppercase tracking-widest">MY RATING</span>
                <span className="text-xs sm:text-sm font-bold text-[var(--accent)]"><StarRating value={rating} /></span>
              </div>
            )}

            {/* 短评 */}
            {shortReview?.trim() && (
              <p className="text-[11px] leading-relaxed text-[var(--muted)] border-l-2 border-[var(--accent)] pl-3 mt-1">
                {shortReview.trim()}
              </p>
            )}

            {/* 豆瓣条目链接 */}
            {doubanLink && (
              <a
                href={doubanLink}
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
              <PlatformScore label="豆瓣" rating={doubanAvgRating} />
            )}
            {hasTmdb && (
              <PlatformScore label="TMDB" rating={tmdbVoteAverage} extra={tmdbPopularity != null ? `POP ${tmdbPopularity.toFixed(1)}` : undefined} />
            )}
            {imdbRating != null && (
              <PlatformScore label="IMDb" rating={imdbRating} />
            )}
          </div>

          {/* TMDB 原始标题 */}
          {tmdbTitle && tmdbTitle !== title && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--muted)] mb-1">TMDB TITLE</p>
              <p className="text-[11px] leading-relaxed text-[var(--muted)]">{tmdbTitle}</p>
            </div>
          )}

          {/* 简介 */}
          {tmdbOverview && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--muted)] mb-1">OVERVIEW</p>
              <p className="text-[11px] leading-relaxed text-[var(--muted)]">
                {tmdbOverview}
              </p>
            </div>
          )}

          {/* 豆瓣 intro（原始信息：导演/类型等） */}
          {doubanIntro && (
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--muted)] mb-1">DOUBAN INFO</p>
              <p className="text-[11px] leading-relaxed text-[var(--muted)]">
                {doubanIntro}
              </p>
            </div>
          )}

          {/* 底部日期 + 重新刮削按钮 */}
          <div className="flex items-center justify-between text-[9px] uppercase tracking-widest text-[var(--dim)] border-t border-[var(--line)] pt-3">
            <span>{t("timeline.added")} {formatDate(createdAt)}</span>
            <div className="flex items-center gap-3">
              {doubanDate && (
                <span>豆瓣标记 {doubanDate}</span>
              )}
              {fullRecord && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRescrape?.(fullRecord);
                  }}
                  className="flex items-center gap-1.5 px-2 py-1 border border-[var(--line)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-black transition-colors"
                >
                  <span>&#x21BB;</span>
                  <span className="text-[9px] font-bold uppercase tracking-widest">{t("lib.rescrape.btn")}</span>
                </button>
              )}
            </div>
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
