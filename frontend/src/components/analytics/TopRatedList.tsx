import { useI18nStore } from "../../stores/i18nStore"
import type { AnalyticsData } from "../../types/analytics"
import { ImgWithFallback } from "../ImgWithFallback"

interface Props {
  items: AnalyticsData["topRated"]
}

function categoryIcon(cat: string): string {
  switch (cat) {
    case "movie": return "M"
    case "game": return "G"
    case "tv_show": return "T"
    default: return "?"
  }
}

export function TopRatedList({ items }: Props) {
  const { t } = useI18nStore()

  if (items.length === 0) {
    return (
      <div className="showcase-panel p-5">
        <div className="section-kicker mb-4">{t("analytics.top.title")}</div>
        <div className="flex items-center justify-center h-[120px]">
          <span className="text-xs uppercase tracking-widest" style={{ color: "var(--muted)" }}>
            {t("analytics.top.empty")}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="showcase-panel p-5">
      <div className="section-kicker mb-4">{t("analytics.top.title")}</div>
      <div className="grid grid-cols-5 gap-3">
        {items.map((item, i) => (
          <div
            key={`${item.category}-${item.id}`}
            className="group relative"
            style={{ animation: `poster-enter 0.4s ease-out ${i * 60}ms both` }}
          >
            <div className="showcase-poster" style={{ aspectRatio: "2/3" }}>
              {item.posterUrl ? (
                <ImgWithFallback
                  src={item.posterUrl}
                  alt={item.title}
                  className="w-full h-full object-cover"
                  fallback={
                    <div
                      className="w-full h-full flex items-center justify-center text-[10px] uppercase tracking-wider text-center p-2"
                      style={{ background: "var(--surface-hover)", color: "var(--muted)" }}
                    >
                      {item.title}
                    </div>
                  }
                />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center text-[10px] uppercase tracking-wider text-center p-2"
                  style={{ background: "var(--surface-hover)", color: "var(--muted)" }}
                >
                  {item.title}
                </div>
              )}

              {/* 排名角标 */}
              <div
                className="absolute top-1 left-1 w-5 h-5 flex items-center justify-center text-[10px] font-bold"
                style={{
                  background: i < 3 ? "var(--accent)" : "rgba(255,255,255,0.15)",
                  color: i < 3 ? "black" : "var(--muted)",
                }}
              >
                {i + 1}
              </div>

              {/* 分类角标 */}
              <div
                className="absolute top-1 right-1 w-5 h-5 flex items-center justify-center text-[8px] font-bold"
                style={{ background: "rgba(0,0,0,0.6)", color: "var(--accent)" }}
              >
                {categoryIcon(item.category)}
              </div>
            </div>

            <div className="mt-1.5">
              <div className="text-[10px] font-display font-bold truncate" style={{ color: "var(--ink)" }}>
                {item.title}
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-[10px] font-bold" style={{ color: "var(--accent)" }}>
                  {item.rating}★
                </span>
                <span className="text-[9px] uppercase" style={{ color: "var(--muted)" }}>
                  {item.source}
                </span>
              </div>
              {item.shortReview && (
                <div className="text-[9px] mt-0.5 line-clamp-2" style={{ color: "var(--muted)" }}>
                  {item.shortReview}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
