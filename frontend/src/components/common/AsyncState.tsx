import type { ReactNode } from 'react';
import { AlertTriangle, RefreshCw, SearchX } from 'lucide-react';
import { SkeletonBlock } from './SkeletonBlock';

interface AsyncStateProps {
  loading?: boolean;
  error?: string | null;
  empty?: boolean;
  title?: string;
  description?: string;
  onRetry?: () => void;
  children?: ReactNode;
  skeletonRows?: number;
}

export function AsyncState({
  loading,
  error,
  empty,
  title = 'No data',
  description = 'No records were returned from the backend.',
  onRetry,
  children,
  skeletonRows = 4,
}: AsyncStateProps) {
  if (loading) {
    return <SkeletonBlock rows={skeletonRows} className="mt-2" />;
  }

  if (error) {
    return (
      <div className="rounded-[16px] border border-rose-400/20 bg-rose-400/10 p-5 text-sm text-rose-100">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <p className="font-semibold">Request failed</p>
            <p className="mt-1 text-rose-100/80">{error}</p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="mt-4 inline-flex h-10 items-center gap-2 rounded-2xl border border-rose-100/20 bg-rose-100/10 px-4 font-semibold text-rose-50 transition hover:bg-rose-100/15"
              >
                <RefreshCw className="h-4 w-4" />
                Retry
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (empty) {
    return (
      <div className="rounded-[16px] border border-dashed border-white/10 bg-white/5 p-12 text-center">
        <SearchX className="mx-auto mb-4 h-8 w-8 text-slate-500" />
        <p className="text-base font-semibold text-slate-200">{title}</p>
        <p className="mt-2 text-sm text-slate-400">{description}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-5 inline-flex h-10 items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        )}
      </div>
    );
  }

  return <>{children}</>;
}
