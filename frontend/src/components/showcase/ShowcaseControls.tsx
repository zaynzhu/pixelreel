import { useI18nStore } from "../../stores/i18nStore"

interface ShowcaseControlsProps {
  mode: "grid" | "slideshow"
  onToggleMode: () => void
  currentSlide?: number
  totalSlides?: number
  onJumpToSlide?: (index: number) => void
}

export function ShowcaseControls({
  mode,
  onToggleMode,
  currentSlide = 0,
  totalSlides = 4,
  onJumpToSlide,
}: ShowcaseControlsProps) {
  const { t } = useI18nStore()

  return (
    <div className="flex items-center gap-4">
      {mode === "slideshow" && (
        <div className="flex gap-2">
          {Array.from({ length: totalSlides }).map((_, i) => (
            <button
              key={i}
              className="w-2 h-2 rounded-full transition-all duration-300 hover-glitch"
              style={{
                background: i === currentSlide ? "var(--accent)" : "var(--line)",
                boxShadow: i === currentSlide ? "0 0 8px rgba(212,255,0,0.5)" : "none",
              }}
              onClick={() => onJumpToSlide?.(i)}
            />
          ))}
        </div>
      )}

      <button
        className="brutal-btn text-[10px] px-3 py-1.5 uppercase tracking-wider hover-glitch"
        onClick={onToggleMode}
        title={mode === "grid" ? t("showcase.mode.slideshow") : t("showcase.mode.grid")}
      >
        {mode === "grid" ? "⛶" : "⊞"}
      </button>
    </div>
  )
}
