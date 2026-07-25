import { useMemo, useState } from 'react';
import { CalendarDays, Play, RefreshCw, Save } from 'lucide-react';
import { AsyncState } from '@/components/common/AsyncState';
import { PageBlock } from '@/components/common/PageBlock';
import { useToast } from '@/contexts/ToastContext';
import { useAsyncQuery } from '@/hooks/useAsyncQuery';
import { apiErrorToMessage, fetchSchedulerStatus, runSchedulerNow, saveScheduler, type SchedulerStatus } from '@/services/api';
import { formatIST } from '@/utils/time';

export function SchedulerPage() {
  const { addToast } = useToast();
  const [runAt, setRunAt] = useState('02:00');
  const [intervalHours, setIntervalHours] = useState(24);
  const [message, setMessage] = useState('Configure automatic Telegram collection.');

  const loadScheduler = useMemo(() => () => fetchSchedulerStatus(), []);
  const { data, error, isLoading, refetch } = useAsyncQuery(loadScheduler, {
    refreshIntervalMs: 5000,
  });
  const scheduler = data as SchedulerStatus | null;

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('Saving scheduler…');
    try {
      const nextScheduler = await saveScheduler({ run_at: runAt, interval_hours: intervalHours });
      if (nextScheduler?.run_at) setRunAt(nextScheduler.run_at.slice(0, 5));
      if (nextScheduler?.interval_hours) setIntervalHours(nextScheduler.interval_hours);
      setMessage('Scheduler saved successfully.');
      addToast('Scheduler configuration persisted to backend.', 'success', 'Schedule Saved');
      await refetch();
    } catch (saveError) {
      const msg = apiErrorToMessage(saveError);
      setMessage(msg);
      addToast(msg, 'error', 'Save Failed');
    }
  }

  async function handleRunNow() {
    setMessage('Triggering immediate run…');
    addToast('Dispatching immediate scrape run to the scheduler…', 'info', 'Run Now');
    try {
      const nextScheduler = await runSchedulerNow();
      const msg = `Run started. Queue length: ${nextScheduler?.queue?.length ?? 0}.`;
      setMessage(msg);
      addToast(msg, 'success', 'Scheduler Triggered');
      await refetch();
    } catch (runError) {
      const msg = apiErrorToMessage(runError);
      setMessage(msg);
      addToast(msg, 'error', 'Run Failed');
    }
  }

  return (
    <PageBlock
      eyebrow="Automation"
      title="Scheduler"
      description="Control the scheduled Telegram scraping cadence without touching backend logic."
    >
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr] page-enter">
        <form onSubmit={handleSave} className="glass-panel rounded-[16px] p-6 space-y-5">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-cyan-300" />
            <h2 className="section-title">Schedule Settings</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-[13px] font-semibold uppercase tracking-[0.18em] text-slate-400">Run Time (IST)</span>
              <input
                value={runAt}
                onChange={(e) => setRunAt(e.target.value)}
                type="time"
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-500/50 transition"
              />
              <p className="mt-2 text-xs text-slate-500">Daily trigger time in IST.</p>
            </label>
            <label className="block">
              <span className="mb-2 block text-[13px] font-semibold uppercase tracking-[0.18em] text-slate-400">Repeat Every (Hours)</span>
              <input
                value={intervalHours}
                onChange={(e) => setIntervalHours(Number(e.target.value))}
                type="number"
                min={1}
                max={168}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-500/50 transition"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="submit"
              className="inline-flex h-12 items-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 to-teal-500 px-5 text-sm font-semibold text-slate-950 transition hover:translate-y-[-1px]"
            >
              <Save className="h-4 w-4" />
              Save Schedule
            </button>
            <button
              type="button"
              onClick={() => void handleRunNow()}
              className="inline-flex h-12 items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
            >
              <Play className="h-4 w-4" />
              Run Now
            </button>
            <button
              type="button"
              onClick={() => void refetch()}
              className="inline-flex h-12 items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </form>

        <aside className="glass-panel rounded-[16px] p-6 space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Status</p>
            <h2 className="section-title mt-1">Scheduler Overview</h2>
          </div>

          {/* Status message */}
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">{message}</div>

          <AsyncState
            loading={isLoading && !scheduler}
            error={error}
            empty={!scheduler}
            title="No scheduler snapshot"
            description="The backend did not return scheduler status."
            onRetry={refetch}
            skeletonRows={3}
          >
            <div className="space-y-3 text-sm text-slate-300">
              <InfoRow label="Run At" value={formatIST(scheduler?.run_at ?? runAt)} />
              <InfoRow label="Interval" value={scheduler?.interval_hours ? `${scheduler.interval_hours} hours` : `${intervalHours} hours`} />
              <InfoRow label="Next Run" value={formatIST(scheduler?.next_run_at, 'Pending')} />
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-slate-400">
                {scheduler?.running ? 'Scheduler is active.' : 'Scheduler is idle.'}
              </div>
            </div>
          </AsyncState>
        </aside>
      </div>
    </PageBlock>
  );
}

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
      <span className="text-slate-500">{label}</span>
      <span className={`flex items-center gap-2 font-semibold ${highlight ? 'text-emerald-300' : 'text-slate-100'}`}>
        {highlight && <span className="pulse-dot h-2 w-2 bg-emerald-400 text-emerald-400" />}
        {value}
      </span>
    </div>
  );
}
