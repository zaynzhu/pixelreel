import { useMemo } from "react"
import type { RecentRecordItem, YearlyTimelineItem } from "../../types/profile"
import { useI18nStore } from "../../stores/i18nStore"

interface TimelineMiniProps {
  items: RecentRecordItem[]
  yearlyTimeline?: YearlyTimelineItem[]
  compact?: boolean
}

export function TimelineMini({ items, yearlyTimeline, compact }: TimelineMiniProps) {
  const { t } = useI18nStore()

  const yearData = useMemo(() => {
    if (yearlyTimeline && yearlyTimeline.length > 0) {
      return yearlyTimeline
    }
    // fallback: compute from recentItems
    const counts: Record<string, number> = {}
    items.forEach((item) => {
      const year = new Date(item.createdAt).getFullYear().toString()
      counts[year] = (counts[year] || 0) + 1
    })
    return Object.entries(counts)
      .map(([year, count]) => ({ year, count }))
      .sort((a, b) => a.year.localeCompare(b.year))
  }, [items, yearlyTimeline])

  const maxCount = Math.max(...yearData.map((d) => d.count), 1)

  // SVG chart dimensions
  const svgW = 400
  const svgH = compact ? 200 : 140
  const padX = 30
  const padTop = 24
  const padBot = 28
  const chartW = svgW - padX * 2
  const chartH = svgH - padTop - padBot

  const points = yearData.map((d, i) => {
    const x = yearData.length === 1
      ? svgW / 2
      : padX + (i / (yearData.length - 1)) * chartW
    const y = padTop + chartH - (d.count / maxCount) * chartH
    return { x, y, ...d, isLatest: i === yearData.length - 1 }
  })

  // Build smooth path
  const linePath = points.length > 0
    ? points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")
    : ""

  // Area path (fill beneath line)
  const areaPath = points.length > 0
    ? `${linePath} L ${points[points.length - 1].x} ${padTop + chartH} L ${points[0].x} ${padTop + chartH} Z`
    : ""

  // Grid lines
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
    y: padTop + chartH * (1 - ratio),
    value: Math.round(maxCount * ratio),
  }))

  return (
    <div className="showcase-panel h-full flex flex-col p-5">
      <div className="section-kicker mb-2">{t("showcase.timeline.kicker")}</div>

      <div className="flex-1 min-h-0 flex flex-col justify-center">
        <svg
          viewBox={`0 0 ${svgW} ${svgH}`}
          className="w-full h-auto"
          preserveAspectRatio="xMidYMid meet"
          style={{ maxHeight: "100%" }}
        >
          <defs>
            {/* Glow filter for the line */}
            <filter id="line-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Stronger glow for latest point */}
            <filter id="dot-glow" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Gradient fill under the line */}
            <linearGradient id="area-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.25" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
            </linearGradient>
          </defs>

          {/* Background grid lines */}
          {gridLines.map((g, i) => (
            <g key={i}>
              <line
                x1={padX}
                y1={g.y}
                x2={svgW - padX}
                y2={g.y}
                stroke="var(--line)"
                strokeWidth="0.5"
                strokeDasharray={i === 0 ? "none" : "2 4"}
              />
              <text
                x={padX - 6}
                y={g.y + 3}
                fill="var(--muted)"
                fontSize="7"
                textAnchor="end"
                fontFamily="JetBrains Mono, monospace"
              >
                {g.value}
              </text>
            </g>
          ))}

          {/* Area fill */}
          {areaPath && (
            <path
              d={areaPath}
              fill="url(#area-fill)"
              opacity="0.8"
            />
          )}

          {/* Main glowing line */}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke="var(--accent)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#line-glow)"
            />
          )}

          {/* Data points */}
          {points.map((p) => (
            <g key={p.year}>
              {/* Outer glow ring */}
              <circle
                cx={p.x}
                cy={p.y}
                r={p.isLatest ? 8 : 5}
                fill="none"
                stroke={p.isLatest ? "var(--accent-deep)" : "var(--accent)"}
                strokeWidth="0.5"
                opacity={p.isLatest ? 0.6 : 0.3}
              >
                {p.isLatest && (
                  <animate
                    attributeName="r"
                    values="8;12;8"
                    dur="2s"
                    repeatCount="indefinite"
                  />
                )}
                {p.isLatest && (
                  <animate
                    attributeName="opacity"
                    values="0.6;0.2;0.6"
                    dur="2s"
                    repeatCount="indefinite"
                  />
                )}
              </circle>

              {/* Core dot */}
              <circle
                cx={p.x}
                cy={p.y}
                r={p.isLatest ? 4 : 3}
                fill={p.isLatest ? "var(--accent-deep)" : "var(--accent)"}
                filter={p.isLatest ? "url(#dot-glow)" : "none"}
              >
                {p.isLatest && (
                  <animate
                    attributeName="r"
                    values="4;5;4"
                    dur="1.5s"
                    repeatCount="indefinite"
                  />
                )}
              </circle>

              {/* Count label */}
              <text
                x={p.x}
                y={p.y - (p.isLatest ? 14 : 10)}
                fill={p.isLatest ? "var(--accent-deep)" : "var(--accent)"}
                fontSize={p.isLatest ? "11" : "9"}
                fontWeight={p.isLatest ? "bold" : "normal"}
                textAnchor="middle"
                fontFamily="Syne, sans-serif"
                filter={p.isLatest ? "url(#line-glow)" : "none"}
              >
                {p.count}
              </text>

              {/* Year label */}
              <text
                x={p.x}
                y={padTop + chartH + 16}
                fill={p.isLatest ? "var(--accent-deep)" : "var(--muted)"}
                fontSize="9"
                fontWeight={p.isLatest ? "bold" : "normal"}
                textAnchor="middle"
                fontFamily="JetBrains Mono, monospace"
              >
                {p.year}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  )
}
