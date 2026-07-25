import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckSquare, RefreshCw, Save, Search, Shield, Square, Trash2 } from 'lucide-react';
import { AsyncState } from '@/components/common/AsyncState';
import { PageBlock } from '@/components/common/PageBlock';
import { useToast } from '@/contexts/ToastContext';
import { useAsyncQuery } from '@/hooks/useAsyncQuery';
import { useDebounce } from '@/hooks/useDebounce';
import {
  apiErrorToMessage,
  deleteTelegramEntity,
  fetchDashboard,
  fetchSchedulerStatus,
  fetchScraperProgress,
  refreshTelegramEntities,
  saveTelegramEntitySelection,
  scrapeTelegramEntity,
  telegramService,
  type SchedulerStatus,
  type ScraperProgress,
  type TelegramEntity,
} from '@/services/api';
import { formatISTWithSeconds } from '@/utils/time';

import { ContinuousMonitoringDrawer } from './ContinuousMonitoringDrawer';

export function DashboardPage() {
  const { addToast } = useToast();
  const [searchRaw, setSearchRaw] = useState('');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [banner, setBanner] = useState('Select channels and groups, save, then start monitoring.');
  const [showMonitoringDrawer, setShowMonitoringDrawer] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const search = useDebounce(searchRaw, 300);

  const dashboardQuery = useAsyncQuery(fetchDashboard, { refreshIntervalMs: 30000 });
  const dashboard = dashboardQuery.data;

  const schedulerQuery = useAsyncQuery(fetchSchedulerStatus, { refreshIntervalMs: 5000 });
  const scheduler = schedulerQuery.data as SchedulerStatus | null;

  const progressQuery = useAsyncQuery(fetchScraperProgress, { refreshIntervalMs: 5000 });
  const progress = progressQuery.data as ScraperProgress | null;

  const loadEntities = useMemo(() => () => telegramService.fetchEntities(''), []);
  const { data, error, isLoading, refetch, setData } = useAsyncQuery(loadEntities, {
    refreshIntervalMs: 30000,
  });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const entities = data?.entities ?? [];

  useEffect(() => {
    if (entities.length > 0) {
      setSelectedIds(entities.filter((entity) => entity.enabled).map((entity) => entity.telegram_id));
    }
  }, [entities]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return entities;
    return entities.filter((entity) =>
      [entity.title, entity.username, entity.type, entity.monitoring_status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [entities, search]);

  const allSelected = filtered.length > 0 && filtered.every((entity) => selectedIds.includes(entity.telegram_id));
  const nextRunAt = scheduler?.next_run_at;
  const nextRunDate = nextRunAt ? Date.parse(nextRunAt) : Number.NaN;
  const timeRemaining = Number.isNaN(nextRunDate) ? null : formatRemaining(nextRunDate - now);

  function toggleSelection(id: number) {
    setSelectedIds((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  }

  function toggleAll() {
    const ids = filtered.map((entity) => entity.telegram_id);
    setSelectedIds((current) => (allSelected ? current.filter((id) => !ids.includes(id)) : Array.from(new Set([...current, ...ids]))));
  }

  async function handleRefresh() {
    setBanner('Refreshing Telegram groups and channels...');
    try {
      const response = await refreshTelegramEntities();
      setData({ success: response.success, entities: response.entities ?? [] });
      const count = response.count ?? response.entities?.length ?? 0;
      setBanner(`Refreshed - ${count} entities loaded.`);
      addToast(`Discovered ${count} Telegram groups/channels.`, 'success', 'Discovery Finished');
    } catch (err) {
      const message = apiErrorToMessage(err);
      setBanner(message);
      addToast(message, 'error', 'Discovery Failed');
    }
  }

  async function handleSaveSelection() {
    setActiveAction('save-selection');
    setBanner('Saving monitored selections...');
    try {
      const enabledIds = selectedIds;
      const disabledIds = entities.map((entity) => entity.telegram_id).filter((id) => !enabledIds.includes(id));
      await saveTelegramEntitySelection({ enabled_ids: enabledIds, disabled_ids: disabledIds });
      setBanner('Selection saved.');
      addToast('Monitored channel selection saved to database.', 'success', 'Selection Saved');
      await refetch();
    } catch (err) {
      const message = apiErrorToMessage(err);
      setBanner(message);
      addToast(message, 'error', 'Save Failed');
    } finally {
      setActiveAction(null);
    }
  }

  async function handleScrape(entity: TelegramEntity) {
    setActiveAction(`scrape-${entity.telegram_id}`);
    setBanner(`Scraping messages for ${entity.title}...`);
    try {
      const result = await scrapeTelegramEntity(entity.telegram_id);
      if (result.success ?? true) {
        setBanner(`Scrape finished for ${entity.title}.`);
        addToast(`Scrape finished for "${entity.title}".`, 'success', 'Scrape Completed');
      } else {
        setBanner(`Scrape incomplete for ${entity.title}.`);
        addToast(`Scrape completed with warning: ${String(result.error ?? 'Check logs')}`, 'warning', 'Scrape Warning');
      }
      await refetch();
      void dashboardQuery.refetch();
    } catch (err) {
      const message = apiErrorToMessage(err);
      setBanner(message);
      addToast(message, 'error', 'Scrape Failed');
    } finally {
      setActiveAction(null);
    }
  }

  async function handleDelete(entity: TelegramEntity) {
    setActiveAction(`delete-${entity.telegram_id}`);
    setBanner(`Removing ${entity.title}...`);
    try {
      await deleteTelegramEntity(entity.telegram_id);
      setSelectedIds((current) => current.filter((id) => id !== entity.telegram_id));
      setBanner(`Removed ${entity.title}.`);
      addToast(`Removed "${entity.title}" from database.`, 'success', 'Deleted');
      await refetch();
      void dashboardQuery.refetch();
    } catch (err) {
      const message = apiErrorToMessage(err);
      setBanner(message);
      addToast(message, 'error', 'Delete Failed');
    } finally {
      setActiveAction(null);
    }
  }

  const stats = [
    { label: 'Discovered', value: entities.length },
    { label: 'Monitored', value: entities.filter((entity) => entity.enabled).length },
    { label: 'Messages Collected', value: dashboard?.total_messages ?? '—' },
    { label: 'Ingested Today', value: dashboard?.messages_collected_today ?? '—' },
  ];

  const activeTitle = progress?.active_entity?.title ?? 'Waiting...';
  const queued = progress?.queue ?? [];
  const results = progress?.last_results ?? [];

  return (
    <PageBlock
      eyebrow="Intelligence Center"
      title="Dashboard"
      description="Select channels and groups, save the list, then start monitoring from the popup."
    >
      <div className="space-y-6 page-enter">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {stats.map(({ label, value }) => (
            <div key={label} className="glass-panel rounded-2xl border border-white/10 px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
              <p className="mt-1 text-2xl font-bold text-slate-50">{value}</p>
            </div>
          ))}
        </div>

        <div className="glass-panel rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
          {banner}
        </div>

        <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <article className="glass-panel rounded-[16px] border border-white/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300/80">Scraping Started</p>
                <h3 className="mt-1 text-sm font-semibold text-slate-50">{progress?.running ? 'Running now' : 'Idle'}</h3>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${progress?.running ? 'border border-emerald-400/20 bg-emerald-400/10 text-emerald-200' : 'border border-white/10 bg-white/5 text-slate-300'}`}>
                {progress?.running ? 'Active' : 'Stopped'}
              </span>
            </div>

            <div className="mt-3 rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Current Channel</p>
              <p className="mt-1 text-sm font-semibold text-slate-100">{activeTitle}</p>
            </div>

            <div className="mt-3 space-y-2">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Queued</p>
              {queued.length > 0 ? (
                queued.slice(0, 3).map((item) => (
                  <div key={`${item.telegram_id}-${item.title}`} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm">
                    <span className="truncate text-slate-200">{item.title}</span>
                    <span className="shrink-0 text-[11px] uppercase tracking-[0.18em] text-slate-500">{item.type ?? 'item'}</span>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-400">No queued channels.</div>
              )}
            </div>
          </article>

          <article className="glass-panel rounded-[16px] border border-white/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-300/80">Next Run</p>
                <h3 className="mt-1 text-sm font-semibold text-slate-50">
                  {timeRemaining ? `In ${timeRemaining}` : 'Pending'}
                </h3>
              </div>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-300">
                {scheduler?.interval_hours ? `${scheduler.interval_hours}h` : '1h'}
              </span>
            </div>

            <div className="mt-3 rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Scheduled At</p>
              <p className="mt-1 text-sm font-semibold text-slate-100">{nextRunAt ? formatISTWithSeconds(nextRunAt) : 'Waiting for scheduler'}</p>
            </div>

            <div className="mt-3 space-y-2">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">Latest Results</p>
              {results.length > 0 ? (
                results.slice(0, 3).map((item, index) => (
                  <div key={`${item.telegram_id ?? index}-${index}`} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate text-slate-200">{item.title ?? `ID ${item.telegram_id}`}</p>
                      <p className="text-[11px] text-slate-500">{item.success ? 'Completed' : 'Failed'}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${item.success ? 'border border-emerald-400/20 bg-emerald-400/10 text-emerald-200' : 'border border-rose-400/20 bg-rose-400/10 text-rose-200'}`}>
                      {item.success ? `+${item.new_messages ?? 0}` : 'Error'}
                    </span>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-400">No results yet.</div>
              )}
            </div>
          </article>
        </div>

        <article className="glass-panel rounded-[16px] border border-white/10 p-4 lg:p-5">
          <div className="flex flex-col gap-3 border-b border-white/10 pb-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-cyan-300" />
              <div>
                <h2 className="section-title">Channels and Groups</h2>
                <p className="mt-0.5 text-[12px] text-slate-400">
                  {filtered.length} of {entities.length} shown
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="flex min-w-[240px] items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/40 px-3 py-2.5">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  value={searchRaw}
                  onChange={(event) => setSearchRaw(event.target.value)}
                  placeholder="Search title, username, type..."
                  className="w-full bg-transparent text-[13px] text-slate-100 outline-none placeholder:text-slate-500"
                />
              </label>

              <button
                type="button"
                onClick={() => void handleRefresh()}
                className="inline-flex h-10 items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 text-[13px] font-medium text-slate-100 transition hover:bg-white/10"
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                Discover
              </button>

              <button
                type="button"
                onClick={() => setShowMonitoringDrawer(true)}
                className="inline-flex h-10 items-center gap-2 rounded-2xl border border-teal-500/30 bg-teal-500/10 px-4 text-[13px] font-semibold text-teal-300 transition hover:bg-teal-500/20"
              >
                <Shield className="h-4 w-4" />
                Start Monitoring
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={toggleAll}
              className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900/60 px-3 text-[12px] font-medium text-slate-300 transition hover:bg-white/10"
            >
              {allSelected ? <CheckSquare className="h-4 w-4 text-cyan-300" /> : <Square className="h-4 w-4 text-slate-500" />}
              Select All
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-white/10 bg-slate-900/60 px-3 text-[12px] font-medium text-slate-300 transition hover:bg-white/10"
            >
              Clear
            </button>
            <div className="h-5 w-px bg-white/10 mx-1" />
            <button
              type="button"
              onClick={() => void handleSaveSelection()}
              disabled={activeAction === 'save-selection'}
              className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-3 text-[12px] font-semibold text-cyan-300 transition hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              Save Selection
            </button>
          </div>

          <div className="mt-4 overflow-hidden rounded-[16px] border border-white/10">
            <AsyncState
              loading={isLoading && !entities.length}
              error={error}
              empty={!filtered.length}
              title="No Telegram groups or channels discovered"
              description='Please hit "Discover" to look for dialog entities in the active account session.'
              onRetry={() => void handleRefresh()}
            >
              <div className="max-h-[62vh] overflow-auto">
                <table className="min-w-full border-collapse text-left">
                  <thead className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur-xl">
                    <tr className="text-[11px] uppercase tracking-[0.22em] text-slate-500">
                      <th className="px-3 py-3 w-[80px]">
                        <button type="button" onClick={toggleAll} className="inline-flex items-center gap-2">
                          {allSelected ? <CheckSquare className="h-4 w-4 text-cyan-300" /> : <Square className="h-4 w-4 text-slate-500" />}
                          Select
                        </button>
                      </th>
                      <th className="px-3 py-3 w-[60px]">Avatar</th>
                      <th className="px-3 py-3">Channel Name</th>
                      <th className="px-3 py-3">Username</th>
                      <th className="px-3 py-3">Type</th>
                      <th className="px-3 py-3">Messages Stored</th>
                      <th className="px-3 py-3">Monitoring Status</th>
                      <th className="px-3 py-3">Interval</th>
                      <th className="px-3 py-3">Scrape Window</th>
                      <th className="px-3 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((entity) => {
                      const checked = selectedIds.includes(entity.telegram_id);
                      const rowBusy = activeAction === `scrape-${entity.telegram_id}` || activeAction === `delete-${entity.telegram_id}`;

                      return (
                        <tr key={entity.telegram_id} className={`border-t border-white/10 transition hover:bg-white/[0.03] ${checked ? 'bg-cyan-400/[0.02]' : ''}`}>
                          <td className="px-3 py-3.5">
                            <button type="button" onClick={() => toggleSelection(entity.telegram_id)} className="inline-flex items-center">
                              {checked ? <CheckSquare className="h-4 w-4 text-cyan-300" /> : <Square className="h-4 w-4 text-slate-500" />}
                            </button>
                          </td>

                          <td className="px-3 py-3.5">
                            <div className="flex h-9 w-9 items-center justify-center rounded-2xl border border-white/5 bg-gradient-to-br from-cyan-500/20 to-teal-500/20 text-sm font-bold text-cyan-200 shadow-md">
                              {(entity.title ?? '?').slice(0, 1).toUpperCase()}
                            </div>
                          </td>

                          <td className="px-3 py-3.5">
                            <div className="min-w-0">
                              <p className="max-w-[280px] truncate text-[13px] font-medium text-slate-100" title={entity.title}>
                                {entity.title}
                              </p>
                              <p className="text-[11px] font-mono text-slate-500">ID: {entity.telegram_id}</p>
                            </div>
                          </td>

                          <td className="px-3 py-3.5 text-[13px] text-slate-300">
                            {entity.username ? <span className="font-mono text-cyan-300">@{entity.username}</span> : <span className="italic text-slate-600">None</span>}
                          </td>

                          <td className="px-3 py-3.5">
                            <span className="rounded-full border border-white/10 bg-slate-800/60 px-2 py-0.5 text-[11px] uppercase tracking-wide text-slate-400">
                              {entity.type ?? 'Unknown'}
                            </span>
                          </td>

                          <td className="px-3 py-3.5 text-[13px] font-mono font-medium text-slate-200">
                            <div className="flex flex-col">
                              <span>{entity.messages_stored ?? 0}</span>
                              {(entity.new_messages ?? 0) > 0 && <span className="text-[10px] text-cyan-400">+{entity.new_messages} new</span>}
                            </div>
                          </td>

                          <td className="px-3 py-3.5 font-mono">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                entity.enabled
                                  ? 'border border-emerald-400/20 bg-emerald-400/10 text-emerald-300'
                                  : 'border border-white/10 bg-slate-800/60 text-slate-500'
                              }`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${entity.enabled ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                              {entity.enabled ? 'Active' : 'Disabled'}
                            </span>
                          </td>

                          <td className="px-3 py-3.5 text-[13px] text-slate-300">
                            <span className="font-mono text-slate-200">{entity.interval_minutes ?? 60}m</span>
                          </td>

                          <td className="px-3 py-3.5 text-[12px] text-slate-400">
                            <div className="flex flex-col gap-1">
                              <span>Last: {entity.last_scraped ? formatISTWithSeconds(entity.last_scraped) : 'Never'}</span>
                              <span>Next: {entity.next_scrape_at ? formatISTWithSeconds(entity.next_scrape_at) : 'Pending'}</span>
                            </div>
                          </td>

                          <td className="px-3 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => window.open(`/monitoring/${entity.telegram_id}?autostart=1`, '_blank', 'noopener,noreferrer')}
                                disabled={rowBusy}
                                className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-semibold text-slate-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <Shield className="h-3 w-3" />
                                Monitor
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleScrape(entity)}
                                disabled={rowBusy}
                                className="inline-flex items-center gap-1 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-2.5 py-1.5 text-[11px] font-semibold text-cyan-100 transition hover:bg-cyan-400/15 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <ArrowRight className="h-3 w-3" />
                                Scrape
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDelete(entity)}
                                disabled={rowBusy}
                                className="inline-flex items-center gap-1 rounded-xl border border-rose-400/20 bg-rose-400/10 px-2.5 py-1.5 text-[11px] font-semibold text-rose-100 transition hover:bg-rose-400/15 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <Trash2 className="h-3 w-3" />
                                Delete
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </AsyncState>
          </div>
        </article>
      </div>

      {showMonitoringDrawer && (
        <ContinuousMonitoringDrawer
          onClose={() => setShowMonitoringDrawer(false)}
          onMonitoringStarted={() => {
            void dashboardQuery.refetch();
            void schedulerQuery.refetch();
            void progressQuery.refetch();
          }}
        />
      )}
    </PageBlock>
  );
}

function formatRemaining(ms: number) {
  if (!Number.isFinite(ms)) return null;
  if (ms <= 0) return 'now';

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
