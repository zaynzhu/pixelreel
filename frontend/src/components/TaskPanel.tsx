import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTaskStore } from '../stores/taskStore';
import { useI18nStore } from '../stores/i18nStore';
import { toast } from '../stores/toastStore';

export default function TaskPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const tasks = useTaskStore((s) => s.tasks);
  const cancellingTaskIds = useTaskStore((s) => s.cancellingTaskIds);
  const initialized = useTaskStore((s) => s.initialized);
  const pollError = useTaskStore((s) => s.pollError);
  const pollTasks = useTaskStore((s) => s.pollTasks);
  const { t } = useI18nStore();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const running = tasks.filter((t) => t.status === 'running').length;

  useLayoutEffect(() => {
    if (panelRef.current) panelRef.current.inert = !open;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    closeButtonRef.current?.focus();
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open, onClose]);

  return (
    <>
      {/* 遮罩 */}
      {open && (
        <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      )}

      {/* 面板 */}
      <div
        ref={panelRef}
        id="task-panel"
        role="dialog"
        aria-modal={open ? 'true' : undefined}
        aria-labelledby="task-panel-title"
        aria-hidden={!open}
        className={`fixed top-0 right-0 z-50 h-full w-[380px] border-l border-[var(--line)] bg-[var(--surface)] shadow-[0_0_60px_rgba(0,0,0,0.8)] transition-transform duration-300 ease-[cubic-bezier(.25,.46,.45,.94)] ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* 装饰线 */}
        <div className="absolute inset-y-0 left-0 w-1 bg-[radial-gradient(circle_at_center,_rgba(212,255,0,0.3),_transparent_70%)]" />

        {/* 头部 */}
        <div className="flex items-center justify-between border-b border-[var(--line)] px-6 py-5">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 ${running > 0 ? 'bg-[var(--accent-deep)]' : 'bg-[var(--accent)]'} animate-pulse`} />
            <span id="task-panel-title" className="section-kicker !mb-0">{t('task.panel.title')}</span>
            {running > 0 && (
              <span className="ml-2 rounded-full bg-[var(--accent)] px-2 py-0.5 text-[10px] font-bold text-black">
                {running}
              </span>
            )}
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label={t('task.panel.close')}
            className="text-[var(--muted)] hover:text-white transition-colors text-xs uppercase tracking-widest"
          >
            ESC
          </button>
        </div>

        {/* 任务列表 */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar" style={{ maxHeight: 'calc(100vh - 80px)' }}>
          {pollError !== null && (
            <div role="alert" className="mb-4 border border-red-500/50 bg-red-500/10 p-3 text-[10px] text-red-300">
              <p>{pollError || t('task.panel.load_error')}</p>
              <p className="mt-1 text-[var(--muted)]">{t('task.panel.stale_hint')}</p>
              <button type="button" onClick={() => void pollTasks()} className="brutal-btn mt-3">
                {t('sync.retry')}
              </button>
            </div>
          )}
          {!initialized && pollError === null ? (
            <div className="py-16 text-center text-[10px] uppercase tracking-widest text-[var(--muted)]">
              {t('task.panel.initializing')}
            </div>
          ) : initialized && pollError === null && tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-[var(--muted)]">
              <svg className="w-8 h-8 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <span className="text-[10px] uppercase tracking-widest">{t('task.panel.empty')}</span>
            </div>
          ) : tasks.length > 0 ? (
            <div className="flex flex-col gap-4">
              {tasks.map((task) => (
                <TaskCard
                  key={task.taskId}
                  task={task}
                  cancelling={cancellingTaskIds.includes(task.taskId)}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

function TaskCard({ task, cancelling }: {
  task: ReturnType<typeof useTaskStore.getState>['tasks'][0];
  cancelling: boolean;
}) {
  const { lang, t } = useI18nStore()
  const [errorsExpanded, setErrorsExpanded] = useState(false)
  const pct = task.progress.total > 0
    ? Math.round((task.progress.processed / task.progress.total) * 100)
    : 0;

  const statusColor = task.status === 'running'
    ? 'text-[var(--accent)]'
    : task.status === 'completed'
      ? 'text-green-400'
      : task.status === 'cancelled'
        ? 'text-yellow-400'
        : 'text-red-400';

  const statusLabel = task.status === 'running'
    ? t('task.panel.status.running')
    : task.status === 'completed'
      ? t('task.panel.status.done')
      : task.status === 'cancelled'
        ? t('task.panel.status.cancelled')
        : t('task.panel.status.failed');

  return (
    <div className="border border-[var(--line)] bg-[var(--surface-hover)] p-4">
      {/* 标题行 */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-white">{task.label}</span>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold uppercase tracking-wider ${statusColor}`}>
            {statusLabel}
          </span>
          {task.status === 'running' && (
            <button
              type="button"
              disabled={cancelling}
              onClick={() => {
                void useTaskStore.getState().cancelTask(task.taskId).catch((reason) => {
                  toast(reason instanceof Error ? reason.message : t('task.panel.cancel_failed'), 'error')
                })
              }}
              className="text-[10px] uppercase tracking-wider text-red-400 border border-red-400/40 px-2 py-0.5 hover:bg-red-400/10 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              {cancelling ? t('task.panel.cancelling') : t('task.panel.cancel')}
            </button>
          )}
        </div>
      </div>

      {/* 进度 */}
      {task.status === 'running' && (
        <div className="mb-2">
          <div className="h-1 w-full bg-[var(--line)]">
            <div
              className="h-full bg-[var(--accent)] transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-[var(--muted)]">
              {task.progress.total > 0
                ? `${task.progress.processed}/${task.progress.total}`
                : task.progress.processed > 0
                  ? t('task.panel.items', task.progress.processed)
                  : ''}
            </span>
            <span className="text-[10px] text-[var(--muted)] truncate max-w-[180px] ml-2">
              {task.progress.currentTitle}
            </span>
          </div>
        </div>
      )}

      {/* 完成结果 */}
      {(task.status === 'completed' || task.status === 'cancelled') && task.result && (
        <div>
          <div className="flex gap-3 text-[10px] text-[var(--muted)]">
            <span>{t('task.panel.result.imported')} <span className="text-white">{task.result.imported}</span></span>
            {task.result.updated != null && (
              <span>{t('task.panel.result.updated')} <span className="text-white">{task.result.updated}</span></span>
            )}
            <span>{t('task.panel.result.skipped')} <span className="text-white">{task.result.skipped}</span></span>
            {task.result.errors.length > 0 && (
              <span>{t('task.panel.result.errors')} <span className="text-red-400">{task.result.errors.length}</span></span>
            )}
          </div>
          {task.result.errors[0] && !errorsExpanded && (
            <p className="mt-2 break-words text-[10px] text-red-400">{task.result.errors[0]}</p>
          )}
          {task.result.errors.length > 1 && (
            <button
              type="button"
              onClick={() => setErrorsExpanded(current => !current)}
              aria-expanded={errorsExpanded}
              className="mt-2 text-[10px] font-bold uppercase tracking-widest text-red-300 hover:text-red-200"
            >
              {errorsExpanded ? t('sync.result.hide_errors') : t('sync.result.show_errors', task.result.errors.length)}
            </button>
          )}
          {errorsExpanded && (
            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto border border-red-500/30 bg-red-500/5 p-3 text-[10px] text-red-300">
              {task.result.errors.map((error, index) => (
                <li key={`${index}:${error}`} className="break-words">{index + 1}. {error}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* 失败信息 */}
      {task.status === 'failed' && (
        <p className="text-[10px] text-red-400 mt-1">{task.error}</p>
      )}

      {/* 时间 */}
      <div className="mt-2 text-[10px] text-[var(--muted)]">
        {new Date(task.startedAt).toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en-US')}
        {task.completedAt && ` → ${new Date(task.completedAt).toLocaleTimeString(lang === 'zh' ? 'zh-CN' : 'en-US')}`}
      </div>
    </div>
  );
}
