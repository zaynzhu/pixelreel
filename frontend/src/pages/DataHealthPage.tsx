import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Link, useSearchParams } from "react-router-dom"
import { apiFetch } from "../api"
import { ImgWithFallback } from "../components/ImgWithFallback"
import { confirmDialog } from "../components/Toast"
import { DuplicateCandidatePanel } from "../components/data-health/DuplicateCandidatePanel"
import { proxiedImageUrl } from "../imageProxy"
import { useI18nStore } from "../stores/i18nStore"
import { useTaskStore } from "../stores/taskStore"
import { toast } from "../stores/toastStore"
import type {
  DataHealthCategory,
  DataHealthIssue,
  DataHealthIssueItem,
  DataHealthIssueResponse,
  DataHealthSummary,
} from "../types/dataHealth"

const CATEGORIES: DataHealthCategory[] = ["movie", "tv_show", "game"]
const ISSUES: Array<{ key: DataHealthIssue; field: keyof DataHealthSummary["categories"]["movie"] }> = [
  { key: "missing_poster", field: "missingPoster" },
  { key: "missing_overview", field: "missingOverview" },
  { key: "missing_date", field: "missingDate" },
  { key: "missing_external_id", field: "missingExternalId" },
]

interface RepairTaskResponse {
  taskId: string
  status: string
  type: string
  label: string
}

