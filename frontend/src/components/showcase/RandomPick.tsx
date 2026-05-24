import { useState, useEffect, useCallback } from "react"
import type { LibraryRecord } from "../../types/library"
import { useI18nStore } from "../../stores/i18nStore"
import { ImgWithFallback } from "../ImgWithFallback"
import TimelinePopup from "../TimelinePopup"
import { apiFetch } from "../../api"

interface RandomPickProps {
  compact?: boolean
}

export function RandomPick({ compact }: RandomPickProps) {
  const { t } = useI18nStore()
  const [records, setRecords] = useState<LibraryRecord[]>([])
  const [selectedRecord, setSelectedRecord] = useState<LibraryRecord | null>(null)

  const fetchRandom = useCallback(async () => {
    try {
      const limit = compact ? 5 : 5
      const data = await apiFetch<LibraryRecord[] | LibraryRecord>(`/library/random?limit=${limit}`)
      setRecords(Array.isArray(data) ? data : [data])
    } catch {
      setRecords([])
    }
  }, [compact])

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
            className="text-[10px] uppercase tracking-wider hover:underline cursor-pointer"
            style={{ color: "var(--accent)" }}
            onClick={fetchRandom}
          >
            {t("showcase.random.btn")}
          </button>
        </div>

        {records.length > 0 ? (
          <div className="flex-1 flex items-center gap-3 min-h-0">
            {records.map((record) => (
              <div
                key={`${record.category}-${record.id}`}
                className="flex-1 flex flex-col items-center gap-2 min-w-0"
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
                      className="w-full h-full object-cover grayscale opacity-60 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-300"
                      fallback={<PosterPlaceholder title={record.title} />}
                    />
                  ) : (
                    <PosterPlaceholder title={record.title} />
                  )}
                </div>

                <div className="text-center w-full">
                  <div className="text-[11px] font-display font-bold truncate" style={{ color: "var(--ink)" }}>
                    {record.title}
                  </div>
                  {record.rating != null && (
                    <div className="text-[10px] mt-0.5" style={{ color: "var(--muted)" }}>
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

      <TimelinePopup record={selectedRecord} onClose={() => setSelectedRecord(null)} />
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
