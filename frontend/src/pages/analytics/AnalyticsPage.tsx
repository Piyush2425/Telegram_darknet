import { useMemo, useState } from 'react';
import {
  BarChart3,
  Activity,
  TrendingUp,
  Users,
  MessageSquare,
  Clock,
  Zap,
  Globe,
} from 'lucide-react';
import { AsyncState } from '@/components/common/AsyncState';
import { useAsyncQuery } from '@/hooks/useAsyncQuery';
import {
  fetchEntityStats,
  fetchScraperProgress,
  fetchMonitoringGroups,
  fetchReports,
  type MonitoringGroup,
  type ScraperProgress,
} from '@/services/api';
import { formatIST } from '@/utils/time';

interface EntityStat {
  telegram_id: number;
  title?: string;
  messages_stored: number;
  new_messages: number;
  last_scraped_at?: string | null;
}

export function AnalyticsPage() {
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d'>('7d');

  const statsQuery = useAsyncQuery(fetchEntityStats, { refreshIntervalMs: 30000 });
  const groupsQuery = useAsyncQuery(fetchMonitoringGroups, { refreshIntervalMs: 30000 });
  const progressQuery = useAsyncQuery(fetchScraperProgress, { refreshIntervalMs: 10000 });
  const reportsQuery = useAsyncQuery(fetchReports, { refreshIntervalMs: 60000 });

  const stats = (statsQuery.data ?? []) as EntityStat[];
  const groups = (groupsQuery.data ?? []) as MonitoringGroup[];
  const progress = progressQuery.data as ScraperProgress | null;
  const reportsData = reportsQuery.data as { reports?: Array<{ path: string; kind?: string; group?: string | null; modified_at?: string; size?: number }>; state?: Record<string, unknown> } | null;
  const reports = reportsData?.reports ?? [];

  const totalMessages = useMemo(() => stats.reduce((sum, s) => sum + (s.messages_stored || 0), 0), [stats]);
  const totalNew = useMemo(() => stats.reduce((sum, s) => sum + (s.new_messages || 0), 0), [stats]);
  const activeGroups = groups.filter(g => g.enabled).length;

  const topChannels = useMemo(
    () => [...stats].sort((a, b) => (b.messages_stored || 0) - (a.messages_stored || 0)).slice(0, 10),
    [stats],
  );

  const maxMessages = topChannels[0]?.messages_stored || 1;

  const reportsByType = useMemo(() => {
    const counts = { markdown: 0, pdf: 0, memory: 0 };
    for (const r of reports) {
      if (r.kind === 'pdf') counts.pdf++;
      else if (r.path?.includes('memory')) counts.memory++;
      else counts.markdown++;
    }
    return counts;
  }, [reports]);

  const recentReports = useMemo(
    () => [...reports].sort((a, b) => (b.modified_at ?? '').localeCompare(a.modified_at ?? '')).slice(0, 8),
    [reports],
  );

  const uniqueGroups = useMemo(() => {
    const set = new Set<string>();
    for (const r of reports) {
      if (r.group) set.add(r.group);
    }
    return set.size;
  }, [reports]);

  const isLoading = statsQuery.isLoading || groupsQuery.isLoading;

  return (
    <AsyncState loading={false}>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-3 text-xl font-semibold text-slate-50">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/20">
                <BarChart3 className="h-5 w-5 text-white" />
              </div>
              Analytics
            </h1>
            <p className="mt-1 text-[13px] text-slate-400">
              Activity trends and intelligence insights across monitored Telegram entities
            </p>
          </div>
          <div className="flex gap-1 rounded-2xl border border-white/10 bg-white/5 p-1">
            {(['24h', '7d', '30d'] as const).map((range) => (
              <button
                key={range}
                type="button"
                onClick={() => setTimeRange(range)}
                className={`rounded-xl px-4 py-2 text-[12px] font-medium transition-all ${
                  timeRange === range
                    ? 'bg-cyan-400/15 text-cyan-200 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.2)]'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {range}
              </button>
            ))}
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KPICard
            label="Total Messages"
            value={totalMessages.toLocaleString()}
            icon={MessageSquare}
            color="cyan"
            subtitle={`${totalNew.toLocaleString()} new`}
          />
          <KPICard
            label="Active Groups"
            value={activeGroups.toString()}
            icon={Users}
            color="emerald"
            subtitle={`${groups.length} total monitored`}
          />
          <KPICard
            label="Reports Generated"
            value={reports.length.toString()}
            icon={TrendingUp}
            color="violet"
            subtitle={`${reportsByType.pdf} PDFs, ${reportsByType.markdown} MD`}
          />
          <KPICard
            label="Scraper Status"
            value={progress?.running ? 'Active' : 'Idle'}
            icon={Zap}
            color={progress?.running ? 'amber' : 'slate'}
            subtitle={`${progress?.run_count ?? 0} runs completed`}
          />
        </div>

        {/* Charts Row */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Top Channels Bar Chart */}
          <div className="glass-panel rounded-2xl">
            <div className="p-5">
              <h3 className="mb-4 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wider text-slate-300">
                <Activity className="h-4 w-4 text-cyan-400" />
                Top Channels by Messages
              </h3>
              {isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-8 animate-pulse rounded-lg bg-white/5" />
                  ))}
                </div>
              ) : topChannels.length === 0 ? (
                <p className="py-8 text-center text-[13px] text-slate-500">No channel data yet. Start scraping to see analytics.</p>
              ) : (
                <div className="space-y-2.5">
                  {topChannels.map((channel, idx) => (
                    <div key={channel.telegram_id} className="group">
                      <div className="mb-1 flex items-center justify-between text-[12px]">
                        <span className="flex items-center gap-2 text-slate-200">
                          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-white/5 text-[10px] font-bold text-slate-400">
                            {idx + 1}
                          </span>
                          <span className="max-w-[180px] truncate">{channel.title || `ID: ${channel.telegram_id}`}</span>
                        </span>
                        <span className="font-mono text-slate-400">{channel.messages_stored.toLocaleString()}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-white/5">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-teal-400 transition-all duration-700 group-hover:shadow-[0_0_8px_rgba(34,211,238,0.3)]"
                          style={{ width: `${Math.max((channel.messages_stored / maxMessages) * 100, 2)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Report Activity */}
          <div className="glass-panel rounded-2xl">
            <div className="p-5">
              <h3 className="mb-4 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wider text-slate-300">
                <Globe className="h-4 w-4 text-violet-400" />
                Recent Report Activity
              </h3>
              {reportsQuery.isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-8 animate-pulse rounded-lg bg-white/5" />
                  ))}
                </div>
              ) : recentReports.length === 0 ? (
                <p className="py-8 text-center text-[13px] text-slate-500">No reports generated yet.</p>
              ) : (
                <div className="space-y-2">
                  {recentReports.map((report, idx) => {
                    const isPdf = report.kind === 'pdf';
                    const isMemory = report.path?.includes('memory');
                    return (
                      <div
                        key={`${report.path}-${idx}`}
                        className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5 transition hover:bg-white/5"
                      >
                        <div className={`flex h-7 w-7 items-center justify-center rounded-lg text-[10px] font-bold ${
                          isPdf ? 'bg-rose-500/15 text-rose-400' : isMemory ? 'bg-amber-500/15 text-amber-400' : 'bg-cyan-500/15 text-cyan-400'
                        }`}>
                          {isPdf ? 'PDF' : isMemory ? 'MEM' : 'MD'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12px] text-slate-200">{report.path?.split('/').pop()}</p>
                          <p className="text-[11px] text-slate-500">{report.group ?? 'Combined'}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[11px] text-slate-400">
                            {report.modified_at ? formatIST(report.modified_at) : '—'}
                          </p>
                          {report.size != null && (
                            <p className="text-[10px] text-slate-500">{(report.size / 1024).toFixed(1)} KB</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Scraper Activity Timeline */}
        <div className="glass-panel rounded-2xl">
          <div className="p-5">
            <h3 className="mb-4 flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wider text-slate-300">
              <Clock className="h-4 w-4 text-emerald-400" />
              Scraper Activity Log
            </h3>
            {!progress?.last_results?.length ? (
              <p className="py-6 text-center text-[13px] text-slate-500">No scraper activity recorded yet.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {progress.last_results.map((result, idx) => (
                  <div
                    key={`result-${idx}`}
                    className={`rounded-2xl border p-4 transition ${
                      result.success
                        ? 'border-emerald-500/20 bg-emerald-500/5 hover:border-emerald-500/30'
                        : 'border-rose-500/20 bg-rose-500/5 hover:border-rose-500/30'
                    }`}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="max-w-[160px] truncate text-[12px] font-medium text-slate-200">
                        {result.title || `ID: ${result.telegram_id}`}
                      </span>
                      <span className={`rounded-lg px-2 py-0.5 text-[10px] font-semibold ${
                        result.success ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                      }`}>
                        {result.success ? 'OK' : 'FAIL'}
                      </span>
                    </div>
                    <div className="space-y-1 text-[11px] text-slate-400">
                      {result.messages_saved != null && <p>Saved: {result.messages_saved} messages</p>}
                      {result.new_messages != null && <p>New: {result.new_messages}</p>}
                      {result.error && <p className="text-rose-400">{result.error}</p>}
                      {result.scraped_at && <p>{formatIST(result.scraped_at)}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Coverage Summary */}
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Groups Analyzed" value={uniqueGroups.toString()} sublabel="with report artifacts" />
          <StatCard label="Memory Files" value={reportsByType.memory.toString()} sublabel="knowledge base files" />
          <StatCard label="PDF Reports" value={reportsByType.pdf.toString()} sublabel="daily summaries" />
        </div>
      </div>
    </AsyncState>
  );
}

/* ── Sub-components ────────────────────────────────────────────── */

function KPICard({ label, value, icon: Icon, color, subtitle }: {
  label: string; value: string; icon: typeof MessageSquare; color: string; subtitle?: string;
}) {
  const colorMap: Record<string, string> = {
    cyan: 'from-cyan-500/15 to-cyan-600/5 text-cyan-300 shadow-cyan-500/10',
    emerald: 'from-emerald-500/15 to-emerald-600/5 text-emerald-300 shadow-emerald-500/10',
    violet: 'from-violet-500/15 to-violet-600/5 text-violet-300 shadow-violet-500/10',
    amber: 'from-amber-500/15 to-amber-600/5 text-amber-300 shadow-amber-500/10',
    slate: 'from-slate-500/15 to-slate-600/5 text-slate-300 shadow-slate-500/10',
  };
  const classes = colorMap[color] ?? colorMap.slate;

  return (
    <div className={`rounded-2xl border border-white/10 bg-gradient-to-br ${classes} p-5 shadow-lg`}>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">{label}</span>
        <Icon className="h-4 w-4 opacity-60" />
      </div>
      <p className="text-2xl font-bold">{value}</p>
      {subtitle && <p className="mt-1 text-[11px] text-slate-400">{subtitle}</p>}
    </div>
  );
}

function StatCard({ label, value, sublabel }: { label: string; value: string; sublabel: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-center">
      <p className="text-2xl font-bold text-slate-100">{value}</p>
      <p className="mt-1 text-[12px] font-medium text-slate-300">{label}</p>
      <p className="text-[11px] text-slate-500">{sublabel}</p>
    </div>
  );
}
