import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { X, CheckCircle2, AlertTriangle, AlertCircle, Info } from 'lucide-react';

export type ToastType = 'success' | 'warning' | 'error' | 'info';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  title?: string;
  duration?: number;
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (message: string, type: ToastType, title?: string, duration?: number) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((message: string, type: ToastType, title?: string, duration = 4000) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type, title, duration }]);

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  }, [removeToast]);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 max-w-sm w-full">
        {toasts.map((toast) => {
          const Icon = {
            success: CheckCircle2,
            warning: AlertTriangle,
            error: AlertCircle,
            info: Info,
          }[toast.type];

          const colorClasses = {
            success: 'border-emerald-500/30 bg-slate-900/90 text-emerald-300 shadow-emerald-500/5',
            warning: 'border-amber-500/30 bg-slate-900/90 text-amber-300 shadow-amber-500/5',
            error: 'border-rose-500/30 bg-slate-900/90 text-rose-300 shadow-rose-500/5',
            info: 'border-cyan-500/30 bg-slate-900/90 text-cyan-300 shadow-cyan-500/5',
          }[toast.type];

          return (
            <div
              key={toast.id}
              className={`flex gap-3 rounded-[16px] border p-4 shadow-xl backdrop-blur-xl transition-all duration-300 hover:scale-[1.02] ${colorClasses}`}
            >
              <Icon className="h-5 w-5 shrink-0 mt-0.5" />
              <div className="flex-1">
                {toast.title && <h4 className="font-semibold text-slate-100 text-sm mb-0.5">{toast.title}</h4>}
                <p className="text-slate-300 text-[13px] leading-relaxed">{toast.message}</p>
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="text-slate-400 hover:text-slate-200 shrink-0 self-start p-0.5 rounded-lg hover:bg-white/5 transition"
                aria-label="Close notification"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
