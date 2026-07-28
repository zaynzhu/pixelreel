import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Check, CircleOff, RefreshCw, Settings2, Square } from 'lucide-react'
import { apiFetch } from '../api'
import { useI18nStore } from '../stores/i18nStore'
import { useTaskStore, type Task } from '../stores/taskStore'
import { toast } from '../stores/toastStore'
import type { RecordStatus } from '../types/library'
import type {
  PlatformConnectionResponse,
  SyncAvailability,
  SyncHistoryEntry,
  SyncHistoryResponse,
  SyncResult,
  SyncSourceKey,
  SyncSourceStatus,
  SyncTaskResponse,
  SyncUnavailableReason,
} from '../types/sync'
import { applyPlatformAccountOverride } from '../types/sync'

const SOURCE_ORDER: SyncSourceKey[] = ['douban', 'trakt', 'steam', 'xbox', 'psn']
const TASK_TYPES: Partial<Record<SyncSourceKey, string>> = {
  douban: 'douban-harvest',
  trakt: 'trakt-import',
  steam: 'steam-owned',
  xbox: 'xbox-owned',
  psn: 'psn-owned',
}

type DirectSource = 'steam' | 'trakt' | 'xbox' | 'psn'
type PlatformSource = 'xbox' | 'psn'
type XboxProvider = 'microsoft' | 'openxbl'
type ConnectionResult = { ok: true } | { ok: false; error: string }
type PlatformAccounts = Record<PlatformSource, string>
type RememberedPlatformAccounts = Record<PlatformSource, boolean>

const PLATFORM_ACCOUNT_STORAGE_KEY = 'pixelreel.sync.platform-accounts.v1'

function loadRememberedPlatformAccounts(): PlatformAccounts {
  const emptyAccounts = { xbox: '', psn: '' }
  try {
    const stored = JSON.parse(localStorage.getItem(PLATFORM_ACCOUNT_STORAGE_KEY) ?? '{}') as Partial<PlatformAccounts>
    return {
      xbox: typeof stored.xbox === 'string' && stored.xbox.length <= 100 ? stored.xbox : '',
      psn: typeof stored.psn === 'string' && stored.psn.length <= 100 ? stored.psn : '',
    }
  } catch {
    return emptyAccounts
  }
}

