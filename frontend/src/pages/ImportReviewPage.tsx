import { useCallback, useEffect, useRef, useState } from "react"
import { Check, ChevronRight, EyeOff, Inbox, RefreshCw } from "lucide-react"
import { Link } from "react-router-dom"
import { apiFetch } from "../api"
import { ImgWithFallback } from "../components/ImgWithFallback"
import { proxiedImageUrl } from "../imageProxy"
import { useI18nStore } from "../stores/i18nStore"
import { toast } from "../stores/toastStore"
import type { ImportReviewState, LibraryRecord } from "../types/library"

type ReviewTab = Extract<ImportReviewState, "PENDING" | "IGNORED">
type ReviewDecision = Extract<ImportReviewState, "ACCEPTED" | "IGNORED">

interface ReviewResponse {
  records: LibraryRecord[]
  nextCursor: string | null
  totals?: { total: number }
}

function recordKey(record: LibraryRecord) {
  return `${record.category}:${record.id}`
}

export default function ImportReviewPage() {
  const { t, lang } = useI18nStore()
  const [tab, setTab] = useState<ReviewTab>("PENDING")
  const [records, setRecords] = useState<LibraryRecord[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [deciding, setDeciding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [failedCursor, setFailedCursor] = useState<string | null>(null)
  const tabRef = useRef(tab)
  const latestLoadRequest = useRef(0)
  const latestDecisionRequest = useRef(0)
  const decisionRequestActive = useRef(false)
  tabRef.current = tab

  const loadRecords = useCallback(async (cursor?: string) => {
    const requestTab = tab
    if (requestTab !== tabRef.current) return
    const append = Boolean(cursor)
    const requestId = append ? latestLoadRequest.current : ++latestLoadRequest.current
    if (append) {
      setLoadingMore(true)
    } else {
      setLoading(true)
      setLoadingMore(false)
    }
    setError(null)
    setFailedCursor(null)
    try {
      const params = new URLSearchParams({
        category: "all",
        importReview: tab.toLowerCase(),
        sort: "recent",
        limit: "50",
        includeTotals: append ? "false" : "true",
      })
      if (cursor) params.set("cursor", cursor)
      const response = await apiFetch<ReviewResponse>(`/library?${params}`)
      if (requestId !== latestLoadRequest.current || requestTab !== tabRef.current) return
      setRecords(current => append ? [...current, ...response.records] : response.records)
      setNextCursor(response.nextCursor)
      if (response.totals) setTotal(response.totals.total)
      if (!append) setSelected(new Set())
    } catch (reason) {
      if (requestId === latestLoadRequest.current && requestTab === tabRef.current) {
        setError(reason instanceof Error ? reason.message : t("review.load_error"))
        setFailedCursor(cursor ?? null)
      }
    } finally {
      if (requestId === latestLoadRequest.current && requestTab === tabRef.current) {
        append ? setLoadingMore(false) : setLoading(false)
      }
    }
  }, [t, tab])

  useEffect(() => {
    void loadRecords()
    return () => {
      latestLoadRequest.current += 1
      latestDecisionRequest.current += 1
      decisionRequestActive.current = false
    }
  }, [loadRecords])

  const changeTab = (value: ReviewTab) => {
    if (value === tab || decisionRequestActive.current) return
    latestLoadRequest.current += 1
    setRecords([])
    setNextCursor(null)
    setTotal(0)
    setSelected(new Set())
    setLoading(true)
    setLoadingMore(false)
    setError(null)
    setFailedCursor(null)
    setTab(value)
  }

  const decide = async (targets: LibraryRecord[], decision: ReviewDecision) => {
    if (!targets.length || decisionRequestActive.current) return
    const requestId = ++latestDecisionRequest.current
    const requestTab = tabRef.current
    const targetKeys = new Set(targets.map(recordKey))
    decisionRequestActive.current = true
    setDeciding(true)
    try {
      await apiFetch("/library/import-review", {
        method: "POST",
        body: JSON.stringify({
          decision,
          records: targets.map(record => ({ category: record.category, id: record.id })),
        }),
      })
      if (requestId !== latestDecisionRequest.current || requestTab !== tabRef.current) return
      setRecords(current => current.filter(record => !targetKeys.has(recordKey(record))))
      setSelected(current => {
        const next = new Set(current)
        for (const key of targetKeys) next.delete(key)
        return next
      })
      setTotal(current => Math.max(0, current - targetKeys.size))
      toast(decision === "ACCEPTED" ? t("review.accepted") : t("review.ignored"))
      await loadRecords()
    } catch (reason) {
      if (requestId !== latestDecisionRequest.current || requestTab !== tabRef.current) return
      toast(reason instanceof Error ? reason.message : t("review.decision_error"), "error")
    } finally {
      if (requestId === latestDecisionRequest.current) {
        decisionRequestActive.current = false
        setDeciding(false)
      }
    }
  }

  const selectedRecords = records.filter(record => selected.has(recordKey(record)))
  const allSelected = records.length > 0 && selectedRecords.length === records.length

  return (
    <div className="space-y-6">
      <section className="overflow-hidden border border-[var(--line)] bg-[var(--surface)]">
        <div className="grid gap-px bg-[var(--line)] lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="bg-[var(--surface)] p-6 sm:p-8">
            <span className="section-kicker">{t("review.kicker")}</span>
            <h1 className="mt-2 font-display text-3xl text-white sm:text-5xl">{t("review.title")}</h1>
            <p className="mt-4 max-w-2xl text-xs leading-6 text-[var(--muted)] sm:text-sm">{t("review.desc")}</p>
            <Link to="/sync" className="brutal-btn mt-6">← {t("review.back")}</Link>
          </div>
          <div className="flex flex-col justify-between bg-[#080808] p-6">
            <Inbox className="h-10 w-10 text-[var(--accent)]" />
            <div className="mt-10">
              <div className="font-display text-6xl leading-none text-white">{total}</div>
              <div className="mt-2 font-mono text-[9px] uppercase tracking-[0.24em] text-[var(--muted)]">
                {tab === "PENDING" ? t("review.pending_count") : t("review.ignored_count")}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border border-[var(--line)] bg-[var(--surface)]">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] p-4 sm:p-5">
          <div className="flex gap-2">
            {(["PENDING", "IGNORED"] as const).map(value => (
              <button
                key={value}
                type="button"
                onClick={() => changeTab(value)}
                disabled={deciding}
                className={tab === value ? "brutal-btn-accent" : "brutal-btn"}
              >
                {value === "PENDING" ? t("review.tab.pending") : t("review.tab.ignored")}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => void loadRecords()} disabled={loading} className="brutal-btn">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> {t("review.refresh")}
          </button>
        </header>

        {error && records.length > 0 && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-b border-red-500/40 bg-red-500/10 p-4 sm:px-5">
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-red-400">{t("review.load_error")}</p>
              <p className="mt-1 break-words text-[10px] text-[var(--muted)]">{error}</p>
            </div>
            <button type="button" onClick={() => void loadRecords(failedCursor ?? undefined)} className="brutal-btn">
              {t("review.retry")}
            </button>
          </div>
        )}

        {!loading && records.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] bg-black/20 p-4 sm:px-5">
            <label className="flex cursor-pointer items-center gap-3 text-[10px] uppercase tracking-widest text-[var(--muted)]">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => setSelected(allSelected ? new Set() : new Set(records.map(recordKey)))}
                className="accent-[var(--accent)]"
              />
              {t("review.select_loaded")} ({selectedRecords.length}/{records.length})
            </label>
            {selectedRecords.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={deciding} onClick={() => void decide(selectedRecords, "ACCEPTED")} className="brutal-btn-accent">
                  <Check className="h-3.5 w-3.5" /> {t("review.accept_selected")}
                </button>
                {tab === "PENDING" && (
                  <button type="button" disabled={deciding} onClick={() => void decide(selectedRecords, "IGNORED")} className="brutal-btn">
                    <EyeOff className="h-3.5 w-3.5" /> {t("review.ignore_selected")}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {loading && records.length === 0 ? (
          <ReviewState label={t("review.loading")} />
        ) : error && records.length === 0 ? (
          <ReviewState label={t("review.load_error")}>
            <p className="max-w-lg break-words text-[10px] normal-case tracking-normal">{error}</p>
            <button type="button" onClick={() => void loadRecords(failedCursor ?? undefined)} className="brutal-btn">
              {t("review.retry")}
            </button>
          </ReviewState>
        ) : records.length === 0 ? (
          <ReviewState label={tab === "PENDING" ? t("review.empty.pending") : t("review.empty.ignored")} />
        ) : (
          <div className="divide-y divide-[var(--line)]">
            {records.map(record => {
              const key = recordKey(record)
              const poster = proxiedImageUrl(record.posterUrl || record.tmdbPosterUrl)
              return (
                <article key={key} className="grid gap-4 p-4 sm:grid-cols-[auto_64px_minmax(0,1fr)_auto] sm:items-center sm:p-5">
                  <input
                    type="checkbox"
                    checked={selected.has(key)}
                    onChange={() => setSelected(current => {
                      const next = new Set(current)
                      next.has(key) ? next.delete(key) : next.add(key)
                      return next
                    })}
                    aria-label={`${t("review.select_record")} ${record.title}`}
                    className="accent-[var(--accent)]"
                  />
                  <div className="h-20 w-14 overflow-hidden border border-[var(--line)] bg-black">
                    {poster ? (
                      <ImgWithFallback
                        src={poster}
                        alt=""
                        className="h-full w-full object-cover"
                        fallback={<PosterFallback title={record.title} />}
                      />
                    ) : <PosterFallback title={record.title} />}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap gap-2 font-mono text-[8px] uppercase tracking-widest text-[var(--muted)]">
                      <span className="text-[var(--accent)]">{t(`health.category.${record.category}`)}</span>
                      <span>{record.sourceLabel}</span>
                      <span>{formatDate(record.importedAt || record.createdAt, lang)}</span>
                    </div>
                    <h2 className="mt-2 truncate font-display text-xl text-white">{record.title}</h2>
                    <p className="mt-1 text-[10px] uppercase tracking-wider text-[var(--muted)]">
                      {record.platformLabel || record.status}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    <Link to={`/library/${record.category}/${record.id}`} className="brutal-btn">
                      {t("review.correct")} <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                    <button type="button" disabled={deciding} onClick={() => void decide([record], "ACCEPTED")} className="brutal-btn-accent">
                      <Check className="h-3.5 w-3.5" /> {t("review.accept")}
                    </button>
                    {tab === "PENDING" && (
                      <button type="button" disabled={deciding} onClick={() => void decide([record], "IGNORED")} className="brutal-btn">
                        <EyeOff className="h-3.5 w-3.5" /> {t("review.ignore")}
                      </button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}

        {nextCursor && (
          <div className="border-t border-[var(--line)] p-4 text-center">
            <button type="button" disabled={loadingMore} onClick={() => void loadRecords(nextCursor)} className="brutal-btn">
              {loadingMore ? t("review.loading_more") : t("review.load_more")}
            </button>
          </div>
        )}
      </section>
    </div>
  )
}

function ReviewState({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 p-12 text-center text-xs uppercase tracking-widest text-[var(--muted)]">
      <span>{label}</span>
      {children}
    </div>
  )
}

function PosterFallback({ title }: { title: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center font-display text-2xl text-[var(--accent)] opacity-30">
      {title.charAt(0).toUpperCase()}
    </div>
  )
}

function formatDate(value: string, lang: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US")
}
