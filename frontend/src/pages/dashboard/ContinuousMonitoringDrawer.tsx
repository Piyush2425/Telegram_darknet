import { useState } from 'react';
import { Clock3, X } from 'lucide-react';
import { useToast } from '@/contexts/ToastContext';
import { saveScheduler } from '@/services/api';
import { apiErrorToMessage } from '@/utils/errors';

export function ContinuousMonitoringDrawer({
  onClose,
  onMonitoringStarted,
}: {
  onClose: () => void;
  onMonitoringStarted: () => void;
}) {
  const { addToast } = useToast();
  const [intervalHours, setIntervalHours] = useState(1);
  const [isStarting, setIsStarting] = useState(false);

  async function handleStart() {
    setIsStarting(true);
    try {
      await saveScheduler({ run_at: '00:00', interval_hours: intervalHours });
      addToast(`Monitoring started. It will run again every ${intervalHours} hour(s).`, 'success', 'Monitoring Started');
      onMonitoringStarted();
      onClose();
    } catch (error) {
      addToast(apiErrorToMessage(error), 'error', 'Start Failed');
    } finally {
      setIsStarting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-[20px] border border-white/10 bg-slate-900 p-5 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-cyan-300" />
            <h2 className="text-sm font-semibold text-slate-100">Start Monitoring</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-300 transition hover:bg-white/10"
            aria-label="Close monitoring popup"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
              Repeat Every Hours
            </span>
            <input
              type="number"
              min={1}
              max={168}
              step={1}
              value={intervalHours}
              onChange={(event) => setIntervalHours(Number(event.target.value))}
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 outline-none"
            />
          </label>

          <p className="text-xs leading-5 text-slate-400">
            The backend will scrape the selected channels and groups now, then repeat on this interval.
          </p>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleStart()}
            disabled={isStarting}
            className="flex-1 rounded-2xl bg-gradient-to-r from-cyan-500 to-teal-500 px-4 py-3 text-sm font-semibold text-slate-950 transition disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isStarting ? 'Starting...' : 'Start'}
          </button>
        </div>
      </div>
    </div>
  );
}
