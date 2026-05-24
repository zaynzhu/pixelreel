import { useState, useEffect } from "react"
import type { RecentRecordItem } from "../../types/profile"
import type { LibraryRecord } from "../../types/library"
import { useI18nStore } from "../../stores/i18nStore"
import { ImgWithFallback } from "../ImgWithFallback"
import TimelinePopup from "../TimelinePopup"

interface PosterCarouselProps {
  items: RecentRecordItem[]
  compact?: boolean
}

export function PosterCarousel({ items, compact }: PosterCarouselProps) {
  const { t } = useI18nStore()
  const [batchIndex, setBatchIndex] = useState(0)
  const [selectedRecord, setSelectedRecord] = useState<LibraryRecord | null>(null)
  const [transitionKey, setTransitionKey] = useState(0)

  const batchSize = compact ? 15 : 15
  const cols = compact ? 5 : 5
  const rows = compact ? 3 : 3
  const totalBatches = Math.ceil(items.length / batchSize) || 1

  useEffect(() => {
    const timer = setInterval(() => {
      setBatchIndex((prev) => {
        const next = (prev + 1) % totalBatches
        return next
      })
      setTransitionKey((k) => k + 1)
    }, 5000)
    return () => clearInterval(timer)
  }, [totalBatches])

  const batch = items.slice(batchIndex * batchSize, batchIndex * batchSize + batchSize)

  const handlePosterClick = (item: RecentRecordItem) => {
    const record = {
      id: item.id,
      category: item.category,
      title: item.title,
      posterUrl: item.posterUrl ?? null,
      status: item.status,
      rating: item.rating ?? null,
      createdAt: item.createdAt,
      updatedAt: item.createdAt,
    } as LibraryRecord
    setSelectedRecord(record)
  }

  return (
    <>
      <div className="showcase-panel h-full flex flex-col p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="section-kicker">{t("showcase.posters.kicker")}</div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full" style={{
              background: "var(--accent)",
              boxShadow: "0 0 6px rgba(212,255,0,0.6)",
              animation: "glow-pulse 2s ease-in-out infinite",
            }} />
            <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--muted)" }}>
              {t("showcase.posters.auto_rotate")}
            </div>
          </div>
        </div>

        <div
          className="flex-1 grid gap-1.5"
          style={{
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gridTemplateRows: `repeat(${rows}, 1fr)`,
          }}
          key={transitionKey}
        >
          {batch.map((item, i) => (
            <div
              key={`${item.category}-${item.id}`}
              className="showcase-poster group"
              style={{
                animation: `poster-enter 0.4s ease-out ${i * 30}ms both`,
              }}
              onClick={() => handlePosterClick(item)}
            >
              {item.posterUrl ? (
                <ImgWithFallback
                  src={item.posterUrl}
                  alt={item.title}
                  className="w-full h-full object-cover grayscale opacity-50 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-300 group-hover:scale-105"
                  fallback={<PosterPlaceholder title={item.title} />}
                />
              ) : (
                <PosterPlaceholder title={item.title} />
              )}

              {/* Hover 扫描线扫过效果 */}
              <div
                className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100"
                style={{
                  background: "linear-gradient(180deg, transparent 0%, rgba(212,255,0,0.08) 50%, transparent 100%)",
                  animation: "scanline-sweep 1.5s ease-in-out infinite",
                }}
              />
            </div>
          ))}
        </div>
      </div>

      <TimelinePopup record={selectedRecord} onClose={() => setSelectedRecord(null)} />
    </>
  )
}

function PosterPlaceholder({ title }: { title: string }) {
  return (
    <div
      className="w-full h-full flex items-center justify-center text-xs uppercase tracking-wider text-center p-2"
      style={{ background: "var(--surface-hover)", color: "var(--muted)" }}
    >
      {title}
    </div>
  )
}
