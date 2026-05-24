import type { ProfileSummary } from "../../types/profile"
import { useI18nStore } from "../../stores/i18nStore"

interface StatsPanelProps {
  summary: ProfileSummary
  compact?: boolean
}

export function StatsPanel({ summary, compact }: StatsPanelProps) {
  const { t } = useI18nStore()
  const { overview, ratings } = summary

  if (compact) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6">
        <div className="section-kicker">{t("showcase.stats.kicker")}</div>
        <div
          className="text-8xl font-display font-bold tracking-tighter"
          style={{
            color: "var(--accent)",
            textShadow: "0 0 30px rgba(212,255,0,0.5)",
          }}
        >
          {overview.totalRecords}
        </div>
        <div className="text-sm uppercase tracking-widest" style={{ color: "var(--muted)" }}>
          {t("showcase.stats.total")}
        </div>
      </div>
    )
  }

  return (
    <div className="dash-card h-full flex flex-col justify-between p-5 relative overflow-hidden">
      <div className="section-kicker">{t("showcase.stats.kicker")}</div>

      <div className="flex flex-col items-center justify-center flex-1 gap-4">
        <div
          className="text-7xl font-display font-bold tracking-tighter"
          style={{
            color: "var(--accent)",
            textShadow: "0 0 30px rgba(212,255,0,0.5)",
          }}
        >
          {overview.totalRecords}
        </div>
        <div className="text-xs uppercase tracking-widest" style={{ color: "var(--muted)" }}>
          {t("showcase.stats.total")}
        </div>

        <div className="flex gap-6 mt-2">
          <div className="text-center">
            <div className="text-2xl font-display font-bold" style={{ color: "var(--accent)" }}>
              {overview.completedMovies + overview.completedGames + overview.completedTvShows}
            </div>
            <div className="text-[10px] uppercase tracking-widest" style={{ color: "var(--muted)" }}>
              {t("showcase.stats.completed")}
            </div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-display font-bold" style={{ color: "var(--accent)" }}>
              {ratings.overallAverage?.toFixed(1) ?? "—"}
            </div>
            <div className="text-[10px] uppercase tracking-widest" style={{ color: "var(--muted)" }}>
              {t("showcase.stats.avg_rating")}
            </div>
          </div>
        </div>
      </div>

      <div className="flex gap-3 mt-4">
        {[
          { label: t("showcase.stats.movies"), avg: ratings.movieAverage },
          { label: t("showcase.stats.tvshows"), avg: ratings.tvShowAverage },
          { label: t("showcase.stats.games"), avg: ratings.gameAverage },
        ].map((item) => (
          <div
            key={item.label}
            className="flex-1 flex items-center gap-2 px-3 py-2"
            style={{ border: "1px solid var(--line)", background: "var(--surface-hover)" }}
          >
            <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--muted)" }}>
              {item.label}
            </span>
            <span className="ml-auto text-sm font-display font-bold" style={{ color: "var(--accent)" }}>
              {item.avg?.toFixed(1) ?? "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
