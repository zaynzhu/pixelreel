import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Check, CircleOff, RefreshCw, Settings2, Square } from 'lucide-react'
import { apiFetch } from '../api'
import { useI18nStore } from '../stores/i18nStore'
import { useTaskStore, type Task } from '../stores/taskStore'
import { toast } from '../stores/toastStore'
import type { RecordStatus } from '../types/library'
import type {
  SyncAvailability,
  SyncHistoryEntry,
  SyncHistoryResponse,
  SyncResult,
  SyncSourceKey,
  SyncSourceStatus,
  SyncTaskResponse,
  SyncUnavailableReason,
} from '../types/sync'

const SOURCE_ORDER: SyncSourceKey[] = ['douban', 'trakt', 'steam']
const TASK_TYPES: Partial<Record<SyncSourceKey, string>> = {
  douban: 'douban-harvest',
  trakt: 'trakt-import',
  steam: 'steam-owned',
}

type DirectSource = 'steam' | 'trakt'

export default function SyncPage() {
  const { t, lang } = useI18nStore()
  const tasks = useTaskStore(state => state.tasks)
  const cancellingTaskIds = useTaskStore(state => state.cancellingTaskIds)
  const tasksInitialized = useTaskStore(state => state.initialized)
  const taskPollError = useTaskStore(state => state.pollError)
  const cancelTask = useTaskStore(state => state.cancelTask)
  const pollTasks = useTaskStore(state => state.pollTasks)
  const [status, setStatus] = useState<SyncSourceStatus | null>(null)
  const [history, setHistory] = useState<SyncHistoryResponse>()
  const [loading, setLoading] = useState(true)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [activeAction, setActiveAction] = useState<string | null>(null)
  const latestStatusRequest = useRef(0)
  const latestHistoryRequest = useRef(0)
  const [directStatuses, setDirectStatuses] = useState<Record<DirectSource, RecordStatus>>({
    steam: 'WANT',
    trakt: 'WANT',
  })
  const taskStateReady = tasksInitialized && taskPollError === null
  const sourceStatusReady = status !== null && statusError === null && !loading

  const loadStatus = useCallback(async () => {
    const requestId = ++latestStatusRequest.current
    setLoading(true)
    try {
      const nextStatus = await apiFetch<SyncSourceStatus>('/import/sources/status')
      if (requestId !== latestStatusRequest.current) return
      setStatus(nextStatus)
      setStatusError(null)
    } catch (reason) {
      if (requestId !== latestStatusRequest.current) return
      setStatusError(reason instanceof Error ? reason.message : t('sync.status_error'))
    } finally {
      if (requestId === latestStatusRequest.current) setLoading(false)
    }
  }, [t])

  const loadHistory = useCallback(async () => {
    const requestId = ++latestHistoryRequest.current
    setHistoryError(null)
    try {
      const nextHistory = await apiFetch<SyncHistoryResponse>('/import/sources/history')
      if (requestId !== latestHistoryRequest.current) return
      setHistory(nextHistory)
    } catch (reason) {
      if (requestId !== latestHistoryRequest.current) return
      setHistoryError(reason instanceof Error ? reason.message : t('sync.history.error'))
    }
  }, [t])

  useEffect(() => {
    void loadStatus()
    return () => {
      latestStatusRequest.current++
    }
  }, [loadStatus])

  const sourceTasks = useMemo(() => tasks.filter(task =>
    Object.values(TASK_TYPES).includes(task.type)
  ), [tasks])
  const syncTaskVersion = useMemo(() => sourceTasks
    .map(task => `${task.taskId}:${task.status}:${task.completedAt ?? ''}`)
    .join('|'), [sourceTasks])

  useEffect(() => {
    void loadHistory()
    return () => {
      latestHistoryRequest.current++
    }
  }, [loadHistory, syncTaskVersion])

  const runningCount = sourceTasks.filter(task => task.status === 'running').length
  const availableCount = status
    ? SOURCE_ORDER.filter(source => status[source].available).length
    : 0

  const latestTask = (source: SyncSourceKey) => {
    const type = TASK_TYPES[source]
    return type ? tasks.find(task => task.type === type) ?? null : null
  }

  const startDouban = async (mode: 'json' | 'incremental' | 'full') => {
    const taskState = useTaskStore.getState()
    if (!taskState.initialized || taskState.pollError !== null) {
      toast(t('task.panel.unavailable_hint'), 'error')
      return
    }
    const actionKey = `douban-${mode}`
    setActiveAction(actionKey)
    try {
      await apiFetch<SyncTaskResponse>(`/import/douban-harvest?mode=${mode}`, { method: 'POST' })
      await pollTasks()
      toast(t('sync.task_started'))
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : t('sync.start_error'), 'error')
    } finally {
      setActiveAction(null)
    }
  }

  const startSourceTask = async (path: string, actionKey: string) => {
    const taskState = useTaskStore.getState()
    if (!taskState.initialized || taskState.pollError !== null) {
      toast(t('task.panel.unavailable_hint'), 'error')
      return
    }
    setActiveAction(actionKey)
    try {
      await apiFetch<SyncTaskResponse>(path, { method: 'POST' })
      await pollTasks()
      toast(t('sync.task_started'))
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : t('sync.start_error'), 'error')
    } finally {
      setActiveAction(null)
    }
  }

  if (loading && !status) return <SyncState label={t('sync.loading')} />

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden border border-[var(--line)] bg-[var(--surface)]">
        <div className="absolute inset-y-0 right-0 w-1/2 bg-[radial-gradient(circle_at_center,rgba(212,255,0,0.08),transparent_65%)]" />
        <div className="relative grid gap-px bg-[var(--line)] lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="bg-[var(--surface)] p-6 sm:p-8">
            <span className="section-kicker">{t('sync.kicker')}</span>
            <h1 className="mt-2 max-w-3xl font-display text-3xl leading-tight text-white sm:text-5xl">
              {t('sync.title')}
            </h1>
            <p className="mt-4 max-w-2xl text-xs leading-6 text-[var(--muted)] sm:text-sm">{t('sync.desc')}</p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link to="/settings" className="brutal-btn">
                <Settings2 className="h-3.5 w-3.5" /> {t('sync.configure')}
              </Link>
              <Link to="/sync/review" className="brutal-btn-accent">
                {t('sync.review_queue')} <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-3 bg-[var(--line)] lg:grid-cols-1">
            <StatusMetric label={t('sync.metric.sources')} value={SOURCE_ORDER.length} />
            <StatusMetric label={t('sync.metric.available')} value={availableCount} accent />
            <StatusMetric label={t('sync.metric.running')} value={runningCount} warning={runningCount > 0} />
          </div>
        </div>
      </section>

      {statusError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-4 border border-red-500/50 bg-red-500/10 p-4 text-xs text-red-300">
          <div>
            <p>{statusError}</p>
            {status && <p className="mt-1 text-[10px] text-[var(--muted)]">{t('sync.status_stale_hint')}</p>}
          </div>
          <button type="button" onClick={() => void loadStatus()} disabled={loading} className="brutal-btn">
            {loading ? t('sync.loading') : t('sync.retry')}
          </button>
        </div>
      )}

      {historyError && (
        <div className="flex items-center justify-between gap-4 border border-yellow-500/40 bg-yellow-500/10 p-4 text-xs text-yellow-300">
          <span>{historyError}</span>
          <button type="button" onClick={() => void loadHistory()} className="brutal-btn">{t('sync.retry')}</button>
        </div>
      )}

      {taskPollError !== null && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-4 border border-red-500/50 bg-red-500/10 p-4 text-xs text-red-300">
          <div>
            <p>{taskPollError || t('task.panel.load_error')}</p>
            <p className="mt-1 text-[10px] text-[var(--muted)]">{t('task.panel.stale_hint')}</p>
          </div>
          <button type="button" onClick={() => void pollTasks()} className="brutal-btn">{t('sync.retry')}</button>
        </div>
      )}
      {!tasksInitialized && taskPollError === null && (
        <div className="border border-[var(--line)] bg-black/20 p-4 text-xs text-[var(--muted)]">
          {t('task.panel.initializing')}
        </div>
      )}

      {status && (
        <div className="grid gap-5 xl:grid-cols-2">
          <SourceCard
            source="douban"
            availability={status.douban}
            task={latestTask('douban')}
            history={history?.douban}
            settingsCategory="douban"
          >
            <div className="grid gap-2 sm:grid-cols-3">
              {(['json', 'incremental', 'full'] as const).map(mode => (
                <SyncButton
                  key={mode}
                  label={t(`sync.douban.${mode}`)}
                  onClick={() => void startDouban(mode)}
                  disabled={!sourceStatusReady || !taskStateReady || !status.douban.modes[mode].available || activeAction != null || latestTask('douban')?.status === 'running'}
                  active={activeAction === `douban-${mode}`}
                  title={reasonLabel(status.douban.modes[mode].reason, t)}
                />
              ))}
            </div>
          </SourceCard>

          <SourceCard
            source="trakt"
            availability={status.trakt}
            task={latestTask('trakt')}
            history={history?.trakt}
            settingsCategory="trakt"
          >
            <StatusSelect
              value={directStatuses.trakt}
              onChange={value => setDirectStatuses(current => ({ ...current, trakt: value }))}
            />
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <SyncButton
                label={t('sync.trakt.movies')}
                onClick={() => void startSourceTask(`/trakt/import/movies/task?status=${directStatuses.trakt}`, 'trakt-movies')}
                disabled={!sourceStatusReady || !taskStateReady || !status.trakt.available || activeAction != null || latestTask('trakt')?.status === 'running'}
                active={activeAction === 'trakt-movies'}
              />
              <SyncButton
                label={t('sync.trakt.shows')}
                onClick={() => void startSourceTask(`/trakt/import/shows/task?status=${directStatuses.trakt}`, 'trakt-shows')}
                disabled={!sourceStatusReady || !taskStateReady || !status.trakt.available || activeAction != null || latestTask('trakt')?.status === 'running'}
                active={activeAction === 'trakt-shows'}
              />
            </div>
          </SourceCard>

          <SourceCard
            source="steam"
            availability={status.steam}
            task={latestTask('steam')}
            history={history?.steam}
            settingsCategory="steam"
          >
            <StatusSelect
              value={directStatuses.steam}
              onChange={value => setDirectStatuses(current => ({ ...current, steam: value }))}
            />
            <SyncButton
              label={t('sync.steam.owned')}
              onClick={() => void startSourceTask(`/import/steam/owned/task?status=${directStatuses.steam}`, 'steam-owned')}
              disabled={!sourceStatusReady || !taskStateReady || !status.steam.available || activeAction != null || latestTask('steam')?.status === 'running'}
              active={activeAction === 'steam-owned'}
              className="mt-3 w-full"
            />
          </SourceCard>

        </div>
      )}

      <section className="border border-dashed border-[var(--line)] bg-black/20 p-5 sm:p-6">
        <span className="section-kicker">{t('sync.experimental_kicker')}</span>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {(['xbox', 'psn'] as const).map(source => (
            <div key={source} className="flex items-start justify-between gap-4 border border-[var(--line)] bg-[var(--surface)] p-4 opacity-75">
              <div>
                <h2 className="font-display text-xl text-white">{t(`sync.source.${source}`)}</h2>
                <p className="mt-2 text-[10px] leading-5 text-[var(--muted)]">{t(`sync.source.${source}.desc`)}</p>
              </div>
              <span className="shrink-0 font-mono text-[8px] uppercase tracking-widest text-yellow-400">
                {t('sync.state.experimental')}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="border border-[var(--line)] bg-[var(--surface)]">
        <header className="flex flex-wrap items-end justify-between gap-3 border-b border-[var(--line)] p-5 sm:p-6">
          <div>
            <span className="section-kicker">{t('sync.tasks_kicker')}</span>
            <h2 className="mt-2 text-2xl text-white">{t('sync.tasks_title')}</h2>
          </div>
          <span className="font-mono text-[9px] uppercase tracking-widest text-[var(--muted)]">
            {t('sync.tasks_retention')}
          </span>
        </header>
        {sourceTasks.length ? (
          <div className="divide-y divide-[var(--line)]">
            {sourceTasks.map(task => (
              <TaskRow
                key={task.taskId}
                task={task}
                lang={lang}
                cancelling={cancellingTaskIds.includes(task.taskId)}
                onCancel={() => {
                  void cancelTask(task.taskId).catch(reason => {
                    toast(reason instanceof Error ? reason.message : t('task.panel.cancel_failed'), 'error')
                  })
                }}
              />
            ))}
          </div>
        ) : taskStateReady ? (
          <p className="p-6 text-xs text-[var(--muted)]">{t('sync.tasks_empty')}</p>
        ) : (
          <p className="p-6 text-xs text-[var(--muted)]">
            {taskPollError !== null ? t('task.panel.unavailable_hint') : t('task.panel.initializing')}
          </p>
        )}
      </section>
    </div>
  )
}

function SourceCard({
  source,
  availability,
  task,
  history,
  settingsCategory,
  children,
}: {
  source: SyncSourceKey
  availability: SyncAvailability
  task: Task | null
  history: SyncHistoryEntry | null | undefined
  settingsCategory: string
  children: React.ReactNode
}) {
  const { t } = useI18nStore()
  const running = task?.status === 'running'
  return (
    <section className="relative overflow-hidden border border-[var(--line)] bg-[var(--surface)]">
      <div className={`absolute inset-y-0 left-0 w-1 ${running ? 'bg-[var(--accent-deep)] animate-pulse' : availability.available ? 'bg-[var(--accent)]' : 'bg-[var(--line)]'}`} />
      <header className="flex items-start justify-between gap-4 border-b border-[var(--line)] p-5 pl-6">
        <div>
          <div className="flex items-center gap-2">
            <SourceSignal available={availability.available} running={running} />
            <h2 className="font-display text-2xl text-white">{t(`sync.source.${source}`)}</h2>
          </div>
          <p className="mt-2 max-w-md text-[10px] leading-5 text-[var(--muted)]">{t(`sync.source.${source}.desc`)}</p>
        </div>
        <span className={`shrink-0 font-mono text-[9px] uppercase tracking-widest ${availability.available ? 'text-[var(--accent)]' : 'text-yellow-400'}`}>
          {running ? t('sync.state.running') : availability.available ? t('sync.state.ready') : t('sync.state.config')}
        </span>
      </header>
      <div className="p-5 pl-6">
        {!availability.available && (
          <div className="mb-4 flex items-center justify-between gap-3 border border-yellow-500/30 bg-yellow-500/10 p-3 text-[10px] text-yellow-300">
            <span>{reasonLabel(availability.reason, t)}</span>
            <Link to={`/settings?category=${settingsCategory}`} className="font-bold uppercase tracking-widest text-white hover:text-[var(--accent)]">
              {t('sync.fix_config')} →
            </Link>
          </div>
        )}
        {children}
        {task && <TaskSummary task={task} />}
        {history && history.taskId !== task?.taskId && <SyncHistorySummary entry={history} />}
        {history === null && <p className="mt-4 border-t border-dashed border-[var(--line)] pt-4 text-[10px] text-[var(--muted)]">{t('sync.history.empty')}</p>}
      </div>
    </section>
  )
}

function SyncHistorySummary({ entry }: { entry: SyncHistoryEntry }) {
  const { t, lang } = useI18nStore()
  return (
    <div className="mt-4 border-t border-dashed border-[var(--line)] pt-4 text-[10px] text-[var(--muted)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-bold uppercase tracking-widest text-white">{t('sync.history.title')}</span>
        <span>{taskStatusLabel(entry.status, t)}</span>
      </div>
      <p className="mt-2">{new Date(entry.completedAt).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US')}</p>
      {entry.result && <ResultSummary result={entry.result} completedAt={null} compact />}
      {entry.error && <p className="mt-2 text-red-400">{entry.error}</p>}
    </div>
  )
}

function SourceSignal({ available, running }: { available: boolean; running: boolean }) {
  if (running) return <RefreshCw className="h-4 w-4 animate-spin text-[var(--accent-deep)]" />
  if (available) return <Check className="h-4 w-4 text-[var(--accent)]" />
  return <CircleOff className="h-4 w-4 text-yellow-400" />
}

function SyncButton({ label, onClick, disabled, active, title, className = '' }: {
  label: string
  onClick: () => void
  disabled: boolean
  active: boolean
  title?: string
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${active ? 'brutal-btn-accent' : 'brutal-btn'} justify-between ${className}`}
    >
      <span>{active ? '…' : '▶'} {label}</span>
    </button>
  )
}

function StatusSelect({ value, onChange }: { value: RecordStatus; onChange: (value: RecordStatus) => void }) {
  const { t } = useI18nStore()
  return (
    <label className="block text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
      {t('sync.initial_status')}
      <select value={value} onChange={event => onChange(event.target.value as RecordStatus)} className="tech-input mt-2 w-full">
        <option value="UNSET">{t('global.status.unset')}</option>
        <option value="WANT">{t('global.status.want')}</option>
        <option value="IN_PROGRESS">{t('global.status.active')}</option>
        <option value="DONE">{t('global.status.done')}</option>
        <option value="DROPPED">{t('global.status.dropped')}</option>
      </select>
    </label>
  )
}

function TaskSummary({ task }: { task: Task }) {
  const { t } = useI18nStore()
  const progress = task.progress.total > 0
    ? `${task.progress.processed}/${task.progress.total}`
    : task.progress.processed > 0 ? String(task.progress.processed) : '—'
  return (
    <div className="mt-4 border-t border-[var(--line)] pt-4 text-[10px] text-[var(--muted)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-bold text-white">{task.label}</span>
        <span>{taskStatusLabel(task.status, t)}</span>
      </div>
      {task.status === 'running' && <p className="mt-2">{t('sync.progress')}: {progress} {task.progress.currentTitle}</p>}
      {task.result && <ResultSummary result={task.result} completedAt={task.completedAt} compact />}
      {task.error && <p className="mt-2 text-red-400">{task.error}</p>}
    </div>
  )
}

function ResultSummary({ result, completedAt, compact = false }: { result: SyncResult; completedAt: string | null; compact?: boolean }) {
  const { t, lang } = useI18nStore()
  return (
    <div className={`${compact ? 'mt-2' : 'mt-4 border-t border-[var(--line)] pt-4'} text-[10px] text-[var(--muted)]`}>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <span>{t('sync.result.total')} <strong className="text-white">{result.total}</strong></span>
        <span>{t('sync.result.imported')} <strong className="text-[var(--accent)]">{result.imported}</strong></span>
        <span>{t('sync.result.skipped')} <strong className="text-white">{result.skipped}</strong></span>
        <span>{t('sync.result.errors')} <strong className={result.errors.length ? 'text-red-400' : 'text-white'}>{result.errors.length}</strong></span>
      </div>
      {completedAt && <p className="mt-1">{new Date(completedAt).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US')}</p>}
      {result.errors[0] && <p className="mt-2 text-red-400">{result.errors[0]}</p>}
    </div>
  )
}

function TaskRow({ task, lang, cancelling, onCancel }: {
  task: Task;
  lang: string;
  cancelling: boolean;
  onCancel: () => void;
}) {
  const { t } = useI18nStore()
  return (
    <div className="grid gap-3 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-6">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-white">{task.label}</span>
          <span className="font-mono text-[8px] uppercase tracking-widest text-[var(--muted)]">{task.type}</span>
        </div>
        <p className="mt-1 text-[10px] text-[var(--muted)]">
          {new Date(task.startedAt).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US')} · {taskStatusLabel(task.status, t)}
        </p>
        {task.error && <p className="mt-2 text-[10px] text-red-400">{task.error}</p>}
      </div>
      {task.status === 'running' ? (
        <button type="button" onClick={onCancel} disabled={cancelling} className="brutal-btn text-red-300">
          <Square className="h-3 w-3" /> {cancelling ? t('task.panel.cancelling') : t('sync.cancel')}
        </button>
      ) : task.result ? (
        <div className="flex gap-3 font-mono text-[9px] text-[var(--muted)]">
          <span>+{task.result.imported}</span>
          <span>={task.result.skipped}</span>
          <span className={task.result.errors.length ? 'text-red-400' : ''}>!{task.result.errors.length}</span>
        </div>
      ) : null}
    </div>
  )
}

function StatusMetric({ label, value, accent = false, warning = false }: { label: string; value: number; accent?: boolean; warning?: boolean }) {
  return (
    <div className="flex items-end justify-between bg-[var(--surface)] p-4 lg:p-5">
      <span className="font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--muted)]">{label}</span>
      <strong className={`font-display text-3xl ${warning ? 'text-[var(--accent-deep)]' : accent ? 'text-[var(--accent)]' : 'text-white'}`}>{value}</strong>
    </div>
  )
}

function SyncState({ label }: { label: string }) {
  return (
    <div className="flex min-h-[360px] items-center justify-center border border-[var(--line)] bg-[var(--surface)]">
      <div className="flex items-center gap-3 text-xs uppercase tracking-widest text-[var(--muted)]">
        <RefreshCw className="h-4 w-4 animate-spin text-[var(--accent)]" /> {label}
      </div>
    </div>
  )
}

function reasonLabel(reason: SyncUnavailableReason, t: ReturnType<typeof useI18nStore.getState>['t']) {
  return reason ? t(`sync.reason.${reason}`) : ''
}

function taskStatusLabel(status: Task['status'] | SyncHistoryEntry['status'], t: ReturnType<typeof useI18nStore.getState>['t']) {
  return t(`task.panel.status.${status === 'completed' ? 'done' : status}`)
}
