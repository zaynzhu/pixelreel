import { useState, useEffect, useCallback } from "react"
import type { LibraryRecord } from "../../types/library"
import type { TimelineRecord } from "../../types/timeline"
import { useI18nStore } from "../../stores/i18nStore"
import { ImgWithFallback } from "../ImgWithFallback"
import TimelinePopup from "../TimelinePopup"
import { apiFetch } from "../../api"

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

interface RandomPickProps {
  compact?: boolean
}

export function RandomPick({ compact }: RandomPickProps) {
  const { t } = useI18nStore()
  const [records, setRecords] = useState<LibraryRecord[]>([])
  const [selectedRecord, setSelectedRecord] = useState<LibraryRecord | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const fetchRandom = useCallback(async () => {
    try {
      const data = await apiFetch<LibraryRecord[] | LibraryRecord>("/library/random?limit=5")
      setRecords(Array.isArray(data) ? data : [data])
      setRefreshKey((k) => k + 1)
    } catch {
      setRecords([])
    }
  }, [])

  useEffect(() => {
    void fetchRandom()
  }, [fetchRandom])

  useEffect(() => {
    if (!compact) {
      const timer = setInterval(() => {
        void fetchRandom()
      }, 10000)
      return () => clearInterval(timer)
    }
  }, [compact, fetchRandom])

  return (
    <>
      <div className="showcase-panel h-full flex flex-col p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="section-kicker">{t("showcase.random.kicker")}</div>
          <button
            className="text-[10px] uppercase tracking-wider cursor-pointer px-2 py-0.5"
            style={{
              color: "var(--accent)",
              border: "1px solid rgba(212,255,0,0.3)",
              background: "rgba(212,255,0,0.05)",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(212,255,0,0.15)"
              e.currentTarget.style.borderColor = "rgba(212,255,0,0.6)"
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(212,255,0,0.05)"
              e.currentTarget.style.borderColor = "rgba(212,255,0,0.3)"
            }}
            onClick={fetchRandom}
          >
            {t("showcase.random.btn")}
          </button>
        </div>

        {records.length > 0 ? (
          <div className="flex-1 flex items-center gap-2 min-h-0" key={refreshKey}>
            {records.map((record, i) => (
              <div
                key={`${record.category}-${record.id}`}
                className="flex-1 flex flex-col items-center gap-1.5 min-w-0"
                style={{ animation: `poster-enter 0.35s ease-out ${i * 60}ms both` }}
              >
                <div
                  className="showcase-poster group w-full"
                  style={{
                    aspectRatio: "2/3",
                    borderColor: "var(--accent)",
                  }}
                  onClick={() => setSelectedRecord(record)}
                >
                  {record.posterUrl ? (
                    <ImgWithFallback
                      src={record.posterUrl}
                      alt={record.title}
                      className="w-full h-full object-cover grayscale opacity-50 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-300 group-hover:scale-105"
                      fallback={<PosterPlaceholder title={record.title} />}
                    />
                  ) : (
                    <PosterPlaceholder title={record.title} />
                  )}
                </div>

                <div className="text-center w-full">
                  <div className="text-[10px] font-display font-bold truncate" style={{ color: "var(--ink)" }}>
                    {record.title}
                  </div>
                  {record.rating != null && (
                    <div className="text-[9px] mt-0.5" style={{ color: "var(--accent)" }}>
                      {record.rating}/5
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-sm uppercase tracking-wider" style={{ color: "var(--muted)" }}>
              {t("showcase.random.empty")}
            </div>
          </div>
        )}
      </div>

      <TimelinePopup
        lightweightRecord={selectedRecord ? toLightweight(selectedRecord) : null}
        fullRecord={selectedRecord}
        loading={false}
        error={null}
        onClose={() => setSelectedRecord(null)}
      />
    </>
  )
}

function PosterPlaceholder({ title }: { title: string }) {
  return (
    <div
      className="w-full h-full flex items-center justify-center text-[10px] uppercase tracking-wider text-center p-2"
      style={{ background: "var(--surface-hover)", color: "var(--muted)" }}
    >
      {title}
    </div>
  )
}
