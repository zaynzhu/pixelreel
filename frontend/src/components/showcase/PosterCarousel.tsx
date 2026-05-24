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

  const batchSize = compact ? 15 : 8
  const cols = compact ? 5 : 4
  const rows = compact ? 3 : 2
  const totalBatches = Math.ceil(items.length / batchSize) || 1

  useEffect(() => {
    const timer = setInterval(() => {
      setBatchIndex((prev) => (prev + 1) % totalBatches)
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
          <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--muted)" }}>
            {t("showcase.posters.auto_rotate")}
          </div>
        </div>

        <div
          className="flex-1 grid gap-2"
          style={{
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gridTemplateRows: `repeat(${rows}, 1fr)`,
          }}
        >
          {batch.map((item) => (
            <div
              key={`${item.category}-${item.id}`}
              className="showcase-poster group"
              onClick={() => handlePosterClick(item)}
            >
              {item.posterUrl ? (
                <ImgWithFallback
                  src={item.posterUrl}
                  alt={item.title}
                  className="w-full h-full object-cover grayscale opacity-60 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-300"
                  fallback={<PosterPlaceholder title={item.title} />}
                />
              ) : (
                <PosterPlaceholder title={item.title} />
              )}
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
