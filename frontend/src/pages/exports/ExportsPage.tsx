import { useMemo, useState } from 'react';
import {
  FolderDown,
  Download,
  FileSpreadsheet,
  Search,
  RefreshCw,
  HardDrive,
} from 'lucide-react';
import { AsyncState } from '@/components/common/AsyncState';
import { useAsyncQuery } from '@/hooks/useAsyncQuery';
import { useToast } from '@/contexts/ToastContext';
import { apiErrorToMessage } from '@/services/api';
import { http as api } from '@/services/http';
import { formatIST } from '@/utils/time';

interface ExportFile {
  name: string;
  path: string;
  size: number;
  modified_at: string;
  rows?: number | null;
}

interface ExportsResponse {
  success?: boolean;
  files: ExportFile[];
  total_size: number;
}

async function fetchExports(): Promise<ExportsResponse> {
  try {
    const response = await api.get<ExportsResponse>('/api/exports');
    return response.data;
  } catch {
    // If endpoint doesn't exist yet, return empty
    return { success: true, files: [], total_size: 0 };
  }
}

export function ExportsPage() {
  const { addToast } = useToast();
  const [search, setSearch] = useState('');
  const [downloadingPath, setDownloadingPath] = useState<string | null>(null);

  const exportsQuery = useAsyncQuery(fetchExports, { refreshIntervalMs: 30000 });
  const data = exportsQuery.data;
  const files = data?.files ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return files;
    return files.filter(f => f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q));
  }, [files, search]);

  const totalSize = data?.total_size ?? files.reduce((sum, f) => sum + (f.size || 0), 0);

  async function handleDownload(file: ExportFile) {
    setDownloadingPath(file.path);
    try {
      const response = await api.get('/api/exports/download', {
        params: { path: file.path },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(response.data as Blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      addToast(`Downloaded ${file.name}`, 'success', 'Export Download');
    } catch (err) {
      addToast(apiErrorToMessage(err), 'error', 'Download Failed');
    } finally {
      setDownloadingPath(null);
    }
  }

  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const idx = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / Math.pow(1024, idx)).toFixed(idx > 0 ? 1 : 0)} ${units[idx]}`;
  }

  return (
    <AsyncState loading={false}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-3 text-xl font-semibold text-slate-50">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 shadow-lg shadow-emerald-500/20">
                <FolderDown className="h-5 w-5 text-white" />
              </div>
              Exports
            </h1>
            <p className="mt-1 text-[13px] text-slate-400">
              Browse and download scraped CSV data files
            </p>
          </div>
          <button
            type="button"
            onClick={() => void exportsQuery.refetch()}
            className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5 text-[12px] font-medium text-slate-200 transition hover:bg-white/10"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${exportsQuery.isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Stats Row */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/15">
                <FileSpreadsheet className="h-4 w-4 text-cyan-400" />
              </div>
              <div>
                <p className="text-lg font-bold text-slate-100">{files.length}</p>
                <p className="text-[11px] text-slate-400">CSV Files</p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-500/15">
                <HardDrive className="h-4 w-4 text-violet-400" />
              </div>
              <div>
                <p className="text-lg font-bold text-slate-100">{formatBytes(totalSize)}</p>
                <p className="text-[11px] text-slate-400">Total Size</p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15">
                <Download className="h-4 w-4 text-emerald-400" />
              </div>
              <div>
                <p className="text-lg font-bold text-slate-100">{filtered.length}</p>
                <p className="text-[11px] text-slate-400">{search ? 'Matching' : 'Available'} Downloads</p>
              </div>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            type="search"
            placeholder="Search export files..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-transparent text-[13px] text-slate-100 outline-none placeholder:text-slate-500"
          />
        </div>

        {/* File List */}
        <div className="glass-panel rounded-2xl">
          <div className="p-1">
            {exportsQuery.isLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-14 animate-pulse rounded-xl bg-white/5" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center">
                <FolderDown className="mx-auto mb-3 h-10 w-10 text-slate-600" />
                <p className="text-[14px] font-medium text-slate-400">
                  {files.length === 0 ? 'No export files yet' : 'No files match your search'}
                </p>
                <p className="mt-1 text-[12px] text-slate-500">
                  {files.length === 0 ? 'CSV files will appear here once you scrape Telegram channels.' : 'Try a different search term.'}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-white/5">
                {filtered.map((file) => (
                  <div
                    key={file.path}
                    className="flex items-center gap-4 px-5 py-3.5 transition hover:bg-white/[0.03]"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
                      <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-slate-200">{file.name}</p>
                      <p className="text-[11px] text-slate-500">{file.path}</p>
                    </div>
                    <div className="hidden text-right sm:block">
                      <p className="text-[12px] text-slate-300">{formatBytes(file.size)}</p>
                      <p className="text-[11px] text-slate-500">{formatIST(file.modified_at)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleDownload(file)}
                      disabled={downloadingPath === file.path}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[11px] font-medium text-slate-200 transition hover:bg-white/10 disabled:opacity-50"
                    >
                      <Download className={`h-3 w-3 ${downloadingPath === file.path ? 'animate-bounce' : ''}`} />
                      {downloadingPath === file.path ? 'Downloading...' : 'Download'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AsyncState>
  );
}
