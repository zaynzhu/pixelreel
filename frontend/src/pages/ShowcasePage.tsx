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
          {t("showcase.loading")}
        </div>
      </div>
    )
  }

  if (error || !summary) {
    return (
      <div className="showcase-bg flex min-h-[60vh] items-center justify-center">
        <div role="alert" className="showcase-panel w-full max-w-xl border-[var(--accent-deep)] p-6 sm:p-8">
          <span className="font-mono text-[9px] uppercase tracking-[0.24em] text-[var(--accent-deep)]">
            {t("showcase.error.kicker")}
          </span>
          <h1 className="mt-2 font-display text-2xl text-white">{t("showcase.error.title")}</h1>
          <p className="mt-3 break-all text-xs leading-6 text-[var(--muted)]">
            {error || t("showcase.error.empty")}
          </p>
          <button type="button" onClick={() => void fetchSummary()} className="brutal-btn-accent mt-6">
            {t("showcase.error.retry")}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="showcase-bg flex min-h-[680px] flex-col">
      {/* 顶部控制栏 */}
      <div className="flex items-center justify-between mb-4 relative z-10">
        <div>
          <div className="section-kicker">{t("showcase.kicker")}</div>
          <h1 className="text-2xl font-display font-bold tracking-tight flex items-center gap-3" style={{ color: "var(--ink)" }}>
            {t("showcase.title")}
            <span className="inline-block w-16 h-px" style={{
              background: "linear-gradient(to right, var(--accent), transparent)",
              boxShadow: "0 0 8px rgba(212,255,0,0.3)",
            }} />
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
        <div className="relative z-10 flex flex-1 flex-col gap-4 overflow-visible">
          {/* 顶部：统计横条 */}
          <StatsPanel summary={summary} />

          {/* 底部：海报 + 时间线/随机 */}
          <div className="flex min-h-[560px] flex-1 gap-4">
            {/* 左侧海报墙 60% */}
            <div className="h-full min-h-0 w-[60%] min-w-0 overflow-hidden">
              <PosterCarousel items={summary.recentItems} />
            </div>

            {/* 右侧 40%：时间线 + 随机推荐堆叠 */}
            <div className="flex min-h-0 w-[40%] min-w-0 flex-col gap-4 overflow-hidden">
              <div className="flex-1 min-h-0">
                <TimelineMini items={summary.recentItems} yearlyTimeline={summary.yearlyTimeline} />
              </div>
              <div className="h-[300px] min-h-[260px]">
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
            {SLIDES[currentSlide] === "timeline" && <TimelineMini items={summary.recentItems} yearlyTimeline={summary.yearlyTimeline} compact />}
            {SLIDES[currentSlide] === "random" && <RandomPick compact />}
          </div>
        </div>
      )}
    </div>
  )
}
