import { useEffect, useLayoutEffect, useRef } from 'react';
import { useTaskStore } from '../stores/taskStore';
import { useI18nStore } from '../stores/i18nStore';

export default function TaskPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const tasks = useTaskStore((s) => s.tasks);
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
          {tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-[var(--muted)]">
              <svg className="w-8 h-8 mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <span className="text-[10px] uppercase tracking-widest">{t('task.panel.empty')}</span>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {tasks.map((task) => (
                <TaskCard key={task.taskId} task={task} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function TaskCard({ task }: { task: ReturnType<typeof useTaskStore.getState>['tasks'][0] }) {
  const { lang, t } = useI18nStore()
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
              onClick={() => useTaskStore.getState().cancelTask(task.taskId)}
              className="text-[10px] uppercase tracking-wider text-red-400 border border-red-400/40 px-2 py-0.5 hover:bg-red-400/10 transition-colors"
            >
              {t('task.panel.cancel')}
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
        <div className="flex gap-3 text-[10px] text-[var(--muted)]">
          <span>{t('task.panel.result.imported')} <span className="text-white">{task.result.imported}</span></span>
          <span>{t('task.panel.result.skipped')} <span className="text-white">{task.result.skipped}</span></span>
          {task.result.errors.length > 0 && (
            <span>{t('task.panel.result.errors')} <span className="text-red-400">{task.result.errors.length}</span></span>
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