function saveRememberedPlatformAccounts(
  accounts: PlatformAccounts,
  remembered: RememberedPlatformAccounts,
) {
  const stored = {
    xbox: remembered.xbox ? accounts.xbox : '',
    psn: remembered.psn ? accounts.psn : '',
  }
  try {
    if (stored.xbox || stored.psn) {
      localStorage.setItem(PLATFORM_ACCOUNT_STORAGE_KEY, JSON.stringify(stored))
    } else {
      localStorage.removeItem(PLATFORM_ACCOUNT_STORAGE_KEY)
    }
  } catch {
    // 浏览器拒绝本地存储时仍允许本次同步
  }
}

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
  const latestConnectionRequest = useRef(0)
  const pageMounted = useRef(true)
  const actionRequestActive = useRef(false)
  const [directStatuses, setDirectStatuses] = useState<Record<DirectSource, RecordStatus>>({
    steam: 'WANT',
    trakt: 'WANT',
    xbox: 'WANT',
    psn: 'WANT',
  })
  const [platformAccounts, setPlatformAccounts] = useState<PlatformAccounts>(loadRememberedPlatformAccounts)
  const [rememberedPlatformAccounts, setRememberedPlatformAccounts] = useState<RememberedPlatformAccounts>(() => {
    const remembered = loadRememberedPlatformAccounts()
    return { xbox: Boolean(remembered.xbox), psn: Boolean(remembered.psn) }
  })
  const [xboxProvider, setXboxProvider] = useState<XboxProvider>('microsoft')
  const [connectionResults, setConnectionResults] = useState<Partial<Record<PlatformSource, ConnectionResult>>>({})
  const taskStateReady = tasksInitialized && taskPollError === null
  const sourceStatusReady = status !== null && statusError === null && !loading

  const loadStatus = useCallback(async () => {
    const requestId = ++latestStatusRequest.current
    latestConnectionRequest.current++
    setLoading(true)
    setConnectionResults({})
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
    if (new URLSearchParams(window.location.search).get('xboxAuth') === 'success') {
      toast(t('sync.xbox.auth_success'))
      window.history.replaceState({}, '', window.location.pathname)
    }
    return () => {
      latestStatusRequest.current++
      latestConnectionRequest.current++
    }
  }, [loadStatus])

  useEffect(() => {
    pageMounted.current = true
    return () => {
      pageMounted.current = false
      latestConnectionRequest.current++
    }
  }, [])

  useEffect(() => {
    saveRememberedPlatformAccounts(platformAccounts, rememberedPlatformAccounts)
  }, [platformAccounts, rememberedPlatformAccounts])

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
  const xboxAvailability = status
    ? xboxProvider === 'openxbl'
      ? applyPlatformAccountOverride(status.xbox.providers.openxbl, platformAccounts.xbox)
      : status.xbox.providers.microsoft
    : null
  const psnAvailability = status
    ? applyPlatformAccountOverride(status.psn, platformAccounts.psn)
    : null
  const availableCount = status
    ? SOURCE_ORDER.filter(source => {
      if (source === 'xbox') return xboxAvailability?.available
      if (source === 'psn') return psnAvailability?.available
      return status[source].available
    }).length
    : 0

  const latestTask = (source: SyncSourceKey) => {
    const type = TASK_TYPES[source]
    return type ? tasks.find(task => task.type === type) ?? null : null
  }

  const startDouban = async (mode: 'json' | 'incremental' | 'full') => {
    if (actionRequestActive.current) return
    const taskState = useTaskStore.getState()
    if (!taskState.initialized || taskState.pollError !== null) {
      toast(t('task.panel.unavailable_hint'), 'error')
      return
    }
    actionRequestActive.current = true
    const actionKey = `douban-${mode}`
    setActiveAction(actionKey)
    try {
      await apiFetch<SyncTaskResponse>(`/import/douban-harvest?mode=${mode}`, { method: 'POST' })
      await pollTasks()
      toast(t('sync.task_started'))
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : t('sync.start_error'), 'error')
    } finally {
      actionRequestActive.current = false
      if (pageMounted.current) setActiveAction(null)
    }
  }

  const startSourceTask = async (path: string, actionKey: string) => {
    if (actionRequestActive.current) return
    const taskState = useTaskStore.getState()
    if (!taskState.initialized || taskState.pollError !== null) {
      toast(t('task.panel.unavailable_hint'), 'error')
      return
    }
    actionRequestActive.current = true
    setActiveAction(actionKey)
    try {
      await apiFetch<SyncTaskResponse>(path, { method: 'POST' })
      await pollTasks()
      toast(t('sync.task_started'))
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : t('sync.start_error'), 'error')
    } finally {
      actionRequestActive.current = false
      setActiveAction(null)
    }
  }

  const verifyPlatformConnection = async (source: PlatformSource) => {
    if (actionRequestActive.current) return
    actionRequestActive.current = true
    const requestId = ++latestConnectionRequest.current
    const actionKey = `${source}-verify`
    const accountKey = source === 'xbox' ? 'gamertag' : 'psnId'
    const account = platformAccounts[source].trim()
    setActiveAction(actionKey)
    setConnectionResults(current => ({ ...current, [source]: undefined }))
    try {
      await apiFetch<PlatformConnectionResponse>(
        source === 'xbox'
          ? `/import/xbox/verify?provider=${xboxProvider}&gamertag=${encodeURIComponent(account)}`
          : `/import/psn/verify?${accountKey}=${encodeURIComponent(account)}`,
        { method: 'POST' },
      )
      if (requestId !== latestConnectionRequest.current) return
      setConnectionResults(current => ({ ...current, [source]: { ok: true } }))
    } catch (reason) {
      if (requestId !== latestConnectionRequest.current) return
      setConnectionResults(current => ({
        ...current,
        [source]: {
          ok: false,
          error: reason instanceof Error ? reason.message : t('sync.connection.failed'),
        },
      }))
    } finally {
      actionRequestActive.current = false
      setActiveAction(null)
    }
  }

  const connectMicrosoftXbox = async () => {
    if (actionRequestActive.current) return
    actionRequestActive.current = true
    setActiveAction('xbox-auth')
    try {
      const result = await apiFetch<{ url: string }>('/xbox/auth-url', { method: 'POST' })
      window.location.assign(result.url)
    } catch (reason) {
      toast(reason instanceof Error ? reason.message : t('sync.xbox.auth_failed'), 'error')
      actionRequestActive.current = false
      setActiveAction(null)
    }
  }

  const updatePlatformAccount = (source: PlatformSource, value: string) => {
    latestConnectionRequest.current++
    setPlatformAccounts(current => ({ ...current, [source]: value }))
    setConnectionResults(current => ({ ...current, [source]: undefined }))
  }

  const updateRememberedPlatformAccount = (source: PlatformSource, remembered: boolean) => {
    setRememberedPlatformAccounts(current => ({ ...current, [source]: remembered }))
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

          <SourceCard
            source="xbox"
            availability={xboxAvailability ?? status.xbox}
            task={latestTask('xbox')}
            history={history?.xbox}
            settingsCategory={xboxProvider === 'microsoft' ? 'microsoftXbox' : 'openxbl'}
          >
            <label className="mb-3 block text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
              {t('sync.xbox.provider')}
              <select
                value={xboxProvider}
                onChange={event => {
                  latestConnectionRequest.current++
                  setConnectionResults(current => ({ ...current, xbox: undefined }))
                  setXboxProvider(event.target.value as XboxProvider)
                }}
                className="tech-input mt-2 w-full"
              >
                <option value="microsoft">{t('sync.xbox.provider.microsoft')}</option>
                <option value="openxbl">OpenXBL</option>
              </select>
            </label>
            {xboxProvider === 'openxbl' ? (
              <AccountInput
                source="xbox"
                value={platformAccounts.xbox}
                onChange={value => updatePlatformAccount('xbox', value)}
                remembered={rememberedPlatformAccounts.xbox}
                onRememberChange={remembered => updateRememberedPlatformAccount('xbox', remembered)}
              />
            ) : (
              <SyncButton
                label={xboxAvailability?.available ? t('sync.xbox.reauthorize') : t('sync.xbox.authorize')}
                onClick={() => void connectMicrosoftXbox()}
                disabled={!sourceStatusReady
                  || !['missing_authorization', null].includes(xboxAvailability?.reason ?? 'disabled')
                  || activeAction != null
                  || latestTask('xbox')?.status === 'running'}
                active={activeAction === 'xbox-auth'}
                className="mb-3 w-full"
              />
            )}
            <SyncButton
              label={t('sync.connection.verify')}
              onClick={() => void verifyPlatformConnection('xbox')}
              disabled={!sourceStatusReady || !xboxAvailability?.available || activeAction != null || latestTask('xbox')?.status === 'running'}
              active={activeAction === 'xbox-verify'}
              className="mb-3 w-full"
            />
            {connectionResults.xbox && <ConnectionStatus result={connectionResults.xbox} />}
            <StatusSelect
              value={directStatuses.xbox}
              onChange={value => setDirectStatuses(current => ({ ...current, xbox: value }))}
            />
            <SyncButton
              label={t('sync.xbox.owned')}
              onClick={() => void startSourceTask(
                `/import/xbox/owned/task?provider=${xboxProvider}&gamertag=${encodeURIComponent(platformAccounts.xbox.trim())}&status=${directStatuses.xbox}`,
                'xbox-owned',
              )}
              disabled={!sourceStatusReady || !taskStateReady || !xboxAvailability?.available || activeAction != null || latestTask('xbox')?.status === 'running'}
              active={activeAction === 'xbox-owned'}
              className="mt-3 w-full"
            />
          </SourceCard>

          <SourceCard
            source="psn"
            availability={psnAvailability ?? status.psn}
            task={latestTask('psn')}
            history={history?.psn}
            settingsCategory="psn"
          >
            <AccountInput
              source="psn"
              value={platformAccounts.psn}
              onChange={value => updatePlatformAccount('psn', value)}
              remembered={rememberedPlatformAccounts.psn}
              onRememberChange={remembered => updateRememberedPlatformAccount('psn', remembered)}
            />
            <SyncButton
              label={t('sync.connection.verify')}
              onClick={() => void verifyPlatformConnection('psn')}
              disabled={!sourceStatusReady || !psnAvailability?.available || activeAction != null || latestTask('psn')?.status === 'running'}
              active={activeAction === 'psn-verify'}
              className="mb-3 w-full"
            />
            {connectionResults.psn && <ConnectionStatus result={connectionResults.psn} />}
            <StatusSelect
              value={directStatuses.psn}
              onChange={value => setDirectStatuses(current => ({ ...current, psn: value }))}
            />
            <SyncButton
              label={t('sync.psn.owned')}
              onClick={() => void startSourceTask(
                `/import/psn/owned/task?psnId=${encodeURIComponent(platformAccounts.psn.trim())}&status=${directStatuses.psn}`,
                'psn-owned',
              )}
              disabled={!sourceStatusReady || !taskStateReady || !psnAvailability?.available || activeAction != null || latestTask('psn')?.status === 'running'}
              active={activeAction === 'psn-owned'}
              className="mt-3 w-full"
            />
          </SourceCard>

        </div>
      )}

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
            {availability.reason !== 'missing_authorization' && (
              <Link to={`/settings?category=${settingsCategory}`} className="font-bold uppercase tracking-widest text-white hover:text-[var(--accent)]">
                {t('sync.fix_config')} →
              </Link>
            )}
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
      {entry.error && !isPrimaryResultError(entry.error, entry.result) && <p className="mt-2 text-red-400">{entry.error}</p>}
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

