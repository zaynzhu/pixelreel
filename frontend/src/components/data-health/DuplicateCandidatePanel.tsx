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
} from "../../types/dataHealth"
import type { LibraryRecord } from "../../types/library"
import { ImgWithFallback } from "../ImgWithFallback"
import RescrapeModal from "../RescrapeModal"

type DuplicateReviewFilter = "unreviewed" | "reviewed"

export function DuplicateCandidatePanel({ category }: { category: DataHealthCategory }) {
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
  const [rescrapeRecord, setRescrapeRecord] = useState<LibraryRecord | null>(null)
  const [openingRecordId, setOpeningRecordId] = useState<number | null>(null)
  const [review, setReview] = useState<DuplicateReviewFilter>("unreviewed")
  const [reviewingGroupKey, setReviewingGroupKey] = useState<string | null>(null)
  const duplicateViewKey = `${category}:${review}`
  const duplicateViewRef = useRef(duplicateViewKey)
  const latestDuplicateRequest = useRef(0)
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
    setGroups([])
    setTotalGroups(0)
    setTotalRecords(0)
    setUnreviewedGroups(0)
    setReviewedGroups(0)
    setNextCursor(null)
    setRescrapeRecord(null)
    setOpeningRecordId(null)
    setReviewingGroupKey(null)
    fetchGroups()
      .then(data => {
        if (!active || requestId !== latestDuplicateRequest.current || requestViewKey !== duplicateViewRef.current) return
        applyResponse(data)
      })
      .catch(reason => {
        if (active && requestId === latestDuplicateRequest.current && requestViewKey === duplicateViewRef.current) {
          setError(reason instanceof Error ? reason.message : t("health.duplicates.error"))
        }
      })
      .finally(() => {
        if (active && requestId === latestDuplicateRequest.current && requestViewKey === duplicateViewRef.current) {
          setLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [duplicateViewKey, fetchGroups, t])

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return
    const requestId = latestDuplicateRequest.current
    const requestViewKey = duplicateViewKey
    setLoadingMore(true)
    setError(null)
    try {
      const data = await fetchGroups(nextCursor)
      if (requestId !== latestDuplicateRequest.current || requestViewKey !== duplicateViewRef.current) return
      setGroups(current => [...current, ...data.groups])
      setNextCursor(data.nextCursor)
    } catch (reason) {
      if (requestId === latestDuplicateRequest.current && requestViewKey === duplicateViewRef.current) {
        setError(reason instanceof Error ? reason.message : t("health.duplicates.error"))
      }
    } finally {
      if (requestId === latestDuplicateRequest.current && requestViewKey === duplicateViewRef.current) {
        setLoadingMore(false)
      }
    }
  }

  const refreshGroups = async () => {
    const requestViewKey = duplicateViewKey
    if (requestViewKey !== duplicateViewRef.current) return
    const requestId = ++latestDuplicateRequest.current
    setLoading(true)
    setLoadingMore(false)
    setError(null)
    try {
      const data = await fetchGroups()
      if (requestId !== latestDuplicateRequest.current || requestViewKey !== duplicateViewRef.current) return
      applyResponse(data)
    } catch (reason) {
      if (requestId === latestDuplicateRequest.current && requestViewKey === duplicateViewRef.current) {
        setError(reason instanceof Error ? reason.message : t("health.duplicates.error"))
      }
    } finally {
      if (requestId === latestDuplicateRequest.current && requestViewKey === duplicateViewRef.current) {
        setLoading(false)
      }
    }
  }

  const openRescrape = async (recordId: number) => {
    const requestViewKey = duplicateViewKey
    setOpeningRecordId(recordId)
    setError(null)
    try {
      const record = await apiFetch<LibraryRecord>(`/library/${category}/${recordId}`)
      if (requestViewKey !== duplicateViewRef.current) return
      setRescrapeRecord(record)
    } catch (reason) {
      if (requestViewKey === duplicateViewRef.current) {
        setError(reason instanceof Error ? reason.message : t("health.duplicates.open_error"))
      }
    } finally {
      if (requestViewKey === duplicateViewRef.current) setOpeningRecordId(null)
    }
  }

  const markAsDistinct = async (group: DuplicateGroup) => {
    if (!(await confirmDialog(t("health.duplicates.distinct_confirm")))) return
    const actionViewKey = duplicateViewKey
    setReviewingGroupKey(group.key)
    try {
      await apiFetch("/data-health/duplicates/review", {
        method: "POST",
        body: JSON.stringify({ category, groupKey: group.key }),
      })
      toast(t("health.duplicates.distinct_success"))
      if (actionViewKey === duplicateViewRef.current) await refreshGroups()
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : t("health.duplicates.review_error"), "error")
    } finally {
      if (actionViewKey === duplicateViewRef.current) setReviewingGroupKey(null)
    }
  }

  const restoreReview = async (group: DuplicateGroup) => {
    if (group.reviewId == null) return
    const actionViewKey = duplicateViewKey
    setReviewingGroupKey(group.key)
    try {
      await apiFetch(`/data-health/duplicates/review/${group.reviewId}`, { method: "DELETE" })
      toast(t("health.duplicates.restore_success"))
      if (actionViewKey === duplicateViewRef.current) await refreshGroups()
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : t("health.duplicates.review_error"), "error")
    } finally {
      if (actionViewKey === duplicateViewRef.current) setReviewingGroupKey(null)
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
          <button type="button" onClick={() => void refreshGroups()} className="brutal-btn">
            {t("health.retry")}
          </button>
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
            <article key={group.key} className="border border-[var(--line)] bg-[var(--surface-hover)]">
              <div className="flex flex-col gap-3 border-b border-[var(--line)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[10px] text-[var(--muted)]">
                    {String(groupIndex + 1).padStart(2, "0")}
                  </span>
                  {group.reasons.map(reason => (
                    <ReasonTag key={reason} reason={reason} />
                  ))}
                </div>
                <div className="flex items-center gap-3">
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
        {nextCursor && (
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
    </section>
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
