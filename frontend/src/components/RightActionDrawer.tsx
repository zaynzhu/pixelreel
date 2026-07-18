import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { apiFetch } from '../api';
import { useI18nStore } from '../stores/i18nStore';
import { useTaskStore } from '../stores/taskStore';
import { toast } from '../stores/toastStore';
import { Link } from 'react-router-dom';

type SyncTarget = 'douban-json' | 'douban-incremental' | 'douban-full' | 'trakt-movies' | 'trakt-shows' | 'steam-owned' | null;

export default function RightActionDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const [syncing, setSyncing] = useState<SyncTarget>(null);
  const { t } = useI18nStore()
  const tasks = useTaskStore(state => state.tasks)
  const tasksInitialized = useTaskStore(state => state.initialized)
  const taskPollError = useTaskStore(state => state.pollError)
  const pollTasks = useTaskStore(state => state.pollTasks)
  const toggleRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const taskStartActive = useRef(false)
  const closeDrawer = useCallback(() => setIsOpen(false), [])
  const taskStateReady = tasksInitialized && taskPollError === null
  const doubanRunning = tasks.some(task => task.type === 'douban-harvest' && task.status === 'running')
  const traktRunning = tasks.some(task => task.type === 'trakt-import' && task.status === 'running')
  const steamRunning = tasks.some(task => task.type === 'steam-owned' && task.status === 'running')
  const runningTask = tasks.find(task => (
    ['douban-harvest', 'trakt-import', 'steam-owned'].includes(task.type)
    && task.status === 'running'
  ))
  const statusMsg = syncing
    ? t('drawer.status.task_starting')
    : runningTask ? t('drawer.status.task_running', runningTask.label) : null

  useLayoutEffect(() => {
    if (panelRef.current) panelRef.current.inert = !isOpen
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      closeDrawer()
      requestAnimationFrame(() => toggleRef.current?.focus())
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [closeDrawer, isOpen])

  return (
    <>
      <div
        className={`fixed top-[10%] right-0 z-50 flex transition-transform duration-300 ease-[cubic-bezier(.25,.46,.45,.94)] ${
          isOpen ? 'translate-x-0' : 'translate-x-[300px]'
        }`}
      >
        {/* 把手 (Handle) */}
        <button
          ref={toggleRef}
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="group relative flex h-24 w-10 flex-col items-center justify-center border-y border-l border-[var(--line)] bg-[var(--surface)] text-white hover:border-[var(--accent)] hover:bg-[var(--surface-hover)] focus:outline-none"
          aria-label={t(isOpen ? 'drawer.close' : 'drawer.open')}
          aria-controls="command-drawer"
          aria-expanded={isOpen}
        >
          <div className="absolute top-0 left-0 w-1.5 h-1.5 border-t border-l border-[var(--accent)] opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="absolute bottom-0 left-0 w-1.5 h-1.5 border-b border-l border-[var(--accent)] opacity-0 group-hover:opacity-100 transition-opacity" />

          <span className="writing-vertical-rl rotate-180 text-[10px] font-bold tracking-widest text-[var(--muted)] group-hover:text-[var(--accent)] transition-colors">
            {t(isOpen ? 'drawer.handle.open' : 'drawer.handle.closed')}
          </span>
        </button>

        {/* 面板内容 */}
        <div
          ref={panelRef}
          id="command-drawer"
          role="region"
          aria-labelledby="command-drawer-title"
          aria-hidden={!isOpen}
          className="w-[300px] border-y border-l border-[var(--line)] bg-[var(--surface)] p-6 shadow-[0_0_40px_rgba(0,0,0,0.8)] backdrop-blur-md flex flex-col gap-8 max-h-[80vh] overflow-y-auto custom-scrollbar relative"
        >
          <div className="absolute inset-y-0 right-0 w-1 bg-[radial-gradient(circle_at_center,_rgba(212,255,0,0.3),_transparent_70%)]" />

          {/* Header */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className={`w-2 h-2 ${syncing || runningTask ? 'bg-[var(--accent-deep)] animate-pulse' : 'bg-[var(--accent)] animate-pulse'}`} />
              <span className="section-kicker !mb-0">SYS.OP</span>
            </div>
            <h3 id="command-drawer-title" className="font-display text-2xl text-white">COMMAND<br/>CENTER</h3>
          </div>

          {/* 状态消息 */}
          {statusMsg && (
            <div className="border-l-2 border-[var(--accent)] bg-[var(--accent)]/10 px-3 py-2 text-[10px] text-[var(--accent)] font-bold uppercase tracking-widest">
              {statusMsg}
            </div>
          )}
          {taskPollError !== null && (
            <div role="alert" className="border-l-2 border-red-400 bg-red-500/10 px-3 py-2 text-[10px] text-red-300">
              <p>{taskPollError || t('task.panel.load_error')}</p>
              <p className="mt-1 text-[var(--muted)]">{t('task.panel.stale_hint')}</p>
              <button type="button" onClick={() => void pollTasks()} className="brutal-btn mt-3">
                {t('sync.retry')}
              </button>
            </div>
          )}
          {!tasksInitialized && taskPollError === null && (
            <div className="border-l-2 border-[var(--line)] bg-black/20 px-3 py-2 text-[10px] text-[var(--muted)]">
              {t('task.panel.initializing')}
            </div>
          )}

          {/* 01: 豆瓣 */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 border-b border-[var(--line)] pb-2">
              <span className="text-[10px] font-bold text-[var(--accent)] uppercase tracking-wider">01 //</span>
              <span className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">{t('drawer.section.douban')}</span>
            </div>
            <ActionButton
              label={t('drawer.action.douban_json')}
              onClick={() => void startTask('douban-json', '/import/douban-harvest?mode=json')}
              disabled={!taskStateReady || syncing != null || doubanRunning}
              active={syncing === 'douban-json'}
            />
            <ActionButton
              label={t('drawer.action.douban_incremental')}
              onClick={() => void startTask('douban-incremental', '/import/douban-harvest?mode=incremental')}
              disabled={!taskStateReady || syncing != null || doubanRunning}
              active={syncing === 'douban-incremental'}
            />
            <ActionButton
              label={t('drawer.action.douban_full')}
              onClick={() => void startTask('douban-full', '/import/douban-harvest?mode=full')}
              disabled={!taskStateReady || syncing != null || doubanRunning}
              active={syncing === 'douban-full'}
            />
          </div>

          {/* 02: Trakt 同步 */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 border-b border-[var(--line)] pb-2">
              <span className="text-[10px] font-bold text-[var(--accent)] uppercase tracking-wider">02 //</span>
              <span className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">Trakt</span>
            </div>
            <ActionButton
              label={t('drawer.action.trakt_movies')}
              onClick={() => void startTask('trakt-movies', '/trakt/import/movies/task?status=WANT')}
              disabled={!taskStateReady || syncing != null || traktRunning}
              active={syncing === 'trakt-movies'}
            />
            <ActionButton
              label={t('drawer.action.trakt_shows')}
              onClick={() => void startTask('trakt-shows', '/trakt/import/shows/task?status=WANT')}
              disabled={!taskStateReady || syncing != null || traktRunning}
              active={syncing === 'trakt-shows'}
            />
          </div>

          {/* 03: Steam */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 border-b border-[var(--line)] pb-2">
              <span className="text-[10px] font-bold text-[var(--accent)] uppercase tracking-wider">03 //</span>
              <span className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">Steam</span>
            </div>
            <ActionButton
              label={t('drawer.action.steam_owned')}
              onClick={() => void startTask('steam-owned', '/import/steam/owned/task?status=WANT')}
              disabled={!taskStateReady || syncing != null || steamRunning}
              active={syncing === 'steam-owned'}
            />
          </div>

          {/* 04: 媒体库维护 */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 border-b border-[var(--line)] pb-2">
              <span className="text-[10px] font-bold text-[var(--accent)] uppercase tracking-wider">04 //</span>
              <span className="text-[10px] font-bold text-[var(--muted)] uppercase tracking-wider">{t('drawer.section.library')}</span>
            </div>
            <Link to="/data-health" onClick={closeDrawer} className="brutal-btn justify-between">
              <span>{t('drawer.action.data_health')}</span>
              <span>→</span>
            </Link>
            <Link to="/sync" onClick={closeDrawer} className="brutal-btn justify-between">
              <span>{t('drawer.action.sync_center')}</span>
              <span>→</span>
            </Link>
          </div>
        </div>
      </div>
    </>
  );

  async function startTask(target: Exclude<SyncTarget, null>, path: string) {
    if (taskStartActive.current) return
    const taskState = useTaskStore.getState()
    if (!taskState.initialized || taskState.pollError !== null) {
      toast(t('task.panel.unavailable_hint'), 'error')
      return
    }
    taskStartActive.current = true
    setSyncing(target)
    try {
      await apiFetch<{ taskId: string }>(path, { method: 'POST' })
      await pollTasks()
      toast(t('drawer.status.task_started'))
    } catch (error) {
      toast(error instanceof Error ? error.message : t('drawer.status.task_failed'), 'error')
    } finally {
      taskStartActive.current = false
      setSyncing(null)
    }
  }
}

function ActionButton({ label, onClick, disabled, active }: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`brutal-btn flex items-center justify-between group ${active ? 'brutal-btn-accent' : ''}`}
    >
      <span className="flex items-center gap-2">
        <span className="text-[10px] opacity-50">[{'>'}]</span>
        {label}
      </span>
      <span className="opacity-0 transition-opacity group-hover:opacity-100 group-hover:text-black">
        {active ? '...' : '_EXEC'}
      </span>
    </button>
  );
}
