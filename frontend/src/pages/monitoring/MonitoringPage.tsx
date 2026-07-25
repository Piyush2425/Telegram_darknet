import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  Clock3,
  FileText,
  RefreshCw,
  Save,
  Shield,
  SquareActivity,
  PlayCircle,
  PauseCircle,
} from 'lucide-react';
import { AsyncState } from '@/components/common/AsyncState';
import { PageBlock } from '@/components/common/PageBlock';
import { useAsyncQuery } from '@/hooks/useAsyncQuery';
import { useToast } from '@/contexts/ToastContext';
import { apiErrorToMessage, fetchGroupMemory, fetchGroupReports, fetchGroupStatus, fetchMonitoringGroups, generateGroupReport, startGroupMonitoring, stopGroupMonitoring, updateGroupInterval, type ReportFileRecord, type MonitoringGroup } from '@/services/api';
import { formatIST, formatISTWithSeconds } from '@/utils/time';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000';

export function MonitoringPage() {
  const { addToast } = useToast();
  const navigate = useNavigate();
  const { telegramId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedTelegramId = telegramId ? Number(telegramId) : null;
  const autostart = searchParams.get('autostart') === '1';
  const autostarted = useRef(false);
  const [search, setSearch] = useState('');
  const [intervalDrafts, setIntervalDrafts] = useState<Record<number, number>>({});
  const [message, setMessage] = useState('Select a monitored Telegram group to inspect or open it in a new tab.');
  const [busyId, setBusyId] = useState<number | null>(null);

  const groupsQuery = useAsyncQuery(fetchMonitoringGroups, { refreshIntervalMs: 5000 });
  const groups = (groupsQuery.data ?? []) as MonitoringGroup[];

  const selectedGroup = useMemo(
    () => groups.find((group) => group.telegram_id === selectedTelegramId) ?? null,
    [groups, selectedTelegramId],
  );

  const selectedStatusQuery = useAsyncQuery(
    useMemo(() => () => (selectedTelegramId ? fetchGroupStatus(selectedTelegramId) : Promise.resolve(null)), [selectedTelegramId]),
    { enabled: Boolean(selectedTelegramId), refreshIntervalMs: 5000, keepPreviousData: true },
  );
  const selectedStatus = selectedStatusQuery.data ?? selectedGroup;

  const selectedMemoryQuery = useAsyncQuery(
    useMemo(() => () => (selectedTelegramId ? fetchGroupMemory(selectedTelegramId) : Promise.resolve(null)), [selectedTelegramId]),
    { enabled: Boolean(selectedTelegramId), refreshIntervalMs: 15000, keepPreviousData: true },
  );

  const selectedReportsQuery = useAsyncQuery(
    useMemo(() => () => (selectedTelegramId ? fetchGroupReports(selectedTelegramId) : Promise.resolve([] as ReportFileRecord[])), [selectedTelegramId]),
    { enabled: Boolean(selectedTelegramId), refreshIntervalMs: 30000, keepPreviousData: true },
  );

  useEffect(() => {
    setIntervalDrafts((current) => {
      const next = { ...current };
      for (const group of groups as MonitoringGroup[]) {
        if (next[group.telegram_id] === undefined) {
          next[group.telegram_id] = group.interval_minutes ?? 60;
        }
      }
      return next;
    });
  }, [groups]);

  useEffect(() => {
    if (!selectedTelegramId || !autostart || autostarted.current) return;
    autostarted.current = true;
    void handleStart(selectedTelegramId);
    setSearchParams({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTelegramId, autostart, setSearchParams]);

  const filteredGroups = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return groups;
    return (groups as MonitoringGroup[]).filter((group) =>
      [group.title, group.username, group.type, group.monitoring_status, group.last_error]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [groups, search]);

  async function handleStart(telegramIdValue: number) {
    setBusyId(telegramIdValue);
    setMessage(`Starting monitoring for group ${telegramIdValue}...`);
    try {
      await startGroupMonitoring(telegramIdValue);
      setMessage('Monitoring enabled.');
      addToast('Monitoring started for the selected group.', 'success', 'Monitoring Started');
      await Promise.all([groupsQuery.refetch(), selectedStatusQuery.refetch(), selectedMemoryQuery.refetch(), selectedReportsQuery.refetch()]);
    } catch (error) {
      const messageText = apiErrorToMessage(error);
      setMessage(messageText);
      addToast(messageText, 'error', 'Start Failed');
    } finally {
      setBusyId(null);
    }
  }

  async function handleStop(telegramIdValue: number) {
    setBusyId(telegramIdValue);
    setMessage(`Stopping monitoring for group ${telegramIdValue}...`);
    try {
      await stopGroupMonitoring(telegramIdValue);
      setMessage('Monitoring stopped.');
      addToast('Monitoring stopped for the selected group.', 'info', 'Monitoring Stopped');
      await Promise.all([groupsQuery.refetch(), selectedStatusQuery.refetch(), selectedMemoryQuery.refetch(), selectedReportsQuery.refetch()]);
    } catch (error) {
      const messageText = apiErrorToMessage(error);
      setMessage(messageText);
      addToast(messageText, 'error', 'Stop Failed');
    } finally {
      setBusyId(null);
    }
  }

  async function handleSaveInterval(telegramIdValue: number) {
    const intervalMinutes = Math.max(Number(intervalDrafts[telegramIdValue] ?? 60), 1);
    setBusyId(telegramIdValue);
    setMessage(`Saving interval ${intervalMinutes} minute(s)...`);
    try {
      await updateGroupInterval(telegramIdValue, intervalMinutes);
      setMessage('Interval updated.');
      addToast(`Saved ${intervalMinutes} minute monitoring interval.`, 'success', 'Interval Saved');
      await Promise.all([groupsQuery.refetch(), selectedStatusQuery.refetch()]);
    } catch (error) {
      const messageText = apiErrorToMessage(error);
      setMessage(messageText);
      addToast(messageText, 'error', 'Save Failed');
    } finally {
      setBusyId(null);
    }
  }

  async function handleGenerateReport(telegramIdValue: number) {
    setBusyId(telegramIdValue);
    setMessage('Generating daily report artifact...');
    try {
      await generateGroupReport(telegramIdValue);
      setMessage('Daily report generated.');
      addToast('Report regenerated for the selected group.', 'success', 'Report Generated');
      await Promise.all([selectedMemoryQuery.refetch(), selectedReportsQuery.refetch()]);
    } catch (error) {
      const messageText = apiErrorToMessage(error);
      setMessage(messageText);
      addToast(messageText, 'error', 'Report Failed');
    } finally {
      setBusyId(null);
    }
  }

  const selectedReports = ((selectedReportsQuery.data ?? []) as ReportFileRecord[]).sort((left: ReportFileRecord, right: ReportFileRecord) => {
    const leftTime = Date.parse(left.modified_at ?? '') || 0;
    const rightTime = Date.parse(right.modified_at ?? '') || 0;
    return rightTime - leftTime;
  });

  return (
    <PageBlock
      eyebrow="Group Monitoring"
      title="Monitoring"
      description="Open a Telegram group, tune its scrape interval, and inspect the incremental memory and report artifacts."
    >
      <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className="glass-panel rounded-[16px] border border-white/10 p-4">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-cyan-300" />
              <div>
                <h2 className="section-title">Monitored Groups</h2>
                <p className="mt-0.5 text-[12px] text-slate-400">{filteredGroups.length} active group(s)</p>
              </div>
            </div>

            <label className="mt-4 flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/50 px-3 py-2">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search groups"
                className="w-full bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
              />
            </label>

            <div className="mt-4 space-y-3">
              <AsyncState
                loading={groupsQuery.isLoading && !groups.length}
                error={groupsQuery.error}
                empty={!filteredGroups.length}
                title="No monitored groups"
                description="Enable a group from the dashboard to see it here."
                onRetry={groupsQuery.refetch}
              >
                {filteredGroups.map((group: MonitoringGroup) => {
                  const active = group.telegram_id === selectedTelegramId;
                  const status = String(group.monitoring_status ?? (group.enabled ? 'idle' : 'stopped')).toLowerCase();
                  const isBusy = busyId === group.telegram_id;
                  return (
                    <article
                      key={group.telegram_id}
                      className={[
                        'rounded-[16px] border p-3 transition',
                        active ? 'border-cyan-400/30 bg-cyan-400/10' : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.05]',
                      ].join(' ')}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <button type="button" onClick={() => void navigate(`/monitoring/${group.telegram_id}`)} className="min-w-0 text-left">
                          <p className="truncate text-sm font-semibold text-slate-100">{group.title}</p>
                          <p className="text-[11px] text-slate-500">ID {group.telegram_id}</p>
                        </button>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${status === 'active' ? 'border border-emerald-400/20 bg-emerald-400/10 text-emerald-200' : 'border border-white/10 bg-white/5 text-slate-400'}`}>
                          {status}
                        </span>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-400">
                        <Metric label="Interval" value={`${group.interval_minutes ?? 60}m`} />
                        <Metric label="Messages" value={String(group.messages_stored ?? 0)} />
                        <Metric label="Last Scrape" value={formatIST(group.last_scraped ?? group.last_synced ?? null, 'Never')} />
                        <Metric label="Next Scrape" value={formatIST(group.next_scrape_at ?? null, 'Pending')} />
                      </div>

                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void navigate(`/monitoring/${group.telegram_id}?autostart=1`)}
                          className="inline-flex h-9 items-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-3 text-[12px] font-semibold text-cyan-100 transition hover:bg-cyan-400/20"
                        >
                          <ArrowRight className="h-3.5 w-3.5" />
                          Monitor
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleStart(group.telegram_id)}
                          disabled={isBusy || status === 'active'}
                          className="inline-flex h-9 items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-3 text-[12px] font-semibold text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <PlayCircle className="h-3.5 w-3.5" />
                          Start
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleStop(group.telegram_id)}
                          disabled={isBusy || status !== 'active'}
                          className="inline-flex h-9 items-center gap-2 rounded-xl border border-rose-400/20 bg-rose-400/10 px-3 text-[12px] font-semibold text-rose-100 transition hover:bg-rose-400/20 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <PauseCircle className="h-3.5 w-3.5" />
                          Stop
                        </button>
                      </div>

                      <div className="mt-3 flex gap-2">
                        <input
                          type="number"
                          min={1}
                          max={1440}
                          step={1}
                          value={intervalDrafts[group.telegram_id] ?? group.interval_minutes ?? 60}
                          onChange={(event) =>
                            setIntervalDrafts((current) => ({
                              ...current,
                              [group.telegram_id]: Number(event.target.value),
                            }))
                          }
                          className="w-24 rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => void handleSaveInterval(group.telegram_id)}
                          disabled={isBusy}
                          className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-[12px] font-semibold text-slate-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Save className="h-3.5 w-3.5" />
                          Save
                        </button>
                      </div>
                    </article>
                  );
                })}
              </AsyncState>
            </div>
          </div>
        </aside>

        <section className="space-y-4">
          <div className="glass-panel rounded-[16px] border border-white/10 p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-300/80">Selected Group</p>
                <h2 className="mt-1 truncate text-xl font-semibold text-slate-100">{selectedStatus?.title ?? selectedGroup?.title ?? 'No group selected'}</h2>
                <p className="mt-1 text-sm text-slate-400">
                  {selectedStatus?.telegram_id ? `Telegram ID ${selectedStatus.telegram_id}` : 'Choose a group on the left to load its live state.'}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-slate-950/50 px-4 py-3 text-sm text-slate-300">
                {message}
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <InfoCard label="Status" value={selectedStatus?.monitoring_status ?? (selectedStatus?.enabled ? 'idle' : 'stopped')} />
              <InfoCard label="Interval" value={`${selectedStatus?.interval_minutes ?? 60} minutes`} />
              <InfoCard label="Last Scrape" value={formatISTWithSeconds(selectedStatus?.last_scrape ?? selectedStatus?.last_synced ?? null, 'Never')} />
              <InfoCard label="Next Scrape" value={formatISTWithSeconds(selectedStatus?.next_scrape_at ?? null, 'Pending')} />
              <InfoCard label="Messages" value={String(selectedStatus?.messages_stored ?? 0)} />
              <InfoCard label="Last Analysis" value={formatISTWithSeconds(selectedStatus?.last_analysis_at ?? null, 'Never')} />
              <InfoCard label="Last Message ID" value={String(selectedStatus?.last_message_id ?? 'Unknown')} />
              <InfoCard label="Last Error" value={selectedStatus?.last_error ? String(selectedStatus.last_error) : 'None'} />
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => selectedTelegramId && void handleStart(selectedTelegramId)}
                disabled={!selectedTelegramId || busyId === selectedTelegramId}
                className="inline-flex h-11 items-center gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <PlayCircle className="h-4 w-4" />
                Start
              </button>
              <button
                type="button"
                onClick={() => selectedTelegramId && void handleStop(selectedTelegramId)}
                disabled={!selectedTelegramId || busyId === selectedTelegramId}
                className="inline-flex h-11 items-center gap-2 rounded-2xl border border-rose-400/20 bg-rose-400/10 px-4 text-sm font-semibold text-rose-100 transition hover:bg-rose-400/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <SquareActivity className="h-4 w-4" />
                Stop
              </button>
              <button
                type="button"
                onClick={() => selectedTelegramId && void handleGenerateReport(selectedTelegramId)}
                disabled={!selectedTelegramId || busyId === selectedTelegramId}
                className="inline-flex h-11 items-center gap-2 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Clock3 className="h-4 w-4" />
                Generate Report
              </button>
              <button
                type="button"
                onClick={() => void Promise.all([groupsQuery.refetch(), selectedStatusQuery.refetch(), selectedMemoryQuery.refetch(), selectedReportsQuery.refetch()])}
                className="inline-flex h-11 items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <article className="rounded-[16px] border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-300/80">Knowledge Base</p>
                  <h3 className="mt-1 text-sm font-semibold text-slate-100">Incremental Markdown memory</h3>
                </div>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-400">
                  {selectedMemoryQuery.data?.path ?? 'No memory file'}
                </span>
              </div>

              <AsyncState
                loading={selectedMemoryQuery.isLoading && !selectedMemoryQuery.data}
                error={selectedMemoryQuery.error}
                empty={!selectedMemoryQuery.isLoading && !selectedMemoryQuery.error && !selectedMemoryQuery.data}
                title="No knowledge base yet"
                description="A memory file will appear after the first incremental scrape."
                onRetry={selectedMemoryQuery.refetch}
                skeletonRows={8}
              >
                <pre className="mt-4 max-h-[68vh] overflow-auto rounded-[16px] border border-white/10 bg-slate-950/60 p-4 text-[13px] leading-6 text-slate-200">
                  {selectedMemoryQuery.data?.content ?? ''}
                </pre>
              </AsyncState>
            </article>

            <aside className="space-y-4">
              <article className="rounded-[16px] border border-white/10 bg-white/5 p-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-300/80">Reports</p>
                    <h3 className="mt-1 text-sm font-semibold text-slate-100">Daily Markdown and PDF artifacts</h3>
                  </div>
                  <FileText className="h-4 w-4 text-cyan-300" />
                </div>

                <div className="mt-4 space-y-2">
                  <AsyncState
                    loading={selectedReportsQuery.isLoading && !selectedReports.length}
                    error={selectedReportsQuery.error}
                    empty={!selectedReportsQuery.isLoading && !selectedReportsQuery.error && !selectedReports.length}
                    title="No reports yet"
                    description="Daily or hourly artifacts will appear here after monitoring runs."
                    onRetry={selectedReportsQuery.refetch}
                    skeletonRows={5}
                  >
                    {selectedReports.map((report: ReportFileRecord) => {
                      const isPdf = report.kind === 'pdf' || report.path.toLowerCase().endsWith('.pdf');
                      const downloadUrl = `${API_BASE_URL}/api/telegram-entities/${selectedTelegramId}/reports/download?path=${encodeURIComponent(report.path)}`;
                      return (
                        <div key={report.path} className="rounded-2xl border border-white/10 bg-slate-950/50 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-100">{report.path}</p>
                              <p className="mt-1 text-xs text-slate-500">
                                {isPdf ? 'PDF' : 'Markdown'} - {formatIST(report.modified_at)}
                              </p>
                            </div>
                            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-slate-400">
                              {report.kind ?? 'markdown'}
                            </span>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => window.open(downloadUrl, '_blank', 'noopener,noreferrer')}
                              className="inline-flex h-9 items-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-400/10 px-3 text-[12px] font-semibold text-cyan-100 transition hover:bg-cyan-400/20"
                            >
                              <ArrowRight className="h-3.5 w-3.5" />
                              Open
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </AsyncState>
                </div>
              </article>
            </aside>
          </div>
        </section>
      </div>
    </PageBlock>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-sm font-semibold text-slate-100">{value}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 text-xs font-semibold text-slate-100">{value}</p>
    </div>
  );
}
