import { useMemo } from "react"
import type { RecentRecordItem } from "../../types/profile"
import { useI18nStore } from "../../stores/i18nStore"

interface TimelineMiniProps {
  items: RecentRecordItem[]
  compact?: boolean
}

export function TimelineMini({ items, compact }: TimelineMiniProps) {
  const { t } = useI18nStore()

  const yearData = useMemo(() => {
    const counts: Record<string, number> = {}
    items.forEach((item) => {
      const year = new Date(item.createdAt).getFullYear().toString()
      counts[year] = (counts[year] || 0) + 1
    })
    const entries = Object.entries(counts)
      .map(([year, count]) => ({ year, count }))
      .sort((a, b) => a.year.localeCompare(b.year))
    return entries
  }, [items])

  const maxCount = Math.max(...yearData.map((d) => d.count), 1)

  return (
    <div className="dash-card h-full flex flex-col p-5 relative overflow-hidden">
      <div className="section-kicker mb-3">{t("showcase.timeline.kicker")}</div>

      <div className="flex-1 flex flex-col justify-center">
        <div className="text-[10px] uppercase tracking-wider mb-4" style={{ color: "var(--muted)" }}>
          {t("showcase.timeline.by_year")}
        </div>

        <div className={`flex items-end gap-1 ${compact ? "h-32" : "h-48"}`}>
          {yearData.map((d, i) => {
            const height = (d.count / maxCount) * 100
            const isLatest = i === yearData.length - 1
            return (
              <div key={d.year} className="flex-1 flex flex-col items-center gap-1">
                <div className="text-[10px] font-display font-bold" style={{ color: isLatest ? "var(--accent-deep)" : "var(--accent)" }}>
                  {d.count}
                </div>
                <div
                  className="w-full transition-all duration-500"
                  style={{
                    height: `${height}%`,
                    background: isLatest ? "var(--accent-deep)" : "var(--accent)",
                    opacity: isLatest ? 1 : 0.6,
                    boxShadow: isLatest ? "0 0 10px rgba(255,68,0,0.4)" : "none",
                  }}
                />
              </div>
            )
          })}
        </div>

        <div className="flex gap-1 mt-1">
          {yearData.map((d, i) => (
            <div
              key={d.year}
              className="flex-1 text-center text-[9px] uppercase tracking-wider"
              style={{ color: i === yearData.length - 1 ? "var(--accent-deep)" : "var(--muted)" }}
            >
              {d.year}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
