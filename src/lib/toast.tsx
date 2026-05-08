import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type ToastKind = 'error' | 'success' | 'info';
export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastContextValue {
  show: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_DURATION_MS = 5000;
let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((message: string, kind: ToastKind = 'error') => {
    const id = nextId++;
    setToasts(prev => [...prev, { id, kind, message }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // useMemo để value reference ổn định — tránh consumer re-render mỗi khi toasts list đổi
  const value = useMemo<ToastContextValue>(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be inside ToastProvider');
  return ctx;
}

const colors: Record<ToastKind, { bg: string; border: string; text: string }> = {
  error:   { bg: '#fee2e2', border: '#fca5a5', text: '#991b1b' },
  success: { bg: '#dcfce7', border: '#86efac', text: '#166534' },
  info:    { bg: '#e0f2fe', border: '#7dd3fc', text: '#075985' },
};

function ToastContainer({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div style={{
      position: 'fixed', top: 16, right: 16, zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 420,
    }}>
      {toasts.map(t => <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />)}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const c = colors[toast.kind];
  useEffect(() => {
    const t = window.setTimeout(() => onDismiss(toast.id), TOAST_DURATION_MS);
    return () => clearTimeout(t);
  }, [toast.id, onDismiss]);

  return (
    <div style={{
      background: c.bg, border: `1px solid ${c.border}`, color: c.text,
      padding: '0.7rem 1rem', borderRadius: 6, fontSize: '0.88rem',
      display: 'flex', alignItems: 'flex-start', gap: 12,
      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
    }}>
      <span style={{ flex: 1 }}>{toast.message}</span>
      <button
        onClick={() => onDismiss(toast.id)}
        style={{ background: 'transparent', border: 'none', color: c.text, cursor: 'pointer', fontSize: '1rem', lineHeight: 1 }}
        aria-label="Dismiss"
      >×</button>
    </div>
  );
}
