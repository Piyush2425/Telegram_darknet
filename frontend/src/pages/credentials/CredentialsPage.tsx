import { useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, Plug, Save, XCircle } from 'lucide-react';
import { PageBlock } from '@/components/common/PageBlock';
import { useToast } from '@/contexts/ToastContext';
import { fetchCredentialsStatus, initializeClient, saveCredentials } from '@/services/api';

export function CredentialsPage() {
  const { addToast } = useToast();
  const [apiId, setApiId]   = useState('');
  const [apiHash, setApiHash] = useState('');
  const [phone, setPhone]   = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy]     = useState(false);
  const [message, setMessage] = useState('Manage Telegram API credentials.');

  async function loadStatus() {
    try {
      const nextLoaded = await fetchCredentialsStatus();
      setLoaded(nextLoaded);
      setMessage(nextLoaded ? 'Credentials are already loaded.' : 'Credentials are not yet configured.');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to load credential status';
      setMessage(msg);
      addToast(msg, 'error', 'Status Check Failed');
    }
  }

  useEffect(() => {
    void loadStatus();
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!apiId || !apiHash || !phone) {
      addToast('Please fill in all three credential fields.', 'warning', 'Incomplete Form');
      return;
    }
    setBusy(true);
    setMessage('Saving credentials…');
    try {
      await saveCredentials({ api_id: apiId, api_hash: apiHash, phone });
      setLoaded(true);
      setMessage('Credentials saved successfully.');
      addToast('Telegram API credentials stored in backend.', 'success', 'Credentials Saved');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to save credentials';
      setMessage(msg);
      addToast(msg, 'error', 'Save Failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleInitialize() {
    setBusy(true);
    setMessage('Initializing Telegram client…');
    addToast('Sending initialize request to backend…', 'info', 'Initializing Client');
    try {
      const response = await initializeClient();
      const msg = response.message ?? 'Client initialized successfully.';
      setMessage(msg);
      addToast(msg, 'success', 'Client Ready');
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to initialize client';
      setMessage(msg);
      addToast(msg, 'error', 'Initialize Failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageBlock
      eyebrow="Access"
      title="Credentials"
      description="Save the Telegram API keys required by the backend client. Keys are stored server-side and never exposed to the browser."
    >
      <div className="grid gap-6 xl:grid-cols-[1fr_0.8fr] page-enter">
        {/* Form */}
        <form onSubmit={handleSubmit} className="glass-panel rounded-[16px] p-6 space-y-5">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-cyan-300" />
            <h2 className="section-title">Telegram API Credentials</h2>
          </div>

          <div className="grid gap-4">
            <label className="block">
              <span className="mb-2 block text-[13px] font-semibold uppercase tracking-[0.18em] text-slate-400">API ID</span>
              <input
                value={apiId}
                onChange={(e) => setApiId(e.target.value)}
                placeholder="12345678"
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-[13px] font-semibold uppercase tracking-[0.18em] text-slate-400">API Hash</span>
              <input
                value={apiHash}
                onChange={(e) => setApiHash(e.target.value)}
                placeholder="a1b2c3d4e5f6…"
                type="password"
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-[13px] font-semibold uppercase tracking-[0.18em] text-slate-400">Phone Number</span>
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91XXXXXXXXXX"
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition"
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-12 items-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 to-teal-500 px-5 text-sm font-semibold text-slate-950 transition hover:translate-y-[-1px] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="h-4 w-4" />
              Save Credentials
            </button>
            <button
              type="button"
              onClick={() => void handleInitialize()}
              disabled={busy}
              className="inline-flex h-12 items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 text-sm font-semibold text-slate-100 transition hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plug className="h-4 w-4" />
              Initialize Client
            </button>
          </div>
        </form>

        {/* Status aside */}
        <aside className="space-y-4">
          <article className="glass-panel rounded-[16px] p-6 space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">State</p>
              <h2 className="section-title mt-1">Credential Status</h2>
            </div>

            {/* Loaded badge */}
            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              {loaded ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
              ) : (
                <XCircle className="h-5 w-5 text-rose-400 shrink-0" />
              )}
              <div>
                <p className="text-sm font-semibold text-slate-100">
                  {loaded ? 'Credentials loaded' : 'Not configured'}
                </p>
                <p className="text-xs text-slate-400">
                  {loaded ? 'Backend client is ready to connect.' : 'Enter your keys and save.'}
                </p>
              </div>
            </div>

            <div
              className={`rounded-2xl border px-4 py-3 text-sm ${
                loaded
                  ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
                  : 'border-white/10 bg-white/5 text-slate-300'
              }`}
            >
              {message}
            </div>
          </article>

          <article className="glass-panel rounded-[16px] p-5 text-[13px] text-slate-400 space-y-1 leading-relaxed">
            <p className="font-semibold text-slate-300">Where to get credentials?</p>
            <p>Visit <span className="text-cyan-300">my.telegram.org</span>, log in, and open <em>API Development Tools</em> to retrieve your App API ID and Hash.</p>
          </article>
        </aside>
      </div>
    </PageBlock>
  );
}
