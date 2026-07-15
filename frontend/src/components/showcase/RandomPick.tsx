import { useState, useEffect, useCallback, useRef } from "react"
import type { LibraryCategory, LibraryRecord, RecordStatus } from "../../types/library"
import type { TimelineRecord } from "../../types/timeline"
import { useI18nStore } from "../../stores/i18nStore"
import { useTimelineDetailStore } from "../../stores/timelineDetailStore"
import { ImgWithFallback } from "../ImgWithFallback"
import TimelinePopup from "../TimelinePopup"
import { apiFetch } from "../../api"

const RANDOM_PICK_LIMIT = 10
type RandomCategory = "all" | LibraryCategory
type RandomStatus = "all" | Extract<RecordStatus, "WANT" | "IN_PROGRESS">

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
  const { fetchDetail, cache: detailCache, loading: detailLoading, errors: detailErrors } = useTimelineDetailStore()
  const [records, setRecords] = useState<LibraryRecord[]>([])
  const [selectedRecord, setSelectedRecord] = useState<LibraryRecord | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [category, setCategory] = useState<RandomCategory>("all")
  const [status, setStatus] = useState<RandomStatus>("all")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestIdRef = useRef(0)

  const fetchRandom = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({
        limit: String(RANDOM_PICK_LIMIT),
        t: String(Date.now()),
      })
      if (category !== "all") params.set("category", category)
      if (status !== "all") params.set("status", status)
      const data = await apiFetch<LibraryRecord[] | LibraryRecord>(
        `/library/random?${params.toString()}`,
        { cache: "no-store" },
      )
      if (requestId !== requestIdRef.current) return
      setRecords(Array.isArray(data) ? data : [data])
      setRefreshKey((k) => k + 1)
    } catch (reason) {
      if (requestId !== requestIdRef.current) return
      setError(reason instanceof Error ? reason.message : t("showcase.random.error"))
    } finally {
      if (requestId === requestIdRef.current) setLoading(false)
    }
  }, [category, status, t])

  useEffect(() => {
    setRecords([])
    void fetchRandom()
    return () => {
      requestIdRef.current += 1
    }
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
      <div className="showcase-panel flex h-full min-h-0 flex-col overflow-hidden p-5">
        <div className="mb-2 flex shrink-0 items-center justify-between">
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
            disabled={loading}
          >
            {loading ? t("showcase.random.loading") : t("showcase.random.btn")}
          </button>
        </div>

        <div className="mb-3 grid shrink-0 grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-y border-[var(--line)] bg-black/20 px-2 py-1.5">
          <span className="font-mono text-[8px] uppercase tracking-widest text-[var(--muted)]">
            {t("showcase.random.from")}
          </span>
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value as RandomCategory)}
            aria-label={t("showcase.random.category")}
            className="min-w-0 border-0 bg-transparent py-0.5 font-mono text-[9px] font-bold uppercase text-[var(--accent)] outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
          >
            <option value="all">{t("showcase.random.category.all")}</option>
            <option value="movie">{t("showcase.random.category.movie")}</option>
            <option value="tv_show">{t("showcase.random.category.tv")}</option>
            <option value="game">{t("showcase.random.category.game")}</option>
          </select>
          <span className="font-mono text-[8px] uppercase tracking-widest text-[var(--muted)]">
            {t("showcase.random.with")}
          </span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as RandomStatus)}
            aria-label={t("showcase.random.status")}
            className="min-w-0 border-0 bg-transparent py-0.5 font-mono text-[9px] font-bold uppercase text-[var(--accent)] outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
          >
            <option value="all">{t("showcase.random.status.all")}</option>
            <option value="WANT">{t("global.status.want")}</option>
            <option value="IN_PROGRESS">{t("global.status.active")}</option>
          </select>
        </div>

        {error ? (
          <div
            role="alert"
            className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 border border-[var(--accent-deep)] bg-[rgba(255,68,0,0.06)] px-4 text-center"
          >
            <div className="font-display text-sm uppercase tracking-wider text-[var(--accent-deep)]">
              {t("showcase.random.error")}
            </div>
            <p className="max-w-sm break-words font-mono text-[9px] leading-4 text-[var(--muted)]">
              {error}
            </p>
            <button type="button" onClick={() => void fetchRandom()} disabled={loading} className="brutal-btn px-3 py-1 text-[9px]">
              {loading ? t("showcase.random.loading") : t("showcase.random.retry")}
            </button>
          </div>
        ) : records.length > 0 ? (
          <div className="grid min-h-0 flex-1 grid-cols-5 grid-rows-2 gap-2 overflow-hidden" key={refreshKey}>
            {records.map((record, i) => (
              <div
                key={`${record.category}-${record.id}`}
                className="flex min-h-0 min-w-0 flex-col items-center gap-1"
                style={{ animation: `poster-enter 0.35s ease-out ${i * 60}ms both` }}
              >
                <div
                  className="showcase-poster group min-h-0 w-full flex-1"
                  style={{
                    borderColor: "var(--accent)",
                  }}
                  onClick={() => {
                    setSelectedRecord(record)
                    void fetchDetail(record.category, record.id)
                  }}
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

                <div className="w-full shrink-0 text-center">
                  <div className="truncate text-[9px] font-display font-bold" style={{ color: "var(--ink)" }}>
                    {record.title}
                  </div>
                  {record.rating != null && (
                    <div className="mt-0.5 text-[8px]" style={{ color: "var(--accent)" }}>
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
              {loading
                ? t("showcase.random.loading")
                : category === "all" && status === "all"
                  ? t("showcase.random.empty")
                  : t("showcase.random.empty_filtered")}
            </div>
          </div>
        )}
      </div>

      <TimelinePopup
        lightweightRecord={selectedRecord ? toLightweight(selectedRecord) : null}
        fullRecord={selectedRecord ? detailCache[`${selectedRecord.category}:${selectedRecord.id}`] ?? null : null}
        loading={selectedRecord ? detailLoading[`${selectedRecord.category}:${selectedRecord.id}`] ?? false : false}
        error={selectedRecord ? detailErrors[`${selectedRecord.category}:${selectedRecord.id}`] ?? null : null}
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
