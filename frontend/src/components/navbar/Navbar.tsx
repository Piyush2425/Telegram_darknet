import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, RefreshCw, Search, Settings2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAsyncQuery } from '@/hooks/useAsyncQuery';
import { fetchLogs } from '@/services/api';

interface NavbarProps {
  telegramStatus?: string;
  mongodbStatus?: string;
  currentUser?: string;
  onRefresh: () => void;
}

export function Navbar({ telegramStatus, mongodbStatus, currentUser, onRefresh }: NavbarProps) {
  const navigate = useNavigate();
  const searchRef = useRef<HTMLInputElement>(null);
  const [searchValue, setSearchValue] = useState('');
  const isTelegramConnected = telegramStatus?.toLowerCase().includes('connected');
  const isMongoConnected = (mongodbStatus ?? '').toLowerCase().includes('connected');
  const allOk = isTelegramConnected && isMongoConnected;
  const systemStatus = allOk ? 'All Systems Operational' : 'Degraded';

  // Live error count from logs
  const logsQuery = useAsyncQuery(
    useMemo(() => () => fetchLogs({ level: 'error', limit: 50 }), []),
    { refreshIntervalMs: 30000 },
  );
  const errorCount = logsQuery.data?.items?.length ?? 0;
  const badgeCount = Math.min(errorCount, 99);

  // ⌘K / Ctrl+K shortcut to focus search
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      searchRef.current?.focus();
    }
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  function handleSearchSubmit(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && searchValue.trim()) {
      navigate(`/messages?search=${encodeURIComponent(searchValue.trim())}`);
      setSearchValue('');
      searchRef.current?.blur();
    }
  }

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/80 backdrop-blur-xl">
      <div className="flex items-center gap-4 px-4 py-4 lg:px-5">
        {/* Search bar */}
        <div className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/70 px-4 py-3 shadow-[0_10px_30px_rgba(2,6,23,0.18)] transition-colors focus-within:border-cyan-500/30 focus-within:shadow-[0_0_20px_rgba(34,211,238,0.08)]">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            ref={searchRef}
            type="search"
            placeholder="Search messages, channels, entities..."
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            onKeyDown={handleSearchSubmit}
            className="w-full bg-transparent text-[13px] text-slate-100 outline-none placeholder:text-slate-500"
            aria-label="Search application data"
          />
          <kbd className="hidden rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-slate-400 md:inline-flex">⌘K</kbd>
        </div>

        {/* System status */}
        <div className="hidden items-center gap-3 xl:flex">
          <div className="flex items-center gap-2 pr-4">
            <span
              className={`pulse-dot h-2.5 w-2.5 ${allOk ? 'text-emerald-400 bg-emerald-400' : 'text-amber-400 bg-amber-400'}`}
            />
            <div className="leading-tight">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">System Status</p>
              <p className={`text-[13px] font-medium ${allOk ? 'text-emerald-300' : 'text-amber-300'}`}>
                {systemStatus}
              </p>
            </div>
          </div>
          <div className="h-10 w-px bg-white/10" />
        </div>

        {/* Settings */}
        <button
          type="button"
          onClick={() => navigate('/settings')}
          className="hidden h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-100 transition hover:bg-white/10 lg:inline-flex"
          aria-label="Settings"
          title="Open Settings"
        >
          <Settings2 className="h-4 w-4" />
        </button>

        {/* Notification bell — live error count */}
        <button
          type="button"
          onClick={() => navigate('/logs')}
          className="relative hidden h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-100 transition hover:bg-white/10 lg:inline-flex"
          aria-label="View error logs"
          title={`${badgeCount} error${badgeCount !== 1 ? 's' : ''} in logs`}
        >
          <Bell className="h-4 w-4" />
          {badgeCount > 0 && (
            <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[11px] font-semibold text-white">
              {badgeCount}
            </span>
          )}
        </button>

        {/* Refresh + user */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex h-11 items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 text-[13px] font-medium text-slate-100 transition hover:bg-white/10"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>

          <button
            type="button"
            onClick={() => navigate('/credentials')}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-slate-900/80 px-2 py-2 pr-3 text-[13px] text-slate-100 transition hover:bg-white/10"
            aria-label="User menu"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-400/20 text-cyan-100 font-semibold">
              {currentUser?.slice(0, 2).toUpperCase() ?? 'AD'}
            </span>
            <span className="hidden text-[13px] font-medium text-slate-200 sm:inline">{currentUser ?? 'Operator'}</span>
            <span className="hidden text-slate-400 sm:inline">⌄</span>
          </button>
        </div>
      </div>
    </header>
  );
}

