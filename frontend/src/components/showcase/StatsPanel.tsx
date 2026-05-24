import type { ProfileSummary } from "../../types/profile"
import { useI18nStore } from "../../stores/i18nStore"

interface StatsPanelProps {
  summary: ProfileSummary
  compact?: boolean
}

export function StatsPanel({ summary, compact }: StatsPanelProps) {
  const { t } = useI18nStore()
  const { overview, ratings } = summary
  const completed = overview.completedMovies + overview.completedGames + overview.completedTvShows

  if (compact) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-8">
        <div className="section-kicker">{t("showcase.stats.kicker")}</div>
        <div className="showcase-number text-9xl">
          {overview.totalRecords}
        </div>
        <div className="text-sm uppercase tracking-widest" style={{ color: "var(--muted)" }}>
          {t("showcase.stats.total")}
        </div>
        <div className="flex gap-8 mt-4">
          {[
            { label: t("showcase.stats.completed"), value: completed },
            { label: t("showcase.stats.avg_rating"), value: ratings.overallAverage?.toFixed(1) ?? "—" },
          ].map((item) => (
            <div key={item.label} className="text-center">
              <div className="showcase-number text-5xl">{item.value}</div>
              <div className="text-xs uppercase tracking-widest mt-2" style={{ color: "var(--muted)" }}>
                {item.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="showcase-panel p-5 flex items-center gap-8" style={{ height: 120 }}>
      <div className="section-kicker shrink-0">{t("showcase.stats.kicker")}</div>

      {/* 大数字区 */}
      <div className="flex items-center gap-8">
        <div className="text-center">
          <div className="showcase-number text-6xl leading-none">
            {overview.totalRecords}
          </div>
          <div className="text-[10px] uppercase tracking-widest mt-1" style={{ color: "var(--muted)" }}>
            {t("showcase.stats.total")}
          </div>
        </div>

        <div className="text-center">
          <div className="showcase-number text-4xl leading-none">
            {completed}
          </div>
          <div className="text-[10px] uppercase tracking-widest mt-1" style={{ color: "var(--muted)" }}>
            {t("showcase.stats.completed")}
          </div>
        </div>

        <div className="text-center">
          <div className="showcase-number text-4xl leading-none">
            {ratings.overallAverage?.toFixed(1) ?? "—"}
          </div>
          <div className="text-[10px] uppercase tracking-widest mt-1" style={{ color: "var(--muted)" }}>
            {t("showcase.stats.avg_rating")}
          </div>
        </div>
      </div>

      {/* 分隔线 */}
      <div className="w-px h-16" style={{ background: "var(--line)" }} />

      {/* 分类均分 */}
      <div className="flex gap-4 ml-auto">
        {[
          { label: t("showcase.stats.movies"), avg: ratings.movieAverage },
          { label: t("showcase.stats.tvshows"), avg: ratings.tvShowAverage },
          { label: t("showcase.stats.games"), avg: ratings.gameAverage },
        ].map((item) => (
          <div
            key={item.label}
            className="flex flex-col items-center justify-center px-4 py-2"
            style={{ border: "1px solid var(--line)", background: "var(--surface-hover)" }}
          >
            <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--muted)" }}>
              {item.label}
            </span>
            <span className="text-lg font-display font-bold mt-1" style={{ color: "var(--accent)" }}>
              {item.avg?.toFixed(1) ?? "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
