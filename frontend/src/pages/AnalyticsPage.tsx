import { useEffect } from "react"
import { useAnalyticsStore } from "../stores/analyticsStore"
import { useI18nStore } from "../stores/i18nStore"
import { OverviewCards } from "../components/analytics/OverviewCards"
import { MonthlyChart } from "../components/analytics/MonthlyChart"
import { RatingChart } from "../components/analytics/RatingChart"
import { SourcePieChart } from "../components/analytics/SourcePieChart"
import { CrossPlatformChart } from "../components/analytics/CrossPlatformChart"
import { TopRatedList } from "../components/analytics/TopRatedList"

export default function AnalyticsPage() {
  const { data, year, loading, error, setYear, fetchAnalytics } = useAnalyticsStore()
  const { t } = useI18nStore()

  useEffect(() => {
    void fetchAnalytics()
  }, [fetchAnalytics])

  const handleYearChange = (delta: number) => {
    const newYear = year + delta
    void fetchAnalytics(newYear)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-sm uppercase tracking-widest animate-pulse" style={{ color: "var(--accent)" }}>
          LOADING...
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-sm uppercase tracking-widest" style={{ color: "var(--accent-deep)" }}>
          ERROR: {error || "No data"}
        </div>
      </div>
    )
  }

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
            className="text-[10px] uppercase tracking-wider cursor-pointer px-2 py-0.5"
            style={{
              color: "var(--accent)",
              border: "1px solid rgba(212,255,0,0.3)",
              background: "rgba(212,255,0,0.05)",
            }}
            onClick={() => handleYearChange(-1)}
          >
            ←
          </button>
          <span className="showcase-number text-2xl">{year}</span>
          <button
            className="text-[10px] uppercase tracking-wider cursor-pointer px-2 py-0.5"
            style={{
              color: "var(--accent)",
              border: "1px solid rgba(212,255,0,0.3)",
              background: "rgba(212,255,0,0.05)",
            }}
            onClick={() => handleYearChange(1)}
          >
            →
          </button>
        </div>
      </div>

      {/* 总览卡片 */}
      <OverviewCards overview={data.overview} />

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
