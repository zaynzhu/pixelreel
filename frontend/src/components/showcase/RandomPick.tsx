import { useState, useEffect, useCallback } from "react"
import type { LibraryRecord } from "../../types/library"
import { useI18nStore } from "../../stores/i18nStore"
import { ImgWithFallback } from "../ImgWithFallback"
import { StarRating } from "../StarRating"
import TimelinePopup from "../TimelinePopup"
import { apiFetch } from "../../api"

interface RandomPickProps {
  compact?: boolean
}

export function RandomPick({ compact }: RandomPickProps) {
  const { t } = useI18nStore()
  const [record, setRecord] = useState<LibraryRecord | null>(null)
  const [selectedRecord, setSelectedRecord] = useState<LibraryRecord | null>(null)

  const fetchRandom = useCallback(async () => {
    try {
      const data = await apiFetch<LibraryRecord>("/library/random")
      setRecord(data)
    } catch {
      setRecord(null)
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
        <div className="section-kicker mb-3">{t("showcase.random.kicker")}</div>

        {record ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div
              className="showcase-poster group"
              style={{
                width: compact ? 120 : 140,
                height: compact ? 168 : 196,
                borderColor: "var(--accent)",
              }}
              onClick={() => setSelectedRecord(record)}
            >
              {record.posterUrl ? (
                <ImgWithFallback
                  src={record.posterUrl}
                  alt={record.title}
                  className="w-full h-full object-cover grayscale opacity-60 group-hover:grayscale-0 group-hover:opacity-100 transition-all duration-300"
                  fallback={<div className="w-full h-full flex items-center justify-center text-xs" style={{ background: "var(--surface-hover)", color: "var(--muted)" }}>{record.title}</div>}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs" style={{ background: "var(--surface-hover)", color: "var(--muted)" }}>
                  {record.title}
                </div>
              )}
            </div>

            <div className="text-center">
              <div className="text-sm font-display font-bold" style={{ color: "var(--ink)" }}>
                {record.title}
              </div>
              {record.rating != null && (
                <div className="flex items-center justify-center gap-1 mt-1">
                  <StarRating value={record.rating} />
                  <span className="text-xs ml-1" style={{ color: "var(--muted)" }}>
                    {record.rating} / 5
                  </span>
                </div>
              )}
            </div>

            <button
              className="brutal-btn-accent text-xs px-4 py-2"
              onClick={fetchRandom}
            >
              {t("showcase.random.btn")}
            </button>
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
