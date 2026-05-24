import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts"
import { useI18nStore } from "../../stores/i18nStore"
import type { AnalyticsData } from "../../types/analytics"

interface Props {
  data: AnalyticsData["monthlyCompletion"]
}

const COLORS = {
  movies: "#d4ff00",
  games: "#ff4400",
  tvShows: "#00d4ff",
}

export function MonthlyChart({ data }: Props) {
  const { t } = useI18nStore()

  return (
    <div className="showcase-panel p-5">
      <div className="section-kicker mb-4">{t("analytics.monthly.title")}</div>
      <div style={{ height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="month"
              tick={{ fill: "#888", fontSize: 10, fontFamily: "JetBrains Mono" }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#888", fontSize: 10, fontFamily: "JetBrains Mono" }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                background: "var(--surface)",
                border: "1px solid rgba(212,255,0,0.3)",
                borderRadius: 0,
                fontSize: 11,
                fontFamily: "JetBrains Mono",
                color: "var(--ink)",
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 10, fontFamily: "JetBrains Mono" }}
            />
            <Bar dataKey="movies" name={t("analytics.source.movies")} stackId="a" fill={COLORS.movies} radius={[0, 0, 0, 0]} />
            <Bar dataKey="tvShows" name={t("analytics.source.tvshows")} stackId="a" fill={COLORS.tvShows} />
            <Bar dataKey="games" name={t("analytics.source.games")} stackId="a" fill={COLORS.games} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
