import { useI18nStore } from "../../stores/i18nStore"
import type { AnalyticsData } from "../../types/analytics"

interface Props {
  data: Pick<AnalyticsData, "monthlyCompletion" | "ratingDistribution">
}

interface FingerprintItem {
  label: string
  value: string
  detail: string
}

export function YearFingerprint({ data }: Props) {
  const { lang, t } = useI18nStore()

  const monthTotals = data.monthlyCompletion.map((month) => ({
    month: month.month,
    count: month.movies + month.tvShows + month.games,
  }))
  const peakMonth = monthTotals.reduce<(typeof monthTotals)[number] | null>(
    (peak, month) => (!peak || month.count > peak.count ? month : peak),
    null,
  )

  const categoryTotals = [
    {
      label: t("analytics.source.movies"),
      count: data.monthlyCompletion.reduce((sum, month) => sum + month.movies, 0),
    },
    {
      label: t("analytics.source.tvshows"),
      count: data.monthlyCompletion.reduce((sum, month) => sum + month.tvShows, 0),
    },
    {
      label: t("analytics.source.games"),
      count: data.monthlyCompletion.reduce((sum, month) => sum + month.games, 0),
    },
  ]
  const dominantCategory = categoryTotals.reduce<(typeof categoryTotals)[number] | null>(
    (dominant, category) => (!dominant || category.count > dominant.count ? category : dominant),
    null,
  )

  const ratingTotals = new Map<number, number>()
  for (const category of Object.values(data.ratingDistribution)) {
    for (const item of category) {
      ratingTotals.set(item.rating, (ratingTotals.get(item.rating) || 0) + item.count)
    }
  }
  const maxRatingCount = Math.max(0, ...ratingTotals.values())
  const ratingModes = [...ratingTotals.entries()]
    .filter(([, count]) => count === maxRatingCount && count > 0)
    .map(([rating]) => `${rating}★`)
    .join(" / ")

  const monthNumber = Number(peakMonth?.month)
  const peakMonthLabel = peakMonth && peakMonth.count > 0 && Number.isInteger(monthNumber) && monthNumber >= 1 && monthNumber <= 12
    ? new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : "en-US", {
        month: "short",
        timeZone: "UTC",
      }).format(new Date(Date.UTC(2020, monthNumber - 1, 1)))
    : t("analytics.fingerprint.empty")

  const items: FingerprintItem[] = [
    {
      label: t("analytics.fingerprint.peak_month"),
      value: peakMonthLabel,
      detail: peakMonth && peakMonth.count > 0
        ? t("analytics.fingerprint.completed_count", peakMonth.count)
        : t("analytics.fingerprint.empty"),
    },
    {
      label: t("analytics.fingerprint.dominant_category"),
      value: dominantCategory && dominantCategory.count > 0
        ? dominantCategory.label
        : t("analytics.fingerprint.empty"),
      detail: dominantCategory && dominantCategory.count > 0
        ? t("analytics.fingerprint.completed_count", dominantCategory.count)
        : t("analytics.fingerprint.empty"),
    },
    {
      label: t("analytics.fingerprint.rating_mode"),
      value: ratingModes || t("analytics.fingerprint.empty"),
      detail: maxRatingCount > 0
        ? t("analytics.fingerprint.rated_count", maxRatingCount)
        : t("analytics.fingerprint.empty"),
    },
  ]

  return (
    <section className="showcase-panel overflow-hidden" aria-labelledby="year-fingerprint-title">
      <div className="border-b border-white/10 px-5 py-3">
        <div id="year-fingerprint-title" className="section-kicker">
          {t("analytics.fingerprint.kicker")}
        </div>
      </div>
      <div className="grid sm:grid-cols-3">
        {items.map((item, index) => (
          <div
            key={item.label}
            className={`relative px-5 py-4 ${index > 0 ? "border-t border-white/10 sm:border-l sm:border-t-0" : ""}`}
          >
            <div className="mb-2 text-[9px] uppercase tracking-[0.22em]" style={{ color: "var(--muted)" }}>
              0{index + 1} // {item.label}
            </div>
            <div className="font-display text-xl font-bold tracking-tight" style={{ color: "var(--ink)" }}>
              {item.value}
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-wider" style={{ color: "var(--accent)" }}>
              {item.detail}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
