import { useToastStore, type ToastType } from '../stores/toastStore';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useI18nStore } from '../stores/i18nStore';

// ── Toast 容器 ──

export function ToastContainer() {
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <ToastItem key={t.id} id={t.id} message={t.message} type={t.type} onDismiss={removeToast} />
      ))}
    </div>
  );
}

function ToastItem({ id, message, type, onDismiss }: {
  id: string;
  message: string;
  type: ToastType;
  onDismiss: (id: string) => void;
}) {
  const borderColor = type === 'error' ? 'border-[var(--accent-deep)]' : type === 'warning' ? 'border-yellow-500' : 'border-[var(--accent)]';
  const textColor = type === 'error' ? 'text-[var(--accent-deep)]' : type === 'warning' ? 'text-yellow-400' : 'text-[var(--accent)]';

  return (
    <div
      className={`pointer-events-auto flex items-center gap-2 border-l-4 ${borderColor} bg-[var(--surface)] px-4 py-2 shadow-[0_0_20px_rgba(0,0,0,0.6)] animate-[slideIn_0.3s_ease-out] min-w-[240px] max-w-[360px]`}
    >
      <span className={`text-xs font-bold uppercase tracking-wider ${textColor}`}>
        {type === 'error' ? '[ERR]' : type === 'warning' ? '[WARN]' : '[OK]'}
      </span>
      <span className="text-xs text-[var(--ink)] flex-1">{message}</span>
      <button onClick={() => onDismiss(id)} className="text-[var(--muted)] hover:text-white text-xs ml-2">✕</button>
    </div>
  );
}

// ── ConfirmDialog ──

let confirmResolve: ((value: boolean) => void) | null = null;
let confirmState = { open: false, message: '', danger: false };
const confirmListeners = new Set<() => void>()

function subscribeConfirm(listener: () => void) {
  confirmListeners.add(listener)
  return () => confirmListeners.delete(listener)
}

function getConfirmState() {
  return confirmState
}

function notifyConfirmListeners() {
  confirmListeners.forEach((listener) => listener())
}

function settleConfirm(value: boolean) {
  const resolve = confirmResolve
  confirmResolve = null
  confirmState = { open: false, message: '', danger: false }
  notifyConfirmListeners()
  resolve?.(value)
}

export function useConfirmDialog() {
  return useSyncExternalStore(subscribeConfirm, getConfirmState, getConfirmState)
}

export function confirmDialog(message: string, danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    if (confirmResolve) settleConfirm(false)
    confirmResolve = resolve
    confirmState = { open: true, message, danger }
    notifyConfirmListeners()
  })
}

export function ConfirmDialog() {
  const state = useConfirmDialog();
  const { t } = useI18nStore()
  const cancelButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!state.open) return

    const previouslyFocused = document.activeElement as HTMLElement | null
    const focusFrame = requestAnimationFrame(() => cancelButtonRef.current?.focus())

    return () => {
      cancelAnimationFrame(focusFrame)
      previouslyFocused?.focus()
    }
  }, [state.open])

  if (!state.open) return null;

  const borderColor = state.danger ? 'border-[var(--accent-deep)]' : 'border-[var(--accent)]';
  const btnClass = state.danger
    ? 'border border-red-500/50 bg-red-950/30 text-red-400 hover:bg-red-500 hover:text-black'
    : 'border border-[var(--line)] bg-[var(--surface-hover)] text-white hover:bg-white hover:text-black';

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => settleConfirm(false)}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        className={`border ${borderColor} bg-[var(--surface)] p-6 shadow-[0_0_60px_rgba(0,0,0,0.8)] max-w-sm w-full`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === 'Escape') settleConfirm(false)
        }}
      >
        <h2 id="confirm-dialog-title" className="sr-only">{t('confirm.title')}</h2>
        <p id="confirm-dialog-message" className="text-sm text-[var(--ink)] mb-6">{state.message}</p>
        <div className="flex justify-end gap-3">
          <button ref={cancelButtonRef} type="button" onClick={() => settleConfirm(false)} className="text-xs uppercase tracking-widest text-[var(--muted)] hover:text-white px-4 py-2 transition-colors">
            {t('confirm.cancel')}
          </button>
          <button type="button" onClick={() => settleConfirm(true)} className={`${btnClass} px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition-all`}>
            {t('confirm.accept')}
          </button>
        </div>
      </div>
    </div>
  );
}
