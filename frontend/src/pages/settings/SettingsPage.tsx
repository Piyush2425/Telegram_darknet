import { useEffect, useState } from 'react';
import { RotateCcw, Save } from 'lucide-react';
import { AsyncState } from '@/components/common/AsyncState';
import { PageBlock } from '@/components/common/PageBlock';
import { useToast } from '@/contexts/ToastContext';
import { apiErrorToMessage, fetchSettings, saveSettings, type SettingsRecord } from '@/services/api';

const defaultSettings: SettingsRecord = {
  dashboard_refresh_seconds: 30,
  queue_refresh_seconds: 5,
  messages_page_size: 50,
  logs_page_size: 100,
  theme: 'dark',
  scheduler_run_at: '02:00',
  scheduler_interval_hours: 24,
  default_message_sort_by: 'message_date',
  default_message_sort_order: 'desc',
};

export function SettingsPage() {
  const { addToast } = useToast();
  const [settings, setSettings] = useState<SettingsRecord>(defaultSettings);
  const [message, setMessage] = useState('Loading settings…');
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState<SettingsRecord | null>(null);

  async function loadSettings() {
    setLoading(true);
    try {
      const response = await fetchSettings();
      const merged = { ...defaultSettings, ...response.settings };
      setSettings(merged);
      setSaved(merged);
      setMessage('Backend settings loaded.');
    } catch (error) {
      const msg = apiErrorToMessage(error);
      setMessage(msg);
      addToast(msg, 'error', 'Load Settings Failed');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSettings();
  }, []);

  function updateSetting<K extends keyof SettingsRecord>(key: K, value: SettingsRecord[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  function handleReset() {
    setSettings(saved ?? defaultSettings);
    addToast('Form reset to last saved values.', 'info', 'Reset');
  }

  async function handleSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage('Saving settings…');
    addToast('Saving configurations to backend…', 'info', 'Saving Preferences');
    try {
      const response = await saveSettings(settings);
      const merged = { ...defaultSettings, ...response.settings };
      setSettings(merged);
      setSaved(merged);
      setMessage('Settings saved successfully.');
      addToast('Backend configurations updated successfully.', 'success', 'Preferences Saved');
    } catch (error) {
      const msg = apiErrorToMessage(error);
      setMessage(msg);
      addToast(msg, 'error', 'Save Failed');
    }
  }

  return (
    <PageBlock
      eyebrow="Preferences"
      title="Settings"
      description="Validate and persist backend-served control-panel settings. Changes take effect immediately on save."
    >
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr] page-enter">
        <form onSubmit={handleSave} className="glass-panel rounded-[16px] p-6 space-y-5">
          <div>
            <h2 className="section-title">Backend Settings</h2>
            <p className="mt-1 text-sm text-slate-400">These values are stored and validated by Flask.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <SettingField label="Dashboard Refresh (sec)" value={settings.dashboard_refresh_seconds} onChange={(v) => updateSetting('dashboard_refresh_seconds', Number(v))} />
            <SettingField label="Queue Refresh (sec)"     value={settings.queue_refresh_seconds}     onChange={(v) => updateSetting('queue_refresh_seconds', Number(v))} />
            <SettingField label="Messages Page Size"      value={settings.messages_page_size}         onChange={(v) => updateSetting('messages_page_size', Number(v))} />
            <SettingField label="Logs Page Size"          value={settings.logs_page_size}             onChange={(v) => updateSetting('logs_page_size', Number(v))} />
            <SettingField label="Scheduler Run At"        value={settings.scheduler_run_at}           onChange={(v) => updateSetting('scheduler_run_at', String(v))} type="time" />
            <SettingField label="Scheduler Interval (hr)" value={settings.scheduler_interval_hours}   onChange={(v) => updateSetting('scheduler_interval_hours', Number(v))} />
          </div>
          <p className="text-xs text-slate-500">Scheduler time is displayed in IST.</p>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-[13px] font-semibold uppercase tracking-[0.18em] text-slate-400">Theme</span>
              <select
                value={settings.theme}
                onChange={(e) => updateSetting('theme', e.target.value as SettingsRecord['theme'])}
                className="w-full rounded-2xl border border-white/10 px-4 py-3 text-sm text-slate-100 outline-none"
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-2 block text-[13px] font-semibold uppercase tracking-[0.18em] text-slate-400">Default Sort Order</span>
              <select
                value={settings.default_message_sort_order}
                onChange={(e) => updateSetting('default_message_sort_order', e.target.value as SettingsRecord['default_message_sort_order'])}
                className="w-full rounded-2xl border border-white/10 px-4 py-3 text-sm text-slate-100 outline-none"
              >
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </select>
            </label>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="submit"
              className="inline-flex h-12 items-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 to-teal-500 px-5 text-sm font-semibold text-slate-950 transition hover:translate-y-[-1px]"
            >
              <Save className="h-4 w-4" />
              Save Settings
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex h-12 items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </button>
          </div>
        </form>

        <aside className="space-y-4">
          <article className="glass-panel rounded-[16px] p-6">
            <h2 className="section-title">Status</h2>
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">{message}</div>
          </article>

          <article className="glass-panel rounded-[16px] p-6">
            <h2 className="section-title">Validation</h2>
            <AsyncState loading={loading} empty={false} skeletonRows={4}>
              <div className="mt-4 space-y-3 text-sm text-slate-300">
                <ValidationRow label="Dashboard Refresh" value={`${settings.dashboard_refresh_seconds}s`} saved={saved?.dashboard_refresh_seconds} current={settings.dashboard_refresh_seconds} />
                <ValidationRow label="Queue Refresh"     value={`${settings.queue_refresh_seconds}s`}     saved={saved?.queue_refresh_seconds}     current={settings.queue_refresh_seconds} />
                <ValidationRow label="Messages Page Size" value={String(settings.messages_page_size)}      saved={saved?.messages_page_size}         current={settings.messages_page_size} />
                <ValidationRow label="Logs Page Size"    value={String(settings.logs_page_size)}          saved={saved?.logs_page_size}             current={settings.logs_page_size} />
              </div>
            </AsyncState>
          </article>
        </aside>
      </div>
    </PageBlock>
  );
}

function SettingField({
  label, value, onChange, type = 'number',
}: {
  label: string;
  value: string | number;
  onChange: (value: string | number) => void;
  type?: 'number' | 'text' | 'time';
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[13px] font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</span>
      <input
        value={value}
        type={type}
        onChange={(e) => onChange(type === 'number' ? Number(e.target.value) : e.target.value)}
        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-500/50 transition"
      />
    </label>
  );
}

function ValidationRow({
  label, value, saved, current,
}: {
  label: string;
  value: string;
  saved?: string | number;
  current?: string | number;
}) {
  const isDirty = saved !== undefined && saved !== current;
  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
      <span className="text-slate-500">{label}</span>
      <div className="flex items-center gap-2">
        {isDirty && (
          <span className="rounded-full bg-amber-400/15 border border-amber-400/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
            Unsaved
          </span>
        )}
        <span className="font-semibold text-slate-100">{value}</span>
      </div>
    </div>
  );
}
