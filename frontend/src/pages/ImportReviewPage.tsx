import { useCallback, useEffect, useRef, useState } from "react"
import { Check, ChevronRight, EyeOff, Inbox, RefreshCw } from "lucide-react"
import { Link, useSearchParams } from "react-router-dom"
import { apiFetch } from "../api"
import { ImgWithFallback } from "../components/ImgWithFallback"
import { confirmDialog } from "../components/Toast"
import { proxiedImageUrl } from "../imageProxy"
import { useI18nStore } from "../stores/i18nStore"
import { toast } from "../stores/toastStore"
import type { ImportReviewState, LibraryRecord } from "../types/library"

type ReviewTab = Extract<ImportReviewState, "PENDING" | "IGNORED">
type ReviewDecision = Extract<ImportReviewState, "ACCEPTED" | "IGNORED">
type ReviewSource = "all" | "douban" | "trakt" | "steam" | "xbox" | "psn"

const REVIEW_SOURCES: ReviewSource[] = ["all", "douban", "trakt", "steam", "xbox", "psn"]
const REVIEW_TABS: ReviewTab[] = ["PENDING", "IGNORED"]

interface ReviewResponse {
  records: LibraryRecord[]
  nextCursor: string | null
  totals?: {
    total: number
    sourceCounts?: Record<ReviewSource, number>
  }
}

interface GameDuplicateHint {
  recordId: number
  groupKey: string
  reasons: string[]
  peers: Array<{
    id: number
    title: string
    platform: string | null
  }>
}

interface GameDuplicateHintResponse {
  hints: GameDuplicateHint[]
  pendingGroupCount: number
}

function recordKey(record: LibraryRecord) {
  return `${record.category}:${record.id}`
}

