import { useState, useEffect, useRef } from "react"
import type { ProfileSummary } from "../../types/profile"
import { useI18nStore } from "../../stores/i18nStore"

interface StatsPanelProps {
  summary: ProfileSummary
  compact?: boolean
}

function useCountUp(target: number, duration = 1200) {
  const [value, setValue] = useState(0)
  const ref = useRef<number>(0)

  useEffect(() => {
    const start = performance.now()
    const from = ref.current
    const diff = target - from

    const tick = (now: number) => {
      const elapsed = now - start
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3) // ease-out cubic
      const current = Math.round(from + diff * eased)
      setValue(current)
      if (progress < 1) {
        requestAnimationFrame(tick)
      } else {
        ref.current = target
      }
    }

    requestAnimationFrame(tick)
  }, [target, duration])

  return value
}

function StatNumber({ value, suffix, size }: { value: number; suffix?: string; size: "lg" | "md" | "sm" }) {
  const animated = useCountUp(value)
  const sizeClass = size === "lg" ? "text-6xl" : size === "md" ? "text-4xl" : "text-3xl"

  return (
    <div className={`showcase-number ${sizeClass} leading-none`} style={{ animation: "stat-flicker 4s ease-in-out infinite" }}>
      {animated.toLocaleString()}{suffix}
    </div>
  )
}

export function StatsPanel({ summary, compact }: StatsPanelProps) {
  const { t } = useI18nStore()
  const { overview, ratings } = summary
  const completed = overview.completedMovies + overview.completedGames + overview.completedTvShows

  if (compact) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-8">
        <div className="section-kicker">{t("showcase.stats.kicker")}</div>
        <div className="showcase-number text-9xl" style={{ animation: "stat-flicker 4s ease-in-out infinite" }}>
          {overview.totalRecords.toLocaleString()}
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
              <div className="showcase-number text-5xl">{typeof item.value === "number" ? item.value.toLocaleString() : item.value}</div>
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
    <div className="showcase-panel p-5 flex items-center gap-6" style={{ height: 120 }}>
      <div className="section-kicker shrink-0">{t("showcase.stats.kicker")}</div>

      {/* 大数字区 */}
      <div className="flex items-center gap-6">
        <div className="text-center">
          <StatNumber value={overview.totalRecords} size="lg" />
          <div className="text-[10px] uppercase tracking-widest mt-1" style={{ color: "var(--muted)" }}>
            {t("showcase.stats.total")}
          </div>
        </div>

        <div className="text-center">
          <StatNumber value={completed} size="md" />
          <div className="text-[10px] uppercase tracking-widest mt-1" style={{ color: "var(--muted)" }}>
            {t("showcase.stats.completed")}
          </div>
        </div>

        <div className="text-center">
          <div className="showcase-number text-4xl leading-none" style={{ animation: "stat-flicker 4s ease-in-out infinite" }}>
            {ratings.overallAverage?.toFixed(1) ?? "—"}
          </div>
          <div className="text-[10px] uppercase tracking-widest mt-1" style={{ color: "var(--muted)" }}>
            {t("showcase.stats.avg_rating")}
          </div>
        </div>
      </div>

      {/* 发光分隔线 */}
      <div className="w-px h-16 shrink-0" style={{
        background: "linear-gradient(to bottom, transparent, var(--accent), transparent)",
        boxShadow: "0 0 8px rgba(212,255,0,0.3)",
      }} />

      {/* 分类卡片 */}
      <div className="flex gap-3 ml-auto">
        {[
          { label: t("showcase.stats.movies"), avg: ratings.movieAverage, icon: "M" },
          { label: t("showcase.stats.tvshows"), avg: ratings.tvShowAverage, icon: "T" },
          { label: t("showcase.stats.games"), avg: ratings.gameAverage, icon: "G" },
        ].map((item) => (
          <div
            key={item.label}
            className="flex flex-col items-center justify-center px-4 py-2 relative overflow-hidden group"
            style={{
              border: "1px solid rgba(212,255,0,0.2)",
              background: "var(--surface-hover)",
              transition: "border-color 0.3s, box-shadow 0.3s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "rgba(212,255,0,0.5)"
              e.currentTarget.style.boxShadow = "0 0 12px rgba(212,255,0,0.15), inset 0 0 20px rgba(212,255,0,0.03)"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "rgba(212,255,0,0.2)"
              e.currentTarget.style.boxShadow = "none"
            }}
          >
            {/* 角标字母 */}
            <div className="absolute top-0.5 left-1.5 text-[8px] font-bold" style={{ color: "rgba(212,255,0,0.2)" }}>
              {item.icon}
            </div>
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