function ConnectionStatus({ result }: { result: ConnectionResult }) {
  const { t } = useI18nStore()
  return (
    <p
      role="status"
      className={`mb-3 border p-3 text-[10px] ${result.ok
        ? 'border-[var(--accent)]/30 bg-[var(--accent)]/5 text-[var(--accent)]'
        : 'border-red-500/30 bg-red-500/10 text-red-300'}`}
    >
      {result.ok ? t('sync.connection.success') : result.error}
    </p>
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

function AccountInput({ source, value, onChange, remembered, onRememberChange }: {
  source: 'xbox' | 'psn'
  value: string
  onChange: (value: string) => void
  remembered: boolean
  onRememberChange: (remembered: boolean) => void
}) {
  const { t } = useI18nStore()
  return (
    <div className="mb-3">
      <label className="block text-[9px] font-bold uppercase tracking-[0.2em] text-[var(--muted)]">
        {t(`sync.${source}.account`)}
        <input
          value={value}
          onChange={event => onChange(event.target.value)}
          maxLength={100}
          autoComplete="off"
          placeholder={t(`sync.${source}.placeholder`)}
          className="tech-input mt-2 w-full"
        />
      </label>
      <label className="mt-2 flex cursor-pointer items-start gap-2 text-[9px] leading-4 text-[var(--muted)]">
        <input
          type="checkbox"
          checked={remembered}
          onChange={event => onRememberChange(event.target.checked)}
          className="mt-0.5 accent-[var(--accent)]"
        />
        <span>{t('sync.account.remember')}</span>
      </label>
    </div>
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
      {task.error && !isPrimaryResultError(task.error, task.result) && <p className="mt-2 text-red-400">{task.error}</p>}
    </div>
  )
}

function ResultSummary({ result, completedAt, compact = false }: { result: SyncResult; completedAt: string | null; compact?: boolean }) {
  const { t, lang } = useI18nStore()
  const [errorsExpanded, setErrorsExpanded] = useState(false)
  return (
    <div className={`${compact ? 'mt-2' : 'mt-4 border-t border-[var(--line)] pt-4'} text-[10px] text-[var(--muted)]`}>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <span>{t('sync.result.total')} <strong className="text-white">{result.total}</strong></span>
        <span>{t('sync.result.imported')} <strong className="text-[var(--accent)]">{result.imported}</strong></span>
        {result.updated != null && <span>{t('sync.result.updated')} <strong className="text-[var(--accent)]">{result.updated}</strong></span>}
        <span>{t('sync.result.skipped')} <strong className="text-white">{result.skipped}</strong></span>
        <span>{t('sync.result.errors')} <strong className={result.errors.length ? 'text-red-400' : 'text-white'}>{result.errors.length}</strong></span>
      </div>
      {completedAt && <p className="mt-1">{new Date(completedAt).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US')}</p>}
      {result.errors[0] && !errorsExpanded && <p className="mt-2 break-words text-red-400">{result.errors[0]}</p>}
      {result.errors.length > 1 && (
        <button
          type="button"
          onClick={() => setErrorsExpanded(current => !current)}
          aria-expanded={errorsExpanded}
          className="mt-2 font-bold uppercase tracking-widest text-red-300 hover:text-red-200"
        >
          {errorsExpanded ? t('sync.result.hide_errors') : t('sync.result.show_errors', result.errors.length)}
        </button>
      )}
      {errorsExpanded && (
        <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto border border-red-500/30 bg-red-500/5 p-3 text-red-300">
          {result.errors.map((error, index) => (
            <li key={`${index}:${error}`} className="break-words">{index + 1}. {error}</li>
          ))}
        </ul>
      )}
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
          {task.result.updated != null && <span>~{task.result.updated}</span>}
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

function isPrimaryResultError(error: string, result: SyncResult | null | undefined): boolean {
  return result?.errors.find(item => item.trim())?.trim() === error.trim()
}