export default function ImportReviewPage() {
  const { t, lang } = useI18nStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedRecordKey = parseReviewRecordKey(searchParams.get("record"))
  const [tab, setTab] = useState<ReviewTab>(() => parseReviewTab(searchParams.get("tab")))
  const [source, setSource] = useState<ReviewSource>(() => parseReviewSource(searchParams.get("source")))
  const [records, setRecords] = useState<LibraryRecord[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [sourceCounts, setSourceCounts] = useState<Partial<Record<ReviewSource, number>>>({})
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [deciding, setDeciding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [duplicateHintError, setDuplicateHintError] = useState<string | null>(null)
  const [duplicateHints, setDuplicateHints] = useState<Record<number, GameDuplicateHint>>({})
  const [duplicateCheckedGameIds, setDuplicateCheckedGameIds] = useState<Set<number>>(new Set())
  const [pendingDuplicateGroupCount, setPendingDuplicateGroupCount] = useState<number | null>(null)
  const [failedCursor, setFailedCursor] = useState<string | null>(null)
  const [focusedRecordKey, setFocusedRecordKey] = useState<string | null>(null)
  const [focusMissing, setFocusMissing] = useState(false)
  const tabRef = useRef(tab)
  const latestLoadRequest = useRef(0)
  const latestDecisionRequest = useRef(0)
  const decisionRequestActive = useRef(false)
  const sourceRef = useRef(source)
  const recordElements = useRef(new Map<string, HTMLElement>())
  tabRef.current = tab
  sourceRef.current = source

  const loadRecords = useCallback(async (cursor?: string) => {
    const requestTab = tab
    const requestSource = source
    if (requestTab !== tabRef.current || requestSource !== sourceRef.current) return
    const append = Boolean(cursor)
    const requestId = append ? latestLoadRequest.current : ++latestLoadRequest.current
    if (append) {
      setLoadingMore(true)
    } else {
      setLoading(true)
      setLoadingMore(false)
      setDuplicateCheckedGameIds(new Set())
    }
    setError(null)
    setDuplicateHintError(null)
    setFailedCursor(null)
    try {
      const params = new URLSearchParams({
        category: "all",
        importReview: tab.toLowerCase(),
        source,
        sort: "recent",
        limit: "100",
        includeTotals: append ? "false" : "true",
        includeSourceCounts: append ? "false" : "true",
      })
      if (cursor) params.set("cursor", cursor)
      const response = await apiFetch<ReviewResponse>(`/library?${params}`)
      if (
        requestId !== latestLoadRequest.current
        || requestTab !== tabRef.current
        || requestSource !== sourceRef.current
      ) return
      setRecords(current => append ? [...current, ...response.records] : response.records)
      setNextCursor(response.nextCursor)
      if (response.totals) {
        setTotal(response.totals.total)
        if (response.totals.sourceCounts) setSourceCounts(response.totals.sourceCounts)
      }
      if (!append) setSelected(new Set())

      const gameIds = response.records
        .filter(record => record.category === "game")
        .map(record => record.id)
      if (gameIds.length > 0) {
        try {
          const hintResponse = await apiFetch<GameDuplicateHintResponse>(
            `/data-health/duplicates/game-hints?ids=${gameIds.join(",")}`,
          )
          if (
            requestId !== latestLoadRequest.current
            || requestTab !== tabRef.current
            || requestSource !== sourceRef.current
          ) return
          const nextHints = Object.fromEntries(
            hintResponse.hints.map(hint => [hint.recordId, hint]),
          )
          setDuplicateHints(current => append ? { ...current, ...nextHints } : nextHints)
          setDuplicateCheckedGameIds(current => append
            ? new Set([...current, ...gameIds])
            : new Set(gameIds))
          setPendingDuplicateGroupCount(hintResponse.pendingGroupCount)
        } catch (reason) {
          if (
            requestId === latestLoadRequest.current
            && requestTab === tabRef.current
            && requestSource === sourceRef.current
          ) {
            if (!append) setDuplicateHints({})
            if (!append) setPendingDuplicateGroupCount(null)
            setDuplicateHintError(
              reason instanceof Error ? reason.message : t("review.duplicate_error"),
            )
          }
        }
      } else if (!append) {
        setDuplicateHints({})
        setDuplicateCheckedGameIds(new Set())
        setPendingDuplicateGroupCount(null)
      }
    } catch (reason) {
      if (
        requestId === latestLoadRequest.current
        && requestTab === tabRef.current
        && requestSource === sourceRef.current
      ) {
        setError(reason instanceof Error ? reason.message : t("review.load_error"))
        setFailedCursor(cursor ?? null)
      }
    } finally {
      if (
        requestId === latestLoadRequest.current
        && requestTab === tabRef.current
        && requestSource === sourceRef.current
      ) {
        append ? setLoadingMore(false) : setLoading(false)
      }
    }
  }, [t, tab, source])

  useEffect(() => {
    void loadRecords()
    return () => {
      latestLoadRequest.current += 1
      latestDecisionRequest.current += 1
      decisionRequestActive.current = false
    }
  }, [loadRecords])

  useEffect(() => {
    setFocusedRecordKey(null)
    setFocusMissing(false)
  }, [requestedRecordKey, tab, source])

  useEffect(() => {
    if (!requestedRecordKey || loading || error) return
    const target = recordElements.current.get(requestedRecordKey)
    if (target) {
      setFocusedRecordKey(requestedRecordKey)
      setFocusMissing(false)
      const timer = window.setTimeout(() => {
        target.focus({ preventScroll: true })
        target.scrollIntoView({ behavior: "auto", block: "center" })
      }, 100)
      return () => window.clearTimeout(timer)
    }
    if (nextCursor && !loadingMore) {
      void loadRecords(nextCursor)
      return
    }
    if (!nextCursor && !loadingMore) setFocusMissing(true)
  }, [error, loadRecords, loading, loadingMore, nextCursor, records, requestedRecordKey])

  const updateReviewLocation = (nextTab: ReviewTab, nextSource: ReviewSource) => {
    const params = new URLSearchParams()
    params.set("tab", nextTab.toLowerCase())
    params.set("source", nextSource)
    setSearchParams(params, { replace: true })
  }

  const changeTab = (value: ReviewTab) => {
    if (value === tab || decisionRequestActive.current) return
    latestLoadRequest.current += 1
    setRecords([])
    setNextCursor(null)
    setTotal(0)
    setSourceCounts({})
    setSelected(new Set())
    setLoading(true)
    setLoadingMore(false)
    setError(null)
    setDuplicateHintError(null)
    setDuplicateHints({})
    setDuplicateCheckedGameIds(new Set())
    setPendingDuplicateGroupCount(null)
    setFailedCursor(null)
    setFocusedRecordKey(null)
    setFocusMissing(false)
    updateReviewLocation(value, source)
    setTab(value)
  }

  const changeSource = (value: ReviewSource) => {
    if (value === source || decisionRequestActive.current) return
    latestLoadRequest.current += 1
    setRecords([])
    setNextCursor(null)
    setTotal(0)
    setSelected(new Set())
    setLoading(true)
    setLoadingMore(false)
    setError(null)
    setDuplicateHintError(null)
    setDuplicateHints({})
    setDuplicateCheckedGameIds(new Set())
    setPendingDuplicateGroupCount(null)
    setFailedCursor(null)
    setFocusedRecordKey(null)
    setFocusMissing(false)
    updateReviewLocation(tab, value)
    setSource(value)
  }

  const decide = async (targets: LibraryRecord[], decision: ReviewDecision) => {
    if (!targets.length || decisionRequestActive.current) return
    const requestId = ++latestDecisionRequest.current
    const requestTab = tabRef.current
    const targetKeys = new Set(targets.map(recordKey))
    decisionRequestActive.current = true
    setDeciding(true)
    try {
      const uncheckedGameCount = decision === "ACCEPTED"
        ? targets.filter(record => (
            record.category === "game" && !duplicateCheckedGameIds.has(record.id)
          )).length
        : 0
      if (uncheckedGameCount > 0) {
        toast(t("review.duplicate_check_required", uncheckedGameCount), "error")
        return
      }
      const duplicateCount = decision === "ACCEPTED"
        ? targets.filter(record => record.category === "game" && duplicateHints[record.id]).length
        : 0
      if (
        duplicateCount > 0
        && !(await confirmDialog(t("review.duplicate_accept_confirm", duplicateCount)))
      ) return
      if (requestId !== latestDecisionRequest.current || requestTab !== tabRef.current) return

      await apiFetch("/library/import-review", {
        method: "POST",
        body: JSON.stringify({
          decision,
          records: targets.map(record => ({ category: record.category, id: record.id })),
        }),
      })
      if (requestId !== latestDecisionRequest.current || requestTab !== tabRef.current) return
      setRecords(current => current.filter(record => !targetKeys.has(recordKey(record))))
      setDuplicateHints(current => Object.fromEntries(
        Object.entries(current).filter(([id]) => !targetKeys.has(`game:${id}`)),
      ))
      setDuplicateCheckedGameIds(current => new Set(
        [...current].filter(id => !targetKeys.has(`game:${id}`)),
      ))
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
  const safeLoadedRecords = records.filter(record => (
    record.category !== "game"
    || (duplicateCheckedGameIds.has(record.id) && !duplicateHints[record.id])
  ))
  const duplicateRiskRecords = records.filter(record => (
    record.category === "game"
    && duplicateCheckedGameIds.has(record.id)
    && duplicateHints[record.id]
  ))
  const uncheckedGameRecords = records.filter(record => (
    record.category === "game" && !duplicateCheckedGameIds.has(record.id)
  ))
  const selectedHasUncheckedGame = selectedRecords.some(record => (
    record.category === "game" && !duplicateCheckedGameIds.has(record.id)
  ))

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

        <div className="flex flex-wrap gap-2 border-b border-[var(--line)] bg-black/20 p-4 sm:px-5">
          {REVIEW_SOURCES.map(value => (
            <button
              key={value}
              type="button"
              onClick={() => changeSource(value)}
              disabled={deciding}
              className={source === value ? "brutal-btn-accent" : "brutal-btn"}
            >
              {t(`review.source.${value}`)}
              {sourceCounts[value] != null && ` ${sourceCounts[value]}`}
            </button>
          ))}
        </div>

        {tab === "PENDING" && pendingDuplicateGroupCount != null && pendingDuplicateGroupCount > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--accent-deep)] bg-[rgba(255,68,0,0.08)] px-4 py-3 sm:px-5">
            <div>
              <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-[var(--accent-deep)]">
                {t("review.duplicate_queue", String(pendingDuplicateGroupCount))}
              </p>
              <p className="mt-1 text-[10px] text-[var(--muted)]">
                {t("review.duplicate_queue_desc")}
              </p>
            </div>
            <Link to={buildPendingDuplicatePath(tab, source)} className="brutal-btn-accent">
              {t("review.duplicate_queue_open")} <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}

        {duplicateHintError && records.length > 0 && (
          <div role="status" className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/40 bg-amber-500/10 px-4 py-3 text-[10px] text-amber-300 sm:px-5">
            <span>{t("review.duplicate_error")} {duplicateHintError}</span>
            <button type="button" onClick={() => void loadRecords()} className="brutal-btn">
              {t("review.duplicate_retry")}
            </button>
          </div>
        )}

        {focusMissing && (
          <div role="status" className="border-b border-amber-500/40 bg-amber-500/10 px-4 py-3 text-[10px] text-amber-300 sm:px-5">
            {t("review.focus_missing")}
          </div>
        )}

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
          <div role="status" className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] bg-[rgba(212,255,0,0.04)] px-4 py-3 sm:px-5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[9px] uppercase tracking-wider">
              <span className="text-[var(--muted)]">{t("review.risk_loaded")}</span>
              <span className="text-[var(--accent)]">
                {t("review.risk_ready", safeLoadedRecords.length)}
              </span>
              <span className="text-[var(--accent-deep)]">
                {t("review.risk_review", duplicateRiskRecords.length)}
              </span>
              <span className={uncheckedGameRecords.length > 0 ? "text-amber-300" : "text-[var(--muted)]"}>
                {t("review.risk_unchecked", uncheckedGameRecords.length)}
              </span>
            </div>
            <button
              type="button"
              disabled={deciding || safeLoadedRecords.length === 0}
              onClick={() => setSelected(new Set(safeLoadedRecords.map(recordKey)))}
              className="brutal-btn"
            >
              <Check className="h-3.5 w-3.5" />
              {t("review.select_safe_loaded", safeLoadedRecords.length)}
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
                <button
                  type="button"
                  disabled={deciding || selectedHasUncheckedGame}
                  onClick={() => void decide(selectedRecords, "ACCEPTED")}
                  className="brutal-btn-accent"
                >
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
              const progress = formatGameProgress(record, t)
              const duplicateHint = duplicateHints[record.id]
              return (
                <article
                  key={key}
                  ref={element => {
                    if (element) recordElements.current.set(key, element)
                    else recordElements.current.delete(key)
                  }}
                  tabIndex={-1}
                  className={`grid gap-4 p-4 outline-none transition-colors sm:grid-cols-[auto_64px_minmax(0,1fr)_auto] sm:items-center sm:p-5 ${
                    focusedRecordKey === key
                      ? "bg-[rgba(255,68,0,0.08)] shadow-[inset_3px_0_0_var(--accent-deep)]"
                      : ""
                  }`}
                >
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
                      {focusedRecordKey === key && (
                        <span className="text-[var(--accent-deep)]">{t("review.focused")}</span>
                      )}
                    </div>
                    <h2 className="mt-2 truncate font-display text-xl text-white">{record.title}</h2>
                    <p className="mt-1 text-[10px] uppercase tracking-wider text-[var(--muted)]">
                      {record.platformLabel || record.status}
                    </p>
                    {progress && (
                      <p className="mt-2 font-mono text-[9px] uppercase tracking-wider text-[var(--accent)]">
                        {progress}
                      </p>
                    )}
                    {duplicateHint && (
                      <div className="mt-3 border-l-2 border-[var(--accent-deep)] bg-[rgba(255,68,0,0.06)] px-3 py-2">
                        <p className="font-mono text-[9px] font-bold uppercase tracking-wider text-[var(--accent-deep)]">
                          {t("review.duplicate_hint")}
                        </p>
                        <p className="mt-1 text-[10px] text-[var(--muted)]">
                          {duplicateHint.peers
                            .map(peer => `${peer.platform || "—"} · ${peer.title}`)
                            .join(" / ")}
                        </p>
                        <Link
                          to={buildDuplicateGroupPath(duplicateHint.groupKey, tab, source, key)}
                          className="mt-2 inline-flex text-[9px] uppercase tracking-wider text-white underline decoration-[var(--accent)] underline-offset-4"
                        >
                          {t("review.duplicate_open")}
                        </Link>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    <Link to={`/library/${record.category}/${record.id}`} className="brutal-btn">
                      {t("review.correct")} <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                    <button
                      type="button"
                      disabled={deciding || (
                        record.category === "game" && !duplicateCheckedGameIds.has(record.id)
                      )}
                      onClick={() => void decide([record], "ACCEPTED")}
                      className="brutal-btn-accent"
                    >
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

function formatGameProgress(
  record: LibraryRecord,
  t: (
    key: "lib.list.achievements" | "lib.list.trophies" | "lib.list.unlocked",
    ...args: (string | number)[]
  ) => string,
) {
  if (record.category !== "game") return null
  const unlocked = record.achievementUnlocked
  const total = record.achievementTotal
  const platform = record.platformLabel || record.platform || record.sourceLabel
  const progressLabel = platform.trim().toUpperCase() === "PSN"
    ? t("lib.list.trophies")
    : t("lib.list.achievements")
  if (total != null && total > 0) {
    return `${progressLabel} ${unlocked ?? 0}/${total}`
  }
  if (unlocked != null && unlocked > 0) {
    return t("lib.list.unlocked", unlocked, progressLabel)
  }
  return null
}

function buildDuplicateGroupPath(
  groupKey: string,
  tab: ReviewTab,
  source: ReviewSource,
  record: string,
) {
  const returnParams = new URLSearchParams({
    tab: tab.toLowerCase(),
    source,
    record,
  })
  const params = new URLSearchParams({
    category: "game",
    view: "duplicates",
    ...(tab === "PENDING" ? { scope: "pending" } : {}),
    group: groupKey,
    returnTo: `/sync/review?${returnParams}`,
  })
  return `/data-health?${params}`
}

function buildPendingDuplicatePath(tab: ReviewTab, source: ReviewSource) {
  const returnParams = new URLSearchParams({
    tab: tab.toLowerCase(),
    source,
  })
  const params = new URLSearchParams({
    category: "game",
    view: "duplicates",
    scope: "pending",
    returnTo: `/sync/review?${returnParams}`,
  })
  return `/data-health?${params}`
}

function parseReviewTab(value: string | null): ReviewTab {
  const normalized = value?.toUpperCase()
  return REVIEW_TABS.includes(normalized as ReviewTab) ? normalized as ReviewTab : "PENDING"
}

function parseReviewSource(value: string | null): ReviewSource {
  return REVIEW_SOURCES.includes(value as ReviewSource) ? value as ReviewSource : "all"
}

function parseReviewRecordKey(value: string | null) {
  return value && /^(movie|tv_show|game):[1-9]\d*$/.test(value) ? value : null
}
