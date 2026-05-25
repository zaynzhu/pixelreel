import { useToastStore, type ToastType } from '../stores/toastStore';
import { useEffect, useState, useCallback } from 'react';

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

export function useConfirmDialog() {
  const [state, setState] = useState(confirmState);

  useEffect(() => {
    const handler = (value: boolean) => {
      if (confirmResolve) confirmResolve(value);
      setState({ open: false, message: '', danger: false });
      confirmResolve = null;
    };
    (window as any).__confirmHandler = handler;

    const interval = setInterval(() => {
      if (confirmState.open !== state.open || confirmState.message !== state.message) {
        setState({ ...confirmState });
      }
    }, 50);
    return () => {
      clearInterval(interval);
    };
  }, [state]);

  return state;
}

export function confirmDialog(message: string, danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    confirmResolve = resolve;
    confirmState = { open: true, message, danger };
  });
}

export function ConfirmDialog() {
  const state = useConfirmDialog();

  if (!state.open) return null;

  const borderColor = state.danger ? 'border-[var(--accent-deep)]' : 'border-[var(--accent)]';
  const btnClass = state.danger
    ? 'border border-red-500/50 bg-red-950/30 text-red-400 hover:bg-red-500 hover:text-black'
    : 'border border-[var(--line)] bg-[var(--surface-hover)] text-white hover:bg-white hover:text-black';

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => (window as any).__confirmHandler?.(false)}>
      <div className={`border ${borderColor} bg-[var(--surface)] p-6 shadow-[0_0_60px_rgba(0,0,0,0.8)] max-w-sm w-full`} onClick={(e) => e.stopPropagation()}>
        <p className="text-sm text-[var(--ink)] mb-6">{state.message}</p>
        <div className="flex justify-end gap-3">
          <button onClick={() => (window as any).__confirmHandler?.(false)} className="text-xs uppercase tracking-widest text-[var(--muted)] hover:text-white px-4 py-2 transition-colors">
            取消
          </button>
          <button onClick={() => (window as any).__confirmHandler?.(true)} className={`${btnClass} px-4 py-2 text-[10px] font-bold uppercase tracking-widest transition-all`}>
            确认
          </button>
        </div>
      </div>
    </div>
  );
}