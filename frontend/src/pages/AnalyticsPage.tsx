import { useEffect } from "react"
import { useAnalyticsStore } from "../stores/analyticsStore"
import { useI18nStore } from "../stores/i18nStore"
import { OverviewCards } from "../components/analytics/OverviewCards"
import { MonthlyChart } from "../components/analytics/MonthlyChart"
import { RatingChart } from "../components/analytics/RatingChart"
import { SourcePieChart } from "../components/analytics/SourcePieChart"
import { CrossPlatformChart } from "../components/analytics/CrossPlatformChart"
import { TopRatedList } from "../components/analytics/TopRatedList"
import { YearFingerprint } from "../components/analytics/YearFingerprint"

export default function AnalyticsPage() {
  const { data, year, loading, error, fetchAnalytics } = useAnalyticsStore()
  const { t } = useI18nStore()

  useEffect(() => {
    void fetchAnalytics()
  }, [fetchAnalytics])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-sm uppercase tracking-widest animate-pulse" style={{ color: "var(--accent)" }}>
          {t("analytics.loading")}
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div role="alert" className="w-full max-w-xl border border-[var(--accent-deep)] bg-[rgba(255,68,0,0.08)] p-6 sm:p-8">
          <span className="font-mono text-[9px] uppercase tracking-[0.24em] text-[var(--accent-deep)]">
            {t("analytics.error.kicker")}
          </span>
          <h1 className="mt-2 font-display text-2xl text-white">{t("analytics.error.title")}</h1>
          <p className="mt-3 break-all text-xs leading-6 text-[var(--muted)]">
            {error || t("analytics.error.empty")}
          </p>
          <button type="button" onClick={() => void fetchAnalytics(year)} className="brutal-btn-accent mt-6">
            {t("analytics.error.retry")}
          </button>
        </div>
      </div>
    )
  }

  const yearIndex = data.availableYears.indexOf(year)
  const olderYear = data.availableYears[yearIndex + 1]
  const newerYear = yearIndex > 0 ? data.availableYears[yearIndex - 1] : undefined

  return (
    <div className="analytics-bg flex flex-col gap-4">
      {/* 标题栏 + 年份选择器 */}
      <div className="flex items-center justify-between">
        <div>
          <div className="section-kicker">{t("analytics.kicker")}</div>
          <h1
            className="text-2xl font-display font-bold tracking-tight flex items-center gap-3"
            style={{ color: "var(--ink)" }}
          >
            {t("analytics.title")}
            <span
              className="inline-block w-16 h-px"
              style={{
                background: "linear-gradient(to right, var(--accent), transparent)",
                boxShadow: "0 0 8px rgba(212,255,0,0.3)",
              }}
            />
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            className="cursor-pointer px-2 py-0.5 text-[10px] uppercase tracking-wider disabled:cursor-not-allowed disabled:opacity-25 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
            style={{
              color: "var(--accent)",
              border: "1px solid rgba(212,255,0,0.3)",
              background: "rgba(212,255,0,0.05)",
            }}
            onClick={() => olderYear != null && void fetchAnalytics(olderYear)}
            disabled={olderYear == null}
            aria-label={t("analytics.year.older")}
          >
            ←
          </button>
          <select
            value={year}
            onChange={(event) => void fetchAnalytics(Number(event.target.value))}
            aria-label={t("analytics.year.select")}
            className="showcase-number w-24 appearance-none border-0 bg-transparent text-center text-2xl outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
          >
            {data.availableYears.map((availableYear) => (
              <option key={availableYear} value={availableYear} className="bg-[var(--surface)] text-white">
                {availableYear}
              </option>
            ))}
          </select>
          <button
            className="cursor-pointer px-2 py-0.5 text-[10px] uppercase tracking-wider disabled:cursor-not-allowed disabled:opacity-25 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
            style={{
              color: "var(--accent)",
              border: "1px solid rgba(212,255,0,0.3)",
              background: "rgba(212,255,0,0.05)",
            }}
            onClick={() => newerYear != null && void fetchAnalytics(newerYear)}
            disabled={newerYear == null}
            aria-label={t("analytics.year.newer")}
          >
            →
          </button>
        </div>
      </div>

      {/* 总览卡片 */}
      <OverviewCards overview={data.overview} />

      {/* 年度指纹 */}
      <YearFingerprint data={data} />

      {/* 月度完成趋势 */}
      <MonthlyChart data={data.monthlyCompletion} />

      {/* 评分分布 + 来源饼图 并排 */}
      <div className="grid grid-cols-2 gap-4">
        <RatingChart data={data.ratingDistribution} />
        <SourcePieChart data={data.sourceBreakdown} />
      </div>

      {/* 跨平台评分对比 */}
      <CrossPlatformChart data={data.crossPlatformRatings} />

      {/* Top 评分榜 */}
      <TopRatedList items={data.topRated} />
    </div>
  )
}
