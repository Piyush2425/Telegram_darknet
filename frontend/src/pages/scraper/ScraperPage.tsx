import { useMemo } from 'react';
import { Loader2, ShieldAlert, ShieldCheck } from 'lucide-react';
import { AsyncState } from '@/components/common/AsyncState';
import { PageBlock } from '@/components/common/PageBlock';
import { useAsyncQuery } from '@/hooks/useAsyncQuery';
import { fetchScraperProgress, fetchEntityStats, type ScraperProgress } from '@/services/api';
import { formatIST } from '@/utils/time';

export function ScraperPage() {
  const loadProgress = useMemo(() => () => fetchScraperProgress(), []);
  const progressQuery = useAsyncQuery(loadProgress, { refreshIntervalMs: 3000 });
  const progress = progressQuery.data as ScraperProgress | undefined;

  const loadStats = useMemo(() => () => fetchEntityStats(), []);
  const statsQuery = useAsyncQuery(loadStats, { refreshIntervalMs: 5000 });
  const stats = statsQuery.data ?? [];

  return (
    <PageBlock
      eyebrow="Intelligence Collection"
      title="Scraper Status"
      description="View the current status of the background scraper, individual entity collection states, and run history."
    >
      <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr] page-enter">
        <article className="space-y-6">
          <div className="glass-panel rounded-[16px] p-6 border border-white/10">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="section-title">Background Scheduler</h2>
                <p className="mt-1 text-sm text-slate-400">Continuous monitoring engine state</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${progress?.running ? 'border border-cyan-400/20 bg-cyan-400/10 text-cyan-200' : 'border border-amber-400/20 bg-amber-400/10 text-amber-200'}`}>
                {progress?.running ? 'Running' : 'Idle'}
              </span>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <StatCard label="Total Runs" value={String(progress?.run_count ?? 0)} />
              <StatCard label="Queue Length" value={String(progress?.queue_length ?? 0)} />
              <StatCard label="Last Run Started" value={formatIST(progress?.last_run_started_at, 'Never')} />
              <StatCard label="Next Run At" value={formatIST(progress?.next_run_at, 'Not scheduled')} />
            </div>
            
            {progress?.running && progress.active_entity && (
              <div className="mt-4 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 flex items-center gap-3">
                <Loader2 className="h-5 w-5 text-cyan-400 animate-spin shrink-0" />
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-cyan-500">Currently Scraping</p>
                  <p className="text-sm font-semibold text-cyan-100">{progress.active_entity.title}</p>
                </div>
              </div>
            )}
          </div>

          <div className="glass-panel rounded-[16px] p-6 border border-white/10">
            <h2 className="section-title mb-4">Per-Entity Collection Status</h2>
            <AsyncState
              loading={statsQuery.isLoading && !stats.length}
              error={statsQuery.error}
              empty={!stats.length}
              title="No Entity Data"
              description="No telegram entities are currently configured or collected."
              onRetry={statsQuery.refetch}
            >
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
                {stats.map(stat => (
                  <div key={stat.telegram_id} className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] p-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-200">ID: {stat.telegram_id}</p>
                      <p className="text-xs text-slate-400 mt-0.5">Last Scraped: {formatIST(stat.last_scraped_at, 'Never')}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium text-slate-200">{stat.messages_stored} total</p>
                      {stat.new_messages > 0 ? (
                        <p className="text-xs font-semibold text-cyan-400">+{stat.new_messages} new</p>
                      ) : (
                        <p className="text-xs text-slate-500">No new messages</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </AsyncState>
          </div>
        </article>

        <aside className="space-y-6">
          <article className="glass-panel rounded-[16px] p-6 border border-white/10">
            <h2 className="section-title mb-4">Last Run Results</h2>
            {progress?.last_results && progress.last_results.length > 0 ? (
              <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
                {progress.last_results.slice().reverse().map((res, idx) => (
                  <div key={idx} className={`rounded-xl border p-4 ${res.success ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-rose-500/20 bg-rose-500/5'}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        {res.success ? (
                          <ShieldCheck className="h-4 w-4 text-emerald-400 mt-0.5" />
                        ) : (
                          <ShieldAlert className="h-4 w-4 text-rose-400 mt-0.5" />
                        )}
                        <div>
                          <p className="text-sm font-semibold text-slate-200 truncate max-w-[200px]" title={res.title || String(res.telegram_id)}>
                            {res.title || `ID: ${res.telegram_id}`}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5">{formatIST(res.scraped_at, 'Unknown time')}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        {res.success ? (
                          <>
                            <span className="block text-xs font-bold text-emerald-400">Success</span>
                            <span className="block text-[10px] text-slate-400 mt-0.5">Saved {res.messages_saved ?? 0}</span>
                          </>
                        ) : (
                          <>
                            <span className="block text-xs font-bold text-rose-400">Failed</span>
                          </>
                        )}
                      </div>
                    </div>
                    {!res.success && res.error && (
                      <div className="mt-3 rounded bg-rose-500/10 p-2 border border-rose-500/20">
                        <p className="text-[11px] text-rose-300 break-words">{res.error}</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500 italic">No scrape results available in the current session.</p>
            )}
          </article>
        </aside>
      </div>
    </PageBlock>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-100">{value}</p>
    </div>
  );
}
