import { useState, useEffect, useCallback } from "react"
import { useProfileStore } from "../stores/profileStore"
import { useI18nStore } from "../stores/i18nStore"
import { StatsPanel } from "../components/showcase/StatsPanel"
import { PosterCarousel } from "../components/showcase/PosterCarousel"
import { TimelineMini } from "../components/showcase/TimelineMini"
import { RandomPick } from "../components/showcase/RandomPick"
import { ShowcaseControls } from "../components/showcase/ShowcaseControls"

const SLIDES = ["stats", "posters", "timeline", "random"] as const
const SLIDE_INTERVAL = 10000

export default function ShowcasePage() {
  const { summary, loading, error, fetchSummary } = useProfileStore()
  const { t } = useI18nStore()
  const [mode, setMode] = useState<"grid" | "slideshow">("grid")
  const [currentSlide, setCurrentSlide] = useState(0)

  useEffect(() => {
    void fetchSummary()
  }, [fetchSummary])

  useEffect(() => {
    if (mode !== "slideshow") return
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % SLIDES.length)
    }, SLIDE_INTERVAL)
    return () => clearInterval(timer)
  }, [mode])

  useEffect(() => {
    if (mode !== "slideshow") return
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMode("grid")
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [mode])

  const toggleMode = useCallback(() => {
    setMode((prev) => (prev === "grid" ? "slideshow" : "grid"))
    setCurrentSlide(0)
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-sm uppercase tracking-widest animate-pulse" style={{ color: "var(--accent)" }}>
          LOADING...
        </div>
      </div>
    )
  }

  if (error || !summary) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-sm uppercase tracking-widest" style={{ color: "var(--accent-deep)" }}>
          ERROR: {error || "No data"}
        </div>
      </div>
    )
  }

  return (
    <div className="showcase-bg flex flex-col h-[calc(100vh-80px)]">
      {/* 顶部控制栏 */}
      <div className="flex items-center justify-between mb-4 relative z-10">
        <div>
          <div className="section-kicker">{t("showcase.kicker")}</div>
          <h1 className="text-2xl font-display font-bold tracking-tight" style={{ color: "var(--ink)" }}>
            {t("showcase.title")}
          </h1>
        </div>
        <ShowcaseControls
          mode={mode}
          onToggleMode={toggleMode}
          currentSlide={currentSlide}
          totalSlides={SLIDES.length}
          onJumpToSlide={setCurrentSlide}
        />
      </div>

      {/* 内容区域 */}
      {mode === "grid" ? (
        <div className="flex-1 flex flex-col gap-4 min-h-0 relative z-10">
          {/* 顶部：统计横条 */}
          <StatsPanel summary={summary} />

          {/* 底部：海报 + 时间线/随机 */}
          <div className="flex-1 flex gap-4 min-h-0">
            {/* 左侧海报墙 60% */}
            <div className="w-[60%] min-w-0">
              <PosterCarousel items={summary.recentItems} />
            </div>

            {/* 右侧 40%：时间线 + 随机推荐堆叠 */}
            <div className="w-[40%] min-w-0 flex flex-col gap-4">
              <div className="flex-1 min-h-0">
                <TimelineMini items={summary.recentItems} />
              </div>
              <div className="h-[200px]">
                <RandomPick />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 relative min-h-0 z-10 showcase-panel">
          <div className="absolute inset-0 transition-all duration-500" style={{ opacity: 1, transform: "scale(1)" }}>
            {SLIDES[currentSlide] === "stats" && <StatsPanel summary={summary} compact />}
            {SLIDES[currentSlide] === "posters" && <PosterCarousel items={summary.recentItems} compact />}
            {SLIDES[currentSlide] === "timeline" && <TimelineMini items={summary.recentItems} compact />}
            {SLIDES[currentSlide] === "random" && <RandomPick compact />}
          </div>
        </div>
      )}
    </div>
  )
}
