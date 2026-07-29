import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts"
import { useI18nStore } from "../../stores/i18nStore"
import type { AnalyticsData } from "../../types/analytics"

interface Props {
  data: AnalyticsData["sourceBreakdown"]
}

const MOVIE_COLORS = ["#d4ff00", "#aaff00", "#88dd00", "#66bb00", "#448800"]
const GAME_COLORS = ["#ff4400", "#ff6633", "#ff8866", "#ffaa99", "#ffccbb"]
const TV_COLORS = ["#00d4ff", "#33ddff", "#66e6ff", "#99eeff", "#ccf7ff"]

function MiniPie({
  title,
  items,
  colors,
}: {
  title: string
  items: Array<{ label: string; count: number }>
  colors: string[]
}) {
  const total = items.reduce((s, i) => s + i.count, 0)

  return (
    <div className="flex flex-col items-center">
      <div className="text-[10px] uppercase tracking-widest mb-2" style={{ color: "var(--muted)" }}>
        {title}
      </div>
      <div style={{ width: 180, height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={items}
              dataKey="count"
              nameKey="label"
              cx="50%"
              cy="50%"
              outerRadius={70}
              innerRadius={35}
              strokeWidth={1}
              stroke="rgba(0,0,0,0.5)"
            >
              {items.map((_, i) => (
                <Cell key={i} fill={colors[i % colors.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid rgba(212,255,0,0.3)",
                borderRadius: 0,
                fontSize: 11,
                fontFamily: "JetBrains Mono",
                color: "var(--ink)",
              }}
              formatter={(value) => `${value} (${total > 0 ? Math.round((Number(value) / total) * 100) : 0}%)`}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
        {items.map((item, i) => (
          <div key={item.label} className="flex items-center gap-1.5 text-[10px]">
            <div className="w-2 h-2 shrink-0" style={{ background: colors[i % colors.length] }} />
            <span style={{ color: "var(--muted)" }}>{item.label}</span>
            <span className="font-bold ml-auto" style={{ color: "var(--ink)" }}>{item.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function SourcePieChart({ data }: Props) {
  const { t } = useI18nStore()

  return (
    <div className="showcase-panel p-5">
      <div className="section-kicker mb-4">{t("analytics.source.title")}</div>
      <div className="flex justify-around">
        <MiniPie title={t("analytics.source.movies")} items={data.movies} colors={MOVIE_COLORS} />
        <MiniPie title={t("analytics.source.tvshows")} items={data.tvShows} colors={TV_COLORS} />
        <MiniPie title={t("analytics.source.game_profiles")} items={data.games} colors={GAME_COLORS} />
      </div>
    </div>
  )
}
