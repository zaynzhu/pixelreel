import { ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from "recharts"
import { useI18nStore } from "../../stores/i18nStore"
import type { AnalyticsData } from "../../types/analytics"

interface Props {
  data: AnalyticsData["crossPlatformRatings"]
}

export function CrossPlatformChart({ data }: Props) {
  const { t } = useI18nStore()

  if (data.length === 0) {
    return (
      <div className="showcase-panel p-5">
        <div className="section-kicker mb-4">{t("analytics.cross.title")}</div>
        <div className="flex items-center justify-center h-[200px]">
          <span className="text-xs uppercase tracking-widest" style={{ color: "var(--muted)" }}>
            {t("analytics.cross.empty")}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="showcase-panel p-5">
      <div className="section-kicker mb-4">{t("analytics.cross.title")}</div>
      <div style={{ height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis
              dataKey="doubanRating"
              name={t("analytics.cross.douban")}
              domain={[0, 5]}
              tick={{ fill: "#888", fontSize: 10, fontFamily: "JetBrains Mono" }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }}
              tickLine={false}
              label={{ value: t("analytics.cross.douban"), position: "bottom", fill: "#888", fontSize: 10, fontFamily: "JetBrains Mono" }}
            />
            <YAxis
              dataKey="tmdbRating"
              name={t("analytics.cross.tmdb")}
              domain={[0, 5]}
              tick={{ fill: "#888", fontSize: 10, fontFamily: "JetBrains Mono" }}
              axisLine={{ stroke: "rgba(255,255,255,0.15)" }}
              tickLine={false}
              label={{ value: t("analytics.cross.tmdb"), angle: -90, position: "insideLeft", fill: "#888", fontSize: 10, fontFamily: "JetBrains Mono" }}
            />
            <ZAxis
              dataKey="count"
              name={t("analytics.cross.count")}
              range={[35, 180]}
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
              formatter={(value, name) => [
                String(name) === t("analytics.cross.count") ? Number(value).toFixed(0) : Number(value).toFixed(1),
                String(name),
              ]}
              labelFormatter={() => ""}
            />
            <ReferenceLine
              segment={[{ x: 0, y: 0 }, { x: 5, y: 5 }]}
              stroke="rgba(212,255,0,0.2)"
              strokeDasharray="6 3"
            />
            <Scatter
              data={data}
              fill="#d4ff00"
              opacity={0.7}
              name=""
            >
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
