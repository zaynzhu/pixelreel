import { useCallback, useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"
import { apiFetch } from "../../api"
import { confirmDialog } from "../Toast"
import { proxiedImageUrl } from "../../imageProxy"
import { useI18nStore } from "../../stores/i18nStore"
import { toast } from "../../stores/toastStore"
import type {
  DataHealthCategory,
  DuplicateGroup,
  DuplicateGroupResponse,
  DuplicateReason,
  GameMergePreview,
} from "../../types/dataHealth"
import type { LibraryRecord } from "../../types/library"
import { ImgWithFallback } from "../ImgWithFallback"
import RescrapeModal from "../RescrapeModal"

type DuplicateReviewFilter = "unreviewed" | "reviewed"

export function DuplicateCandidatePanel({
  category,
  focusGroupKey,
  importReviewReturnPath,
}: {
  category: DataHealthCategory
  focusGroupKey?: string | null
  importReviewReturnPath?: string | null
}) {
  const { t } = useI18nStore()
  const [groups, setGroups] = useState<DuplicateGroup[]>([])
  const [totalGroups, setTotalGroups] = useState(0)
  const [totalRecords, setTotalRecords] = useState(0)
  const [unreviewedGroups, setUnreviewedGroups] = useState(0)
  const [reviewedGroups, setReviewedGroups] = useState(0)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [failedFetch, setFailedFetch] = useState<"groups" | "more" | null>(null)
  const [rescrapeRecord, setRescrapeRecord] = useState<LibraryRecord | null>(null)
  const [openingRecordId, setOpeningRecordId] = useState<number | null>(null)
  const [review, setReview] = useState<DuplicateReviewFilter>("unreviewed")
  const [reviewingGroupKey, setReviewingGroupKey] = useState<string | null>(null)
  const [mergePreview, setMergePreview] = useState<{ groupKey: string; data: GameMergePreview } | null>(null)
  const [previewingRecordId, setPreviewingRecordId] = useState<number | null>(null)
  const [mergingRecordId, setMergingRecordId] = useState<number | null>(null)
  const [focusedGroupKey, setFocusedGroupKey] = useState<string | null>(null)
  const [focusMissing, setFocusMissing] = useState(false)
  const duplicateViewKey = `${category}:${review}`
  const duplicateViewRef = useRef(duplicateViewKey)
  const latestDuplicateRequest = useRef(0)
  const latestOpenRequest = useRef(0)
  const latestReviewRequest = useRef(0)
  const latestMergeRequest = useRef(0)
  const openRequestActive = useRef(false)
  const reviewRequestActive = useRef(false)
  const mergeRequestActive = useRef(false)
  const groupElements = useRef(new Map<string, HTMLElement>())
  duplicateViewRef.current = duplicateViewKey

  const fetchGroups = useCallback(async (cursor?: string) => {
    const params = new URLSearchParams({ category, limit: "20", review })
    if (cursor) params.set("cursor", cursor)
    return apiFetch<DuplicateGroupResponse>(`/data-health/duplicates?${params}`)
  }, [category, review])

  const applyResponse = (data: DuplicateGroupResponse) => {
    setGroups(data.groups)
    setTotalGroups(data.totalGroups)
    setTotalRecords(data.totalRecords)
    setUnreviewedGroups(data.unreviewedGroups)
    setReviewedGroups(data.reviewedGroups)
    setNextCursor(data.nextCursor)
  }

  useEffect(() => {
    let active = true
    const requestId = ++latestDuplicateRequest.current
    const requestViewKey = duplicateViewKey
    setLoading(true)
    setLoadingMore(false)
    setError(null)
    setFailedFetch(null)
    setGroups([])
    setTotalGroups(0)
    setTotalRecords(0)
    setUnreviewedGroups(0)
    setReviewedGroups(0)
    setNextCursor(null)
    setRescrapeRecord(null)
    setOpeningRecordId(null)
    setReviewingGroupKey(null)
    setMergePreview(null)
    setPreviewingRecordId(null)
    setMergingRecordId(null)
    fetchGroups()
      .then(data => {
        if (!active || requestId !== latestDuplicateRequest.current || requestViewKey !== duplicateViewRef.current) return
        applyResponse(data)
      })
      .catch(reason => {
        if (active && requestId === latestDuplicateRequest.current && requestViewKey === duplicateViewRef.current) {
          setError(reason instanceof Error ? reason.message : t("health.duplicates.error"))
          setFailedFetch("groups")
        }
      })
      .finally(() => {
        if (active && requestId === latestDuplicateRequest.current && requestViewKey === duplicateViewRef.current) {
          setLoading(false)
        }
      })
    return () => {
      active = false
      latestOpenRequest.current += 1
      latestReviewRequest.current += 1
      latestMergeRequest.current += 1
      openRequestActive.current = false
      reviewRequestActive.current = false
      mergeRequestActive.current = false
    }
  }, [duplicateViewKey, fetchGroups, t])

  useEffect(() => {
    setFocusedGroupKey(null)
    setFocusMissing(false)
  }, [focusGroupKey, duplicateViewKey])

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return
    const requestId = latestDuplicateRequest.current
    const requestViewKey = duplicateViewKey
    setLoadingMore(true)
    setError(null)
    setFailedFetch(null)
    try {
      const cursor = nextCursor
      const data = await fetchGroups(cursor)
      if (requestId !== latestDuplicateRequest.current || requestViewKey !== duplicateViewRef.current) return
      setGroups(current => [...current, ...data.groups])
      setNextCursor(data.nextCursor)
    } catch (reason) {
      if (requestId === latestDuplicateRequest.current && requestViewKey === duplicateViewRef.current) {
        setError(reason instanceof Error ? reason.message : t("health.duplicates.error"))
        setFailedFetch("more")
      }
    } finally {
      if (requestId === latestDuplicateRequest.current && requestViewKey === duplicateViewRef.current) {
        setLoadingMore(false)
      }
    }
  }

  useEffect(() => {
    if (!focusGroupKey || review !== "unreviewed" || loading || error) return
    const target = groupElements.current.get(focusGroupKey)
    if (target) {
      setFocusedGroupKey(focusGroupKey)
      setFocusMissing(false)
      const timer = window.setTimeout(() => {
        target.focus({ preventScroll: true })
        target.scrollIntoView({ behavior: "auto", block: "center" })
      }, 100)
      return () => window.clearTimeout(timer)
    }
    if (nextCursor && !loadingMore) {
      void loadMore()
      return
    }
    if (!nextCursor && !loadingMore) setFocusMissing(true)
  }, [error, focusGroupKey, groups, loading, loadingMore, nextCursor, review])

  const refreshGroups = async () => {
    const requestViewKey = duplicateViewKey
    if (requestViewKey !== duplicateViewRef.current) return
    const requestId = ++latestDuplicateRequest.current
    setLoading(true)
    setLoadingMore(false)
    setError(null)
    setFailedFetch(null)
    try {
      const data = await fetchGroups()
      if (requestId !== latestDuplicateRequest.current || requestViewKey !== duplicateViewRef.current) return
      applyResponse(data)
    } catch (reason) {
      if (requestId === latestDuplicateRequest.current && requestViewKey === duplicateViewRef.current) {
        setError(reason instanceof Error ? reason.message : t("health.duplicates.error"))
        setFailedFetch("groups")
      }
    } finally {
      if (requestId === latestDuplicateRequest.current && requestViewKey === duplicateViewRef.current) {
        setLoading(false)
      }
    }
  }

  const openRescrape = async (recordId: number) => {
    if (openRequestActive.current) return
    const requestId = ++latestOpenRequest.current
    const requestViewKey = duplicateViewKey
    openRequestActive.current = true
    setOpeningRecordId(recordId)
    try {
      const record = await apiFetch<LibraryRecord>(`/library/${category}/${recordId}`)
      if (requestId !== latestOpenRequest.current || requestViewKey !== duplicateViewRef.current) return
      setRescrapeRecord(record)
    } catch (reason) {
      if (requestId === latestOpenRequest.current && requestViewKey === duplicateViewRef.current) {
        toast(reason instanceof Error ? reason.message : t("health.duplicates.open_error"), "error")
      }
    } finally {
      if (requestId === latestOpenRequest.current) {
        openRequestActive.current = false
        setOpeningRecordId(null)
      }
    }
  }

  const retryFetch = () => {
    if (failedFetch === "more") {
      void loadMore()
      return
    }
    if (failedFetch === "groups") {
      void refreshGroups()
    }
  }

  const markAsDistinct = async (group: DuplicateGroup) => {
    if (reviewRequestActive.current) return
    const requestId = ++latestReviewRequest.current
    const actionViewKey = duplicateViewKey
    reviewRequestActive.current = true
    try {
      if (!(await confirmDialog(t("health.duplicates.distinct_confirm")))) return
      if (requestId !== latestReviewRequest.current || actionViewKey !== duplicateViewRef.current) return
      setReviewingGroupKey(group.key)
      await apiFetch("/data-health/duplicates/review", {
        method: "POST",
        body: JSON.stringify({ category, groupKey: group.key }),
      })
      if (requestId !== latestReviewRequest.current || actionViewKey !== duplicateViewRef.current) return
      toast(t("health.duplicates.distinct_success"))
      await refreshGroups()
    } catch (reason) {
      if (requestId === latestReviewRequest.current && actionViewKey === duplicateViewRef.current) {
        toast(reason instanceof Error ? reason.message : t("health.duplicates.review_error"), "error")
      }
    } finally {
      if (requestId === latestReviewRequest.current) {
        reviewRequestActive.current = false
        setReviewingGroupKey(null)
      }
    }
  }

  const restoreReview = async (group: DuplicateGroup) => {
    if (group.reviewId == null || reviewRequestActive.current) return
    const requestId = ++latestReviewRequest.current
    const actionViewKey = duplicateViewKey
    reviewRequestActive.current = true
    setReviewingGroupKey(group.key)
    try {
      await apiFetch(`/data-health/duplicates/review/${group.reviewId}`, { method: "DELETE" })
      if (requestId !== latestReviewRequest.current || actionViewKey !== duplicateViewRef.current) return
      toast(t("health.duplicates.restore_success"))
      await refreshGroups()
    } catch (reason) {
      if (requestId === latestReviewRequest.current && actionViewKey === duplicateViewRef.current) {
        toast(reason instanceof Error ? reason.message : t("health.duplicates.review_error"), "error")
      }
    } finally {
      if (requestId === latestReviewRequest.current) {
        reviewRequestActive.current = false
        setReviewingGroupKey(null)
      }
    }
  }

  const openMergePreview = async (group: DuplicateGroup, recordId: number) => {
    if (category !== "game" || mergeRequestActive.current) return
    const requestId = ++latestMergeRequest.current
    const actionViewKey = duplicateViewKey
    mergeRequestActive.current = true
    setPreviewingRecordId(recordId)
    try {
      const data = await apiFetch<GameMergePreview>("/data-health/duplicates/merge-preview", {
        method: "POST",
        body: JSON.stringify({ groupKey: group.key, targetId: String(recordId) }),
      })
      if (requestId !== latestMergeRequest.current || actionViewKey !== duplicateViewRef.current) return
      setMergePreview({ groupKey: group.key, data })
    } catch (reason) {
      if (requestId === latestMergeRequest.current && actionViewKey === duplicateViewRef.current) {
        toast(reason instanceof Error ? reason.message : t("health.duplicates.preview_error"), "error")
      }
    } finally {
      if (requestId === latestMergeRequest.current) {
        mergeRequestActive.current = false
        setPreviewingRecordId(null)
      }
    }
  }

  const mergeIntoPreviewTarget = async () => {
    if (!mergePreview?.data.canMerge || mergeRequestActive.current) return
    const requestId = ++latestMergeRequest.current
    const actionViewKey = duplicateViewKey
    const { groupKey, data } = mergePreview
    mergeRequestActive.current = true
    setMergingRecordId(data.targetId)
    try {
      await apiFetch("/data-health/duplicates/merge", {
        method: "POST",
        body: JSON.stringify({ groupKey, targetId: String(data.targetId) }),
      })
      if (requestId !== latestMergeRequest.current || actionViewKey !== duplicateViewRef.current) return
      setMergePreview(null)
      toast(t("health.duplicates.merge_success"))
      await refreshGroups()
    } catch (reason) {
      if (requestId === latestMergeRequest.current && actionViewKey === duplicateViewRef.current) {
        toast(reason instanceof Error ? reason.message : t("health.duplicates.merge_error"), "error")
      }
    } finally {
      if (requestId === latestMergeRequest.current) {
        mergeRequestActive.current = false
        setMergingRecordId(null)
      }
    }
  }

  return (
    <section className="border border-[var(--line)] bg-[var(--surface)]">
      <header className="grid gap-4 border-b border-[var(--line)] px-5 py-5 sm:grid-cols-[1fr_auto] sm:items-end">
        <div>
          <span className="section-kicker">{t("health.duplicates.kicker")}</span>
          <h2 className="text-lg text-white">{t("health.duplicates.title")}</h2>
          <p className="mt-2 max-w-2xl text-xs leading-5 text-[var(--muted)]">
            {t("health.duplicates.desc")}
          </p>
        </div>
        <div className="flex gap-6 font-mono text-xs">
          <div>
            <div className="text-2xl text-[var(--accent-deep)]">{loading ? "--" : totalGroups}</div>
            <div className="mt-1 text-[9px] uppercase tracking-widest text-[var(--muted)]">{t("health.duplicates.groups")}</div>
          </div>
          <div>
            <div className="text-2xl text-white">{loading ? "--" : totalRecords}</div>
            <div className="mt-1 text-[9px] uppercase tracking-widest text-[var(--muted)]">{t("health.duplicates.records")}</div>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-px border-b border-[var(--line)] bg-[var(--line)]">
        {(["unreviewed", "reviewed"] as const).map(item => (
          <button
            key={item}
            type="button"
            onClick={() => setReview(item)}
            className={`flex items-center justify-between bg-[var(--surface)] px-5 py-3 text-left transition-colors hover:bg-[var(--surface-hover)] ${
              review === item ? "shadow-[inset_0_-2px_0_var(--accent)]" : ""
            }`}
          >
            <span className={`text-[10px] uppercase tracking-widest ${review === item ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}>
              {t(`health.duplicates.review.${item}`)}
            </span>
            <span className="font-mono text-sm text-white">
              {item === "unreviewed" ? unreviewedGroups : reviewedGroups}
            </span>
          </button>
        ))}
      </div>

      {error && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--accent-deep)] bg-[rgba(255,68,0,0.08)] px-5 py-4">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--accent-deep)]">
              {t("health.duplicates.error")}
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">{error}</p>
          </div>
          <button type="button" onClick={retryFetch} disabled={!failedFetch} className="brutal-btn">
            {t("health.retry")}
          </button>
        </div>
      )}

      {focusMissing && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/40 bg-amber-500/10 px-5 py-3 text-[10px] text-amber-300">
          <span>{t("health.duplicates.focus_missing")}</span>
          {importReviewReturnPath && (
            <Link to={importReviewReturnPath} className="brutal-btn">
              ← {t("health.duplicates.back_to_review")}
            </Link>
          )}
        </div>
      )}

      {loading ? (
        <div className="px-5 py-16 text-center text-xs uppercase tracking-widest text-[var(--muted)]">
          {t("health.loading")}
        </div>
      ) : error && groups.length === 0 ? null : groups.length === 0 ? (
        <div className="px-5 py-16 text-center">
          <div className="text-2xl text-[var(--accent)]">✓</div>
          <p className="mt-3 text-sm text-white">
            {t(review === "reviewed" ? "health.duplicates.reviewed_empty" : "health.duplicates.clean")}
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {t(review === "reviewed" ? "health.duplicates.reviewed_empty_desc" : "health.duplicates.clean_desc")}
          </p>
        </div>
      ) : (
        <div className="space-y-4 p-4 sm:p-5">
          {groups.map((group, groupIndex) => (
            <article
              key={group.key}
              ref={element => {
                if (element) groupElements.current.set(group.key, element)
                else groupElements.current.delete(group.key)
              }}
              tabIndex={-1}
              className={`border bg-[var(--surface-hover)] outline-none transition-colors ${
                focusedGroupKey === group.key
                  ? "border-[var(--accent-deep)] shadow-[0_0_24px_rgba(255,68,0,0.2)]"
                  : "border-[var(--line)]"
              }`}
            >
              <div className="flex flex-col gap-3 border-b border-[var(--line)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[10px] text-[var(--muted)]">
                    {String(groupIndex + 1).padStart(2, "0")}
                  </span>
                  {group.reasons.map(reason => (
                    <ReasonTag key={reason} reason={reason} />
                  ))}
                  {focusedGroupKey === group.key && (
                    <span className="border border-[var(--accent-deep)] px-2 py-1 text-[8px] uppercase tracking-widest text-[var(--accent-deep)]">
                      {t("health.duplicates.focused")}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  {focusedGroupKey === group.key && importReviewReturnPath && (
                    <Link to={importReviewReturnPath} className="brutal-btn whitespace-nowrap">
                      ← {t("health.duplicates.back_to_review")}
                    </Link>
                  )}
                  <span className="font-mono text-[9px] uppercase tracking-widest text-[var(--muted)]">
                    {t("health.duplicates.group_size", String(group.records.length))}
                  </span>
                  <button
                    type="button"
                    onClick={() => review === "reviewed" ? void restoreReview(group) : void markAsDistinct(group)}
                    disabled={reviewingGroupKey != null}
                    className={review === "reviewed" ? "brutal-btn" : "brutal-btn-accent"}
                  >
                    {reviewingGroupKey === group.key
                      ? t("health.duplicates.reviewing")
                      : t(review === "reviewed" ? "health.duplicates.restore" : "health.duplicates.distinct")}
                  </button>
                </div>
              </div>
              <div className="divide-y divide-[var(--line)]">
                {group.records.map(record => {
                  const poster = proxiedImageUrl(record.posterUrl)
                  return (
                    <div key={`${record.category}-${record.id}`} className="grid gap-4 px-4 py-3 sm:grid-cols-[2.5rem_minmax(0,1fr)_minmax(10rem,auto)_auto] sm:items-center">
                      <div className="hidden h-12 w-9 overflow-hidden border border-[var(--line)] bg-black sm:block">
                        {poster ? (
                          <ImgWithFallback
                            src={poster}
                            alt={record.title}
                            className="h-full w-full object-cover"
                            fallback={<div className="flex h-full items-center justify-center text-[8px] text-[var(--muted)]">N/A</div>}
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[8px] text-[var(--muted)]">N/A</div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate text-sm text-white">{record.title}</h3>
                          {record.protected && (
                            <span className="border border-[var(--accent-deep)] px-1.5 py-0.5 text-[8px] text-[var(--accent-deep)]">
                              {t("health.duplicates.protected")}
                            </span>
                          )}
                        </div>
                        <p className="mt-1 font-mono text-[9px] uppercase tracking-wider text-[var(--muted)]">
                          ID {record.id}
                          {record.year ? ` // ${record.year}` : ""}
                          {record.platform ? ` // ${record.platform}` : ""}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {record.status && (
                            <span className="border border-[var(--line)] px-1.5 py-0.5 text-[8px] text-white">
                              {duplicateStatusLabel(record.status, t)}
                            </span>
                          )}
                          {record.rating != null && (
                            <span className="border border-[var(--accent)] px-1.5 py-0.5 text-[8px] text-[var(--accent)]">
                              ★ {record.rating}
                            </span>
                          )}
                          {record.hasReview && (
                            <span className="border border-[var(--line)] px-1.5 py-0.5 text-[8px] text-[var(--muted)]">
                              {t("health.duplicates.personal.review")}
                            </span>
                          )}
                          {record.playtimeMinutes != null && (
                            <span className="border border-[var(--line)] px-1.5 py-0.5 text-[8px] text-[var(--muted)]">
                              {t("health.duplicates.personal.playtime", formatPlaytime(record.playtimeMinutes))}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5 sm:justify-end">
                        {Object.entries(record.sourceIds).map(([reason, value]) => (
                          <span key={reason} className="border border-[var(--line)] px-2 py-1 font-mono text-[8px] text-[var(--muted)]">
                            {t(`health.duplicates.reason.${reason as DuplicateReason}`)} {value}
                          </span>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2 sm:justify-end">
                        <Link
                          to={`/library/${record.category}/${record.id}`}
                          className="brutal-btn whitespace-nowrap"
                        >
                          {t("health.open_detail")} →
                        </Link>
                        <button
                          type="button"
                          onClick={() => void openRescrape(record.id)}
                          disabled={openingRecordId != null}
                          className="brutal-btn whitespace-nowrap"
                        >
                          {openingRecordId === record.id
                            ? t("health.duplicates.opening")
                            : t("health.duplicates.rematch")}
                        </button>
                        {category === "game" && review === "unreviewed" && (
                          <button
                            type="button"
                            onClick={() => void openMergePreview(group, record.id)}
                            disabled={previewingRecordId != null || mergingRecordId != null || reviewingGroupKey != null}
                            className="brutal-btn-accent whitespace-nowrap"
                          >
                            {previewingRecordId === record.id
                              ? t("health.duplicates.previewing")
                              : t("health.duplicates.merge_into")}
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </article>
          ))}
        </div>
      )}

      <footer className="flex flex-col gap-3 border-t border-[var(--line)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[10px] leading-5 text-[var(--muted)]">{t("health.duplicates.review_note")}</p>
        {nextCursor && !failedFetch && (
          <button type="button" onClick={loadMore} disabled={loadingMore} className="brutal-btn shrink-0">
            {loadingMore ? t("health.loading") : t("health.more")}
          </button>
        )}
      </footer>

      {rescrapeRecord && (
        <RescrapeModal
          record={rescrapeRecord}
          contextNote={t("health.duplicates.rematch_note")}
          onClose={() => setRescrapeRecord(null)}
          onUpdated={() => {
            setRescrapeRecord(null)
            toast(t("health.duplicates.rematch_success"))
            void refreshGroups()
          }}
        />
      )}
      {mergePreview && (
        <GameMergePreviewDialog
          preview={mergePreview.data}
          merging={mergingRecordId != null}
          onClose={() => {
            if (mergingRecordId == null) setMergePreview(null)
          }}
          onConfirm={() => void mergeIntoPreviewTarget()}
        />
      )}
    </section>
  )
}

function GameMergePreviewDialog({
  preview,
  merging,
  onClose,
  onConfirm,
}: {
  preview: GameMergePreview
  merging: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const { t } = useI18nStore()
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="game-merge-preview-title"
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto border border-[var(--line)] bg-[var(--surface)] shadow-[0_0_40px_rgba(212,255,0,0.12)]"
      >
        <header className="flex items-start justify-between gap-4 border-b border-[var(--line)] p-5">
          <div>
            <span className="section-kicker">{t("health.duplicates.preview_kicker")}</span>
            <h2 id="game-merge-preview-title" className="mt-2 text-xl text-white">
              {t("health.duplicates.preview_title")}
            </h2>
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
              {t("health.duplicates.preview_target", preview.targetTitle)}
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={merging} className="brutal-btn px-3">
            ×
          </button>
        </header>

        <div className="space-y-5 p-5">
          <div className="grid grid-cols-3 gap-px border border-[var(--line)] bg-[var(--line)]">
            <PreviewMetric label={t("health.duplicates.preview.removed")} value={String(preview.removedIds.length)} />
            <PreviewMetric label={t("health.duplicates.preview.moved")} value={String(preview.platformProfiles.moved)} />
            <PreviewMetric label={t("health.duplicates.preview.total")} value={String(preview.platformProfiles.total)} />
          </div>

          {preview.canMerge && preview.result ? (
            <div>
              <p className="font-mono text-[9px] uppercase tracking-widest text-[var(--accent)]">
                {t("health.duplicates.preview.result")}
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                <PreviewValue
                  label={t("detail.status")}
                  value={duplicateStatusLabel(preview.result.status, t)}
                />
                <PreviewValue
                  label={t("detail.rating")}
                  value={preview.result.rating == null ? "—" : `★ ${preview.result.rating}`}
                />
                <PreviewValue
                  label={t("health.duplicates.personal.review")}
                  value={preview.result.hasReview
                    ? t("health.duplicates.preview.kept")
                    : t("health.duplicates.preview.none")}
                />
              </div>
              <p className="mt-4 text-xs leading-5 text-[var(--muted)]">
                {t("health.duplicates.preview.safe")}
              </p>
            </div>
          ) : (
            <div className="border border-[var(--accent-deep)] bg-[rgba(255,68,0,0.08)] p-4">
              <p className="font-mono text-[9px] uppercase tracking-widest text-[var(--accent-deep)]">
                {t("health.duplicates.preview.blocked")}
              </p>
              <ul className="mt-3 space-y-2 text-xs text-red-300">
                {preview.blockers.map(blocker => (
                  <li key={blocker}>• {t(`health.duplicates.blocker.${blocker}`)}</li>
                ))}
              </ul>
              <p className="mt-4 text-xs leading-5 text-[var(--muted)]">
                {t("health.duplicates.preview.blocked_hint")}
              </p>
            </div>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-[var(--line)] p-5">
          <button type="button" onClick={onClose} disabled={merging} className="brutal-btn">
            {t("confirm.cancel")}
          </button>
          {preview.canMerge && (
            <button type="button" onClick={onConfirm} disabled={merging} className="brutal-btn-accent">
              {merging ? t("health.duplicates.merging") : t("health.duplicates.preview.confirm")}
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}

function PreviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-[var(--surface)] px-3 py-4 text-center">
      <p className="font-mono text-[8px] uppercase tracking-wider text-[var(--muted)]">{label}</p>
      <p className="mt-2 font-display text-xl text-white">{value}</p>
    </div>
  )
}

function PreviewValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-[var(--line)] bg-black/20 px-3 py-3">
      <p className="font-mono text-[8px] uppercase tracking-wider text-[var(--muted)]">{label}</p>
      <p className="mt-2 text-sm text-white">{value}</p>
    </div>
  )
}

function ReasonTag({ reason }: { reason: DuplicateReason }) {
  const { t } = useI18nStore()
  return (
    <span className="border border-[var(--accent)] px-2 py-1 text-[8px] uppercase tracking-wider text-[var(--accent)]">
      {t(`health.duplicates.reason.${reason}`)}
    </span>
  )
}

function formatPlaytime(minutes: number) {
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`
}

const DUPLICATE_STATUS_KEYS = {
  UNSET: "global.status.unset",
  WANT: "global.status.want",
  IN_PROGRESS: "global.status.active",
  DONE: "global.status.done",
  DROPPED: "global.status.dropped",
} as const

function duplicateStatusLabel(
  status: string,
  t: ReturnType<typeof useI18nStore.getState>["t"],
) {
  const key = DUPLICATE_STATUS_KEYS[status as keyof typeof DUPLICATE_STATUS_KEYS]
  return key ? t(key) : status
}
