import { useI18nStore } from "../../stores/i18nStore"
import type { AnalyticsData } from "../../types/analytics"

interface Props {
  overview: AnalyticsData["overview"]
}

export function OverviewCards({ overview }: Props) {
  const { t } = useI18nStore()

  const comparisonLabel = overview.comparisonPeriod === "year_to_date"
    ? t("analytics.overview.vs_last_year_same_period")
    : t("analytics.overview.vs_last_year")
  const changePercent = overview.completedLastYear > 0
    ? Math.round(((overview.completedThisYear - overview.completedLastYear) / overview.completedLastYear) * 100)
    : null
  const comparison = changePercent == null
    ? `${overview.completedThisYear > 0 ? t("analytics.overview.new") : "0%"} · ${comparisonLabel}`
    : `${changePercent > 0 ? "+" : ""}${changePercent}% · ${comparisonLabel}`

  const cards = [
    {
      label: t("analytics.overview.completed"),
      value: overview.completedThisYear,
      suffix: comparison,
      accent: true,
    },
    {
      label: t("analytics.overview.avg_rating"),
      value: overview.avgRatingThisYear?.toFixed(1) ?? "—",
      suffix: "/5",
      accent: false,
    },
    {
      label: t("analytics.overview.rated"),
      value: overview.ratedThisYear,
      accent: false,
    },
    {
      label: t("analytics.overview.reviewed"),
      value: overview.reviewedThisYear,
      accent: false,
    },
    {
      label: t("analytics.overview.total"),
      value: overview.totalInLibrary,
      accent: false,
    },
  ]

  return (
    <div className="grid grid-cols-5 gap-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className="showcase-panel p-4 flex flex-col items-center justify-center text-center"
        >
          <span className="text-[10px] uppercase tracking-widest" style={{ color: "var(--muted)" }}>
            {card.label}
          </span>
          <span
            className={`showcase-number text-4xl mt-2 ${card.accent ? "" : ""}`}
            style={card.accent ? undefined : { color: "var(--ink)", textShadow: "none" }}
          >
            {typeof card.value === "number" ? card.value.toLocaleString() : card.value}
          </span>
          {card.suffix && (
            <span className="text-[10px] mt-1 font-bold" style={{
              color: card.suffix.startsWith("+") ? "var(--accent)" : card.suffix.startsWith("-") ? "var(--accent-deep)" : "var(--muted)"
            }}>
              {card.suffix}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
