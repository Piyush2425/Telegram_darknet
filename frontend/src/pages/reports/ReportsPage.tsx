import { useEffect, useMemo, useState } from 'react';
import { Download, FileText, RefreshCw, Search, Sparkles } from 'lucide-react';
import { AsyncState } from '@/components/common/AsyncState';
import { PageBlock } from '@/components/common/PageBlock';
import { useAsyncQuery } from '@/hooks/useAsyncQuery';
import { fetchReportContent, fetchReports, type ReportContentResponse, type ReportsResponse } from '@/services/api';
import { formatIST } from '@/utils/time';

function resolveReportLabel(path: string) {
  if (path.startsWith('hourly/')) return 'Hourly';
  if (path.startsWith('daily/')) return 'Daily';
  if (path.startsWith('combined/')) return 'Combined';
  return 'Report';
}

export function ReportsPage() {
  const [search, setSearch] = useState('');
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  const loadReports = useMemo(() => () => fetchReports(), []);
  const {
    data: reportsData,
    error: reportsError,
    isLoading: reportsLoading,
    refetch: refetchReports,
  } = useAsyncQuery<ReportsResponse>(loadReports, {
    refreshIntervalMs: 30000,
  });

  const reports = useMemo(() => {
    const items = reportsData?.reports ?? [];
    const filtered = search.trim()
      ? items.filter((item) => item.path.toLowerCase().includes(search.trim().toLowerCase()))
      : items;
    return [...filtered].sort((left, right) => {
      const leftTime = Date.parse(left.modified_at ?? '') || 0;
      const rightTime = Date.parse(right.modified_at ?? '') || 0;
      return rightTime - leftTime;
    });
  }, [reportsData?.reports, search]);

  useEffect(() => {
    if (!selectedPath && reports.length) {
      setSelectedPath(reports[0].path);
    } else if (selectedPath && !reports.some((item) => item.path === selectedPath) && reports.length) {
      setSelectedPath(reports[0].path);
    }
  }, [reports, selectedPath]);

  const selectedReport = reports.find((item) => item.path === selectedPath) ?? null;
  const selectedIsPdf = selectedReport?.kind === 'pdf' || selectedReport?.path?.toLowerCase().endsWith('.pdf');

  const loadSelectedReport = useMemo(
    () => () => fetchReportContent(selectedPath ?? ''),
    [selectedPath],
  );

  const {
    data: selectedContent,
    error: selectedError,
    isLoading: selectedLoading,
    refetch: refetchSelected,
  } = useAsyncQuery<ReportContentResponse>(loadSelectedReport, {
    enabled: Boolean(selectedPath && selectedReport && !selectedIsPdf),
    refreshIntervalMs: selectedPath && !selectedIsPdf ? 30000 : undefined,
    keepPreviousData: true,
  });

  const totals = {
    all: reportsData?.reports?.length ?? 0,
    hourly: reports.filter((item) => item.path.startsWith('hourly/')).length,
    daily: reports.filter((item) => item.path.startsWith('daily/')).length,
    combined: reports.filter((item) => item.path.startsWith('combined/')).length,
  };

  const preview = selectedContent?.report?.content ?? '';
  const previewError = selectedError || reportsError;
  const previewLoading = selectedLoading || reportsLoading;
  const stateSummary = reportsData?.state;

  return (
    <PageBlock
      eyebrow="Analysis Reports"
      title="Reports"
      description="LLM-written hourly channel reports, plus daily and combined summaries built from them."
    >
      <div className="grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Metric label="All" value={totals.all} />
            <Metric label="Hourly" value={totals.hourly} />
            <Metric label="Daily" value={totals.daily} />
            <Metric label="Combined" value={totals.combined} />
          </div>

          <div className="glass-panel rounded-[16px] border border-white/10 bg-white/5 p-3">
            <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/50 px-3 py-2">
              <Search className="h-4 w-4 text-slate-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search reports"
                className="w-full bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
              />
            </label>
          </div>

          <div className="rounded-[16px] border border-white/10 bg-white/5 p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-300/80">Files</p>
                <p className="mt-1 text-sm text-slate-400">Latest report files from the backend.</p>
              </div>
              <button
                type="button"
                onClick={() => void refetchReports()}
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-semibold text-slate-100 transition hover:bg-white/10"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh
              </button>
            </div>

            <div className="mt-3 space-y-2">
              <AsyncState
                loading={reportsLoading && !reports.length}
                error={reportsError}
                empty={!reportsLoading && !reportsError && !reports.length}
                title="No reports yet"
                description="Run scraping and analysis first to generate hourly reports."
                onRetry={refetchReports}
                skeletonRows={4}
              >
                {reports.map((item) => {
                  const active = item.path === selectedPath;
                  return (
                    <button
                      key={item.path}
                      type="button"
                      onClick={() => setSelectedPath(item.path)}
                      className={[
                        'w-full rounded-2xl border px-3 py-3 text-left transition',
                        active
                          ? 'border-cyan-400/30 bg-cyan-400/10'
                          : 'border-white/10 bg-slate-950/40 hover:bg-white/5',
                      ].join(' ')}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <FileText className="h-3.5 w-3.5 text-cyan-300" />
                            <p className="truncate text-sm font-semibold text-slate-100">{item.path}</p>
                          </div>
                          <p className="mt-1 text-xs text-slate-500">
                            {resolveReportLabel(item.path)} - {formatIST(item.modified_at)}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </AsyncState>
            </div>
          </div>

          <div className="rounded-[16px] border border-white/10 bg-white/5 p-3 text-xs text-slate-400">
            <p className="font-semibold text-slate-200">Backend state</p>
            <div className="mt-2 space-y-1.5">
              <p>Channels tracked: {Object.keys(stateSummary?.channels ?? {}).length}</p>
              <p>Combined reports: {Object.keys(stateSummary?.combined ?? {}).length}</p>
            </div>
          </div>
        </div>

        <div className="rounded-[16px] border border-white/10 bg-white/5 p-4">
          <div className="flex flex-col gap-2 border-b border-white/10 pb-4 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-300/80">Preview</p>
              <h2 className="mt-1 truncate text-lg font-semibold text-slate-100">
                {selectedReport?.path ?? 'Select a report'}
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                {selectedReport ? `Updated ${formatIST(selectedReport.modified_at)}` : 'Choose a report on the left.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void refetchSelected()}
              disabled={!selectedPath}
              className="inline-flex h-10 items-center gap-2 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" />
              Reload
            </button>
          </div>

          <AsyncState
            loading={previewLoading && !preview}
            error={previewError}
            empty={!previewLoading && !previewError && !preview && !selectedIsPdf}
            title="No preview"
            description={selectedIsPdf ? 'PDF reports are available for download but not text preview.' : 'Select a report to display its markdown content.'}
            onRetry={selectedPath && !selectedIsPdf ? () => void refetchSelected() : undefined}
            skeletonRows={8}
          >
            <div className="mt-4">
              <div className="mb-3 flex flex-wrap gap-2 text-[11px] text-slate-400">
                <Badge>{resolveReportLabel(selectedReport?.path ?? '')}</Badge>
                <Badge>{`${selectedReport?.size?.toLocaleString() ?? '0'} bytes`}</Badge>
                <Badge>{selectedReport?.modified_at ? formatIST(selectedReport.modified_at) : 'Unknown'}</Badge>
              </div>
              {selectedIsPdf ? (
                <div className="rounded-[16px] border border-white/10 bg-slate-950/60 p-4 text-sm text-slate-300">
                  <p>This artifact is a PDF report. Use the download/open control from the left panel to inspect it.</p>
                  <button
                    type="button"
                    onClick={() => window.open(`${import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000'}/api/reports/download?path=${encodeURIComponent(selectedReport?.path ?? '')}`, '_blank', 'noopener,noreferrer')}
                    className="mt-4 inline-flex h-10 items-center gap-2 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/20"
                  >
                    <Download className="h-4 w-4" />
                    Open File
                  </button>
                </div>
              ) : (
                <pre className="max-h-[72vh] overflow-auto rounded-[16px] border border-white/10 bg-slate-950/60 p-4 text-[13px] leading-6 text-slate-200">
                  {preview}
                </pre>
              )}
            </div>
          </AsyncState>
        </div>
      </div>
    </PageBlock>
  );
}

function Badge({ children }: { children: string }) {
  return <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1">{children}</span>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[16px] border border-white/10 bg-white/5 p-3">
      <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-slate-100">{value.toLocaleString()}</p>
    </div>
  );
}
