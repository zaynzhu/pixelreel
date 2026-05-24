import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts"
import { useI18nStore } from "../../stores/i18nStore"
import type { AnalyticsData } from "../../types/analytics"

interface Props {
  data: AnalyticsData["ratingDistribution"]
}

const COLORS = {
  movies: "#d4ff00",
  games: "#ff4400",
  tvShows: "#00d4ff",
}

export function RatingChart({ data }: Props) {
  const { t } = useI18nStore()

  // 合并三个分类为一个数组
  const merged = [1, 2, 3, 4, 5].map((rating) => {
    const movie = data.movies.find((d) => d.rating === rating)
    const game = data.games.find((d) => d.rating === rating)
    const tvShow = data.tvShows.find((d) => d.rating === rating)
    return {
      rating: `${rating}★`,
      movies: movie?.count ?? 0,
      games: game?.count ?? 0,
      tvShows: tvShow?.count ?? 0,
    }
  })

  return (
    <div className="showcase-panel p-5">
      <div className="section-kicker mb-4">{t("analytics.rating.title")}</div>
      <div style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={merged} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="rating"
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
            <Legend wrapperStyle={{ fontSize: 10, fontFamily: "JetBrains Mono" }} />
            <Bar dataKey="movies" name={t("analytics.source.movies")} fill={COLORS.movies} radius={[2, 2, 0, 0]} />
            <Bar dataKey="tvShows" name={t("analytics.source.tvshows")} fill={COLORS.tvShows} radius={[2, 2, 0, 0]} />
            <Bar dataKey="games" name={t("analytics.source.games")} fill={COLORS.games} radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