export default function DataHealthPage() {
  const { lang, t } = useI18nStore()
  const [searchParams] = useSearchParams()
  const initialCategory = searchParams.get("category")
  const initialView = searchParams.get("view")
  const initialGroupKey = searchParams.get("group")
  const focusedGameGroupKey = initialGroupKey?.startsWith("game:") && initialGroupKey.length <= 80
    ? initialGroupKey
    : null
  const tasks = useTaskStore(state => state.tasks)
  const taskStateReady = useTaskStore(state => state.initialized && state.pollError === null)
  const pollTasks = useTaskStore(state => state.pollTasks)
  const [summary, setSummary] = useState<DataHealthSummary | null>(null)
  const [category, setCategory] = useState<DataHealthCategory>(
    initialCategory === "movie" || initialCategory === "tv_show" || initialCategory === "game"
      ? initialCategory
      : "movie",
  )
  const [issue, setIssue] = useState<DataHealthIssue>("missing_poster")
  const [items, setItems] = useState<DataHealthIssueItem[]>([])
  const [total, setTotal] = useState(0)
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(true)
  const [loadingIssues, setLoadingIssues] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  const [issueError, setIssueError] = useState<string | null>(null)
  const [failedIssueFetch, setFailedIssueFetch] = useState<"records" | "more" | null>(null)
  const [startingRepair, setStartingRepair] = useState(false)
  const [repairTaskId, setRepairTaskId] = useState<string | null>(null)
  const [summaryRefreshVersion, setSummaryRefreshVersion] = useState(0)
  const [issueRefreshVersion, setIssueRefreshVersion] = useState(0)
  const [view, setView] = useState<"fields" | "duplicates">(
    initialView === "duplicates" ? "duplicates" : "fields",
  )
  const issueViewKey = `${category}:${issue}`
  const repairViewKey = `${view}:${issueViewKey}`
  const issueViewRef = useRef(issueViewKey)
  const repairViewRef = useRef(repairViewKey)
  const latestIssueRequest = useRef(0)
  const latestRepairRequest = useRef(0)
  const repairRequestActive = useRef(false)
  issueViewRef.current = issueViewKey
  repairViewRef.current = repairViewKey

  useEffect(() => () => {
    latestRepairRequest.current += 1
    repairRequestActive.current = false
  }, [])

  useEffect(() => {
    let active = true
    setLoadingSummary(true)
    setSummaryError(null)
    apiFetch<DataHealthSummary>("/data-health/summary")
      .then(data => {
        if (active) setSummary(data)
      })
      .catch(reason => {
        if (active) setSummaryError(reason instanceof Error ? reason.message : t("health.error"))
      })
      .finally(() => {
        if (active) setLoadingSummary(false)
      })
    return () => {
      active = false
    }
  }, [summaryRefreshVersion, t])

  const loadIssues = useCallback(async (cursor?: string) => {
    const params = new URLSearchParams({ category, issue, limit: "50" })
    if (cursor) params.set("cursor", cursor)
    return apiFetch<DataHealthIssueResponse>(`/data-health/issues?${params}`)
  }, [category, issue])

  useEffect(() => {
    let active = true
    const requestId = ++latestIssueRequest.current
    const requestViewKey = issueViewKey
    setLoadingIssues(true)
    setLoadingMore(false)
    setIssueError(null)
    setFailedIssueFetch(null)
    setItems([])
    setTotal(0)
    setNextCursor(null)
    loadIssues()
      .then(data => {
        if (!active || requestId !== latestIssueRequest.current || requestViewKey !== issueViewRef.current) return
        setItems(data.items)
        setTotal(data.total)
        setNextCursor(data.nextCursor)
      })
      .catch(reason => {
        if (active && requestId === latestIssueRequest.current && requestViewKey === issueViewRef.current) {
          setIssueError(reason instanceof Error ? reason.message : t("health.error"))
          setFailedIssueFetch("records")
        }
      })
      .finally(() => {
        if (active && requestId === latestIssueRequest.current && requestViewKey === issueViewRef.current) {
          setLoadingIssues(false)
        }
      })
    return () => {
      active = false
    }
  }, [issueViewKey, loadIssues, issueRefreshVersion, t])

  useEffect(() => {
    if (!repairTaskId) return
    const task = tasks.find(item => item.taskId === repairTaskId)
    if (!task || task.status === "running") return
    if (task.status === "completed") {
      toast(t("health.repair.completed"))
      setSummaryRefreshVersion(version => version + 1)
      setIssueRefreshVersion(version => version + 1)
    } else if (task.status === "cancelled") {
      toast(t("health.repair.cancelled"), "error")
    } else {
      toast(`${t("health.repair.failed")}: ${task.error || t("health.error")}`, "error")
    }
    setRepairTaskId(null)
  }, [repairTaskId, tasks, t])

  const selectedSummary = summary?.categories[category]
  const applicableIssues = useMemo(() => ISSUES.filter(item => (
    category !== "game" || (item.key !== "missing_overview" && item.key !== "missing_date")
  )), [category])
  const coverage = useMemo(() => {
    if (!selectedSummary || selectedSummary.total === 0) return 100
    const issueSignals = applicableIssues.reduce((sum, item) => (
      sum + Number(selectedSummary[item.field] || 0)
    ), 0)
    const slots = selectedSummary.total * applicableIssues.length
    return Math.max(0, Math.round((1 - issueSignals / slots) * 100))
  }, [applicableIssues, selectedSummary])
  const repairSupported = category !== "game" || issue === "missing_poster"
  const repairing = startingRepair || tasks.some(task => (
    task.type === "data-health-repair" && task.status === "running"
  ))

  const selectCategory = (nextCategory: DataHealthCategory) => {
    setCategory(nextCategory)
    if (nextCategory === "game" && (issue === "missing_overview" || issue === "missing_date")) {
      setIssue("missing_poster")
    }
  }

  const handleLoadMore = async () => {
    if (!nextCursor || loadingMore) return
    const requestId = latestIssueRequest.current
    const requestViewKey = issueViewKey
    setLoadingMore(true)
    setIssueError(null)
    setFailedIssueFetch(null)
    try {
      const cursor = nextCursor
      const data = await loadIssues(cursor)
      if (requestId !== latestIssueRequest.current || requestViewKey !== issueViewRef.current) return
      setItems(current => [...current, ...data.items])
      setNextCursor(data.nextCursor)
    } catch (reason) {
      if (requestId === latestIssueRequest.current && requestViewKey === issueViewRef.current) {
        setIssueError(reason instanceof Error ? reason.message : t("health.error"))
        setFailedIssueFetch("more")
      }
    } finally {
      if (requestId === latestIssueRequest.current && requestViewKey === issueViewRef.current) {
        setLoadingMore(false)
      }
    }
  }

  const retryIssues = () => {
    if (failedIssueFetch === "more") {
      void handleLoadMore()
      return
    }
    if (failedIssueFetch === "records") {
      setIssueRefreshVersion(version => version + 1)
    }
  }

  const handleRepair = async () => {
    if (!repairSupported || total === 0 || repairing || repairRequestActive.current) return
    if (!useTaskStore.getState().initialized || useTaskStore.getState().pollError !== null) {
      toast(t("task.panel.unavailable_hint"), "error")
      return
    }
    const requestId = ++latestRepairRequest.current
    const actionViewKey = repairViewKey
    const actionCategory = category
    const actionIssue = issue
    const actionLimit = Math.min(50, total)
    repairRequestActive.current = true
    setStartingRepair(true)
    try {
      if (!(await confirmDialog(t("health.repair.confirm", String(actionLimit))))) return
      if (requestId !== latestRepairRequest.current || actionViewKey !== repairViewRef.current) return
      if (!useTaskStore.getState().initialized || useTaskStore.getState().pollError !== null) {
        toast(t("task.panel.unavailable_hint"), "error")
        return
      }
      const task = await apiFetch<RepairTaskResponse>("/data-health/repair", {
        method: "POST",
        body: JSON.stringify({
          category: actionCategory,
          issue: actionIssue,
          limit: actionLimit,
        }),
      })
      if (requestId !== latestRepairRequest.current || actionViewKey !== repairViewRef.current) return
      setRepairTaskId(task.taskId)
      await pollTasks()
      if (requestId !== latestRepairRequest.current || actionViewKey !== repairViewRef.current) return
      toast(t("health.repair.started"))
    } catch (reason) {
      if (requestId === latestRepairRequest.current && actionViewKey === repairViewRef.current) {
        toast(`${t("health.repair.failed")}: ${reason instanceof Error ? reason.message : t("health.error")}`, "error")
      }
    } finally {
      if (requestId === latestRepairRequest.current) {
        repairRequestActive.current = false
        setStartingRepair(false)
      }
    }
  }

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden border border-[var(--line)] bg-[var(--surface)] p-6 sm:p-8">
        <div className="absolute inset-y-0 right-0 w-1/2 bg-[linear-gradient(90deg,transparent,rgba(212,255,0,0.06))]" />
        <div className="relative grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <span className="section-kicker">{t("health.kicker")}</span>
            <h1 className="mt-2 text-3xl text-white sm:text-4xl">{t("health.title")}</h1>
            <p className="mt-3 max-w-2xl text-xs leading-6 text-[var(--muted)] sm:text-sm">
              {t("health.desc")}
            </p>
          </div>
          <div className="min-w-48 border-l-2 border-[var(--accent)] pl-5">
            <div className="text-[10px] uppercase tracking-[0.24em] text-[var(--muted)]">
              {t("health.coverage")}
            </div>
            <div className="mt-1 text-5xl font-bold text-[var(--accent)]">
              {loadingSummary || !selectedSummary ? "--" : `${coverage}%`}
            </div>
            <div className="mt-1 text-[10px] uppercase tracking-widest text-[var(--muted)]">
              {t("health.records", String(selectedSummary?.total ?? 0))}
            </div>
          </div>
        </div>
      </section>

      {summaryError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-4 border border-[var(--accent-deep)] bg-[rgba(255,68,0,0.08)] px-5 py-4">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--accent-deep)]">
              {t("health.summary_error")}
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">{summaryError}</p>
          </div>
          <button type="button" onClick={() => setSummaryRefreshVersion(version => version + 1)} className="brutal-btn">
            {t("health.retry")}
          </button>
        </div>
      )}

      <section className="border border-[var(--line)] bg-[var(--surface)] p-4 sm:p-6">
        <div className="mb-4 grid gap-px border border-[var(--line)] bg-[var(--line)] sm:grid-cols-2">
          {(["fields", "duplicates"] as const).map(item => (
            <button
              key={item}
              type="button"
              onClick={() => setView(item)}
              disabled={startingRepair}
              className={`bg-[var(--surface)] px-4 py-3 text-left text-xs uppercase tracking-widest transition-colors hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-50 ${
                view === item ? "text-[var(--accent)] shadow-[inset_0_-2px_0_var(--accent)]" : "text-[var(--muted)]"
              }`}
            >
              {t(`health.view.${item}`)}
            </button>
          ))}
        </div>
        <div className="grid gap-px border border-[var(--line)] bg-[var(--line)] sm:grid-cols-3">
          {CATEGORIES.map(item => (
            <button
              key={item}
              type="button"
              onClick={() => selectCategory(item)}
              disabled={startingRepair}
              className={`flex items-center justify-between bg-[var(--surface)] px-4 py-4 text-left transition-colors hover:bg-[var(--surface-hover)] disabled:cursor-not-allowed disabled:opacity-50 ${
                category === item ? "shadow-[inset_0_-2px_0_var(--accent)]" : ""
              }`}
            >
              <span className={category === item ? "text-[var(--accent)]" : "text-white"}>
                {t(`health.category.${item}`)}
              </span>
              <span className="font-mono text-xs text-[var(--muted)]">
                {summary?.categories[item].total ?? "--"}
              </span>
            </button>
          ))}
        </div>

        {view === "fields" && <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {applicableIssues.map(item => {
            const count = Number(selectedSummary?.[item.field] ?? 0)
            const active = issue === item.key
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setIssue(item.key)}
                disabled={startingRepair}
                className={`group border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  active
                    ? "border-[var(--accent)] bg-[rgba(212,255,0,0.06)]"
                    : "border-[var(--line)] hover:border-[var(--muted)]"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="text-[10px] uppercase tracking-widest text-[var(--muted)]">
                    {t(`health.issue.${item.key}`)}
                  </span>
                  <span className={`font-mono text-2xl ${count > 0 ? "text-[var(--accent-deep)]" : "text-[var(--accent)]"}`}>
                    {loadingSummary ? "--" : count}
                  </span>
                </div>
                <div className="mt-4 h-px bg-[var(--line)]">
                  <div
                    className="h-px bg-[var(--accent)] transition-all"
                    style={{
                      width: selectedSummary?.total
                        ? `${Math.min(100, count / selectedSummary.total * 100)}%`
                        : "0%",
                    }}
                  />
                </div>
              </button>
            )
          })}
        </div>}
      </section>

      {view === "duplicates" ? (
        <DuplicateCandidatePanel
          category={category}
          focusGroupKey={category === "game" ? focusedGameGroupKey : null}
        />
      ) : <section className="border border-[var(--line)] bg-[var(--surface)]">
        <div className="flex flex-col gap-4 border-b border-[var(--line)] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="section-kicker">{t("health.queue")}</span>
            <h2 className="text-lg text-white">{t(`health.issue.${issue}`)}</h2>
            {total > 0 && !repairSupported && (
              <p className="mt-1 text-[10px] text-[var(--muted)]">{t("health.repair.manual")}</p>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-[var(--muted)]">
              {t("health.matches", String(total))}
            </span>
            {total > 0 && repairSupported && (
              <button
                type="button"
                onClick={handleRepair}
                disabled={!taskStateReady || repairing}
                className="brutal-btn-accent px-4 text-[10px] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {repairing
                  ? t("health.repair.running")
                  : t("health.repair.action", String(Math.min(50, total)))}
              </button>
            )}
          </div>
        </div>

        {issueError && (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-4 border-b border-[var(--accent-deep)] bg-[rgba(255,68,0,0.08)] px-5 py-4">
            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--accent-deep)]">
                {t("health.issues_error")}
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">{issueError}</p>
            </div>
            <button type="button" onClick={retryIssues} disabled={!failedIssueFetch} className="brutal-btn">
              {t("health.retry")}
            </button>
          </div>
        )}

        {loadingIssues ? (
          <div className="px-5 py-16 text-center text-xs uppercase tracking-widest text-[var(--muted)]">
            {t("health.loading")}
          </div>
        ) : issueError && items.length === 0 ? null : items.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <div className="text-2xl text-[var(--accent)]">✓</div>
            <p className="mt-3 text-sm text-white">{t("health.clean")}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">{t("health.clean_desc")}</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--line)]">
            {items.map(item => {
              const poster = proxiedImageUrl(item.posterUrl)
              return (
                <article key={`${item.category}-${item.id}`} className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-4 px-5 py-3 hover:bg-[var(--surface-hover)] sm:grid-cols-[3rem_minmax(0,1fr)_auto_auto]">
                  <div className="h-12 w-9 overflow-hidden border border-[var(--line)] bg-black">
                    {poster ? (
                      <ImgWithFallback
                        src={poster}
                        alt={item.title}
                        className="h-full w-full object-cover"
                        fallback={<div className="flex h-full items-center justify-center text-[8px] text-[var(--muted)]">N/A</div>}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[8px] text-[var(--muted)]">N/A</div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-sm text-white">{item.title}</h3>
                    <p className="mt-1 font-mono text-[9px] uppercase tracking-wider text-[var(--muted)]">
                      {t(`health.category.${item.category}`)} // ID {item.id}
                    </p>
                  </div>
                  <time className="hidden font-mono text-[9px] text-[var(--muted)] sm:block">
                    {new Date(item.updatedAt).toLocaleDateString(lang === "zh" ? "zh-CN" : "en-US")}
                  </time>
                  <Link
                    to={`/library/${item.category}/${item.id}`}
                    className="brutal-btn whitespace-nowrap px-3 text-[9px]"
                  >
                    {t("health.open_detail")} →
                  </Link>
                </article>
              )
            })}
          </div>
        )}

        {nextCursor && !loadingIssues && !failedIssueFetch && (
          <div className="border-t border-[var(--line)] p-4 text-center">
            <button type="button" onClick={handleLoadMore} disabled={loadingMore} className="brutal-btn">
              {loadingMore ? t("health.loading") : t("health.more")}
            </button>
          </div>
        )}
      </section>}
    </div>
  )
}
