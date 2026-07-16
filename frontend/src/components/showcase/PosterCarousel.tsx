import { useState, useEffect } from "react"
import type { RecentRecordItem } from "../../types/profile"
import type { LibraryRecord } from "../../types/library"
import type { TimelineRecord } from "../../types/timeline"
import { useI18nStore } from "../../stores/i18nStore"
import { useTimelineDetailStore } from "../../stores/timelineDetailStore"
import { ImgWithFallback } from "../ImgWithFallback"
import TimelinePopup from "../TimelinePopup"
import { apiFetch } from "../../api"

const POSTER_BATCH_SIZE = 15

/** Extract lightweight TimelineRecord fields from a full LibraryRecord */
function toLightweight(r: LibraryRecord): TimelineRecord {
  return {
    id: r.id,
    category: r.category,
    title: r.title,
    posterUrl: r.posterUrl ?? null,
    sourceLabel: r.sourceLabel ?? null,
    platformLabel: r.platformLabel ?? null,
    status: r.status,
    rating: r.rating ?? null,
    playtimeMinutes: r.playtimeMinutes ?? null,
    createdAt: r.createdAt,
  }
}

interface PosterCarouselProps {
  items: RecentRecordItem[]
  compact?: boolean
}

export function PosterCarousel({ items, compact }: PosterCarouselProps) {
  const { t } = useI18nStore()
  const { fetchDetail, cache: detailCache, loading: detailLoading, errors: detailErrors } = useTimelineDetailStore()
  const [displayItems, setDisplayItems] = useState<RecentRecordItem[]>(() => items.slice(0, POSTER_BATCH_SIZE))
  const [selectedRecord, setSelectedRecord] = useState<LibraryRecord | null>(null)
  const [transitionKey, setTransitionKey] = useState(0)
  const [rotationError, setRotationError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)

  const cols = compact ? 5 : 5
  const rows = compact ? 3 : 3

  useEffect(() => {
    setDisplayItems(items.slice(0, POSTER_BATCH_SIZE))
  }, [items])

  useEffect(() => {
    let cancelled = false
    let latestBatchRequest = 0

    const fetchRandomBatch = async () => {
      const requestId = ++latestBatchRequest
      try {
        const data = await apiFetch<LibraryRecord[] | LibraryRecord>(
          `/library/random?limit=${POSTER_BATCH_SIZE}&t=${Date.now()}`,
          { cache: "no-store" },
        )
        if (cancelled || requestId !== latestBatchRequest) return
        const records = Array.isArray(data) ? data : [data]
        setDisplayItems(records.map(toRecentItem))
        setRotationError(null)
        setTransitionKey((k) => k + 1)
      } catch (reason) {
        if (cancelled || requestId !== latestBatchRequest) return
        setRotationError(reason instanceof Error ? reason.message : t("showcase.posters.rotation_failed"))
      }
    }

    void fetchRandomBatch()
    const timer = setInterval(() => {
      void fetchRandomBatch()
    }, 5000)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [retryKey, t])

  useEffect(() => {
    if (displayItems.length === 0) return
    const timer = window.setTimeout(() => {
      setTransitionKey((k) => k + 1)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [displayItems])

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
    void fetchDetail(item.category, item.id)
  }

  return (
    <>
      <div className="showcase-panel flex h-full min-h-0 flex-col overflow-hidden p-5">
        <div className="mb-3 flex shrink-0 items-center justify-between">
          <div className="section-kicker">{t("showcase.posters.kicker")}</div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full" style={{
              background: rotationError ? "var(--accent-deep)" : "var(--accent)",
              boxShadow: "0 0 6px rgba(212,255,0,0.6)",
              animation: "glow-pulse 2s ease-in-out infinite",
            }} />
            <div className="text-[10px] uppercase tracking-wider" style={{ color: "var(--muted)" }}>
              {rotationError ? t("showcase.posters.rotation_failed") : t("showcase.posters.auto_rotate")}
            </div>
            {rotationError && (
              <button
                type="button"
                onClick={() => setRetryKey((key) => key + 1)}
                title={rotationError}
                className="text-[10px] font-bold uppercase tracking-wider text-[var(--accent-deep)] hover:text-white"
              >
                {t("showcase.posters.retry")}
              </button>
            )}
          </div>
        </div>

        <div
          className="grid min-h-0 flex-1 gap-1.5 overflow-hidden"
          style={{
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
          }}
          key={transitionKey}
        >
          {displayItems.map((item, i) => (
            <div
              key={`${item.category}-${item.id}`}
              className="showcase-poster group h-full min-h-0 overflow-hidden"
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

      <TimelinePopup
        lightweightRecord={selectedRecord ? toLightweight(selectedRecord) : null}
        fullRecord={selectedRecord ? detailCache[`${selectedRecord.category}:${selectedRecord.id}`] ?? null : null}
        loading={selectedRecord ? detailLoading[`${selectedRecord.category}:${selectedRecord.id}`] ?? false : false}
        error={selectedRecord ? detailErrors[`${selectedRecord.category}:${selectedRecord.id}`] ?? null : null}
        onRetry={() => {
          if (selectedRecord) void fetchDetail(selectedRecord.category, selectedRecord.id)
        }}
        onClose={() => setSelectedRecord(null)}
      />
    </>
  )
}

function toRecentItem(record: LibraryRecord): RecentRecordItem {
  return {
    id: record.id,
    category: record.category,
    title: record.title,
    subtitle: record.sourceLabel,
    posterUrl: record.posterUrl,
    status: record.status,
    rating: record.rating,
    createdAt: record.createdAt,
  }
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
