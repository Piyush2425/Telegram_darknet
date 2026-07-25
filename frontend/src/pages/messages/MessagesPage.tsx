import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Search, SlidersHorizontal, FileDown, FileSpreadsheet, Trash2, Loader2 } from 'lucide-react';
import { AsyncState } from '@/components/common/AsyncState';
import { PageBlock } from '@/components/common/PageBlock';
import { useAsyncQuery } from '@/hooks/useAsyncQuery';
import { useToast } from '@/contexts/ToastContext';
import { apiErrorToMessage, fetchMessages, deleteMessage, type MessageRecord, type MessagesResponse } from '@/services/api';
import { formatIST } from '@/utils/time';

const PAGE_SIZE = 50;
const ROW_HEIGHT = 72;
const VIEWPORT_HEIGHT = 72 * 10;

export function MessagesPage() {
  const { addToast } = useToast();
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('message_date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [scrollTop, setScrollTop] = useState(0);
  const [level] = useState<string>(''); // Reserved for backend expansion.
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const loadMessages = useMemo(
    () => () =>
      fetchMessages({
        page,
        page_size: PAGE_SIZE,
        search,
        sort_by: sortBy,
        sort_order: sortOrder,
        level,
      }),
    [level, page, search, sortBy, sortOrder],
  );

  const { data, error, isLoading, refetch } = useAsyncQuery<MessagesResponse>(loadMessages, {
    refreshIntervalMs: 15000,
    keepPreviousData: true,
  });

  const messages = data?.items ?? [];
  const total = data?.total ?? 0;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 2);
  const visibleCount = Math.ceil(VIEWPORT_HEIGHT / ROW_HEIGHT) + 4;
  const visibleMessages = messages.slice(startIndex, startIndex + visibleCount);
  const topPadding = startIndex * ROW_HEIGHT;
  const bottomPadding = Math.max(0, (messages.length - startIndex - visibleMessages.length) * ROW_HEIGHT);

  const empty = !isLoading && !error && !messages.length;

  const handleExportCSV = () => {
    if (!messages.length) return;
    const headers = ['Message ID', 'Date', 'Chat Name', 'Chat ID', 'Sender Name', 'Media Type', 'Text'];
    const rows = messages.map(m => [
      m.message_id,
      formatIST(m.message_date ?? m.date),
      m.chat_name ?? 'Unknown',
      m.chat_id,
      m.sender_name ?? 'Unknown',
      m.media_type ?? 'text',
      `"${(m.text ?? m.message_text ?? '').replace(/"/g, '""')}"`
    ]);
    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `darknet_messages_${new Date().toISOString().slice(0, 10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportJSON = () => {
    if (!messages.length) return;
    const blob = new Blob([JSON.stringify(messages, null, 2)], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `darknet_messages_${new Date().toISOString().slice(0, 10)}.json`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDelete = async (messageId: number) => {
    setDeletingId(messageId);
    try {
      await deleteMessage(messageId);
      addToast('Message deleted successfully.', 'success', 'Deleted');
      void refetch();
    } catch (err) {
      addToast(apiErrorToMessage(err), 'error', 'Delete Failed');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <PageBlock
      eyebrow="Message Intelligence"
      title="Messages"
      description="Search and inspect stored Telegram messages with server-side pagination and a lightweight virtualized table."
    >
      <div className="glass-panel rounded-[16px] p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="grid gap-3 md:grid-cols-2 xl:min-w-[760px]">
            <label className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={(event) => {
                  setPage(1);
                  setSearch(event.target.value);
                }}
                placeholder="Search text, sender, chat"
                className="w-full bg-transparent text-sm text-slate-100 outline-none placeholder:text-slate-500"
              />
            </label>
            <div className="flex gap-2">
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100 outline-none"
              >
                <option value="message_date">Message Date</option>
                <option value="created_at">Created At</option>
                <option value="sender_name">Sender</option>
                <option value="chat_name">Chat</option>
                <option value="message_id">Message ID</option>
              </select>
              <button
                type="button"
                onClick={() => setSortOrder((current) => (current === 'asc' ? 'desc' : 'asc'))}
                className="inline-flex h-12 items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-slate-100 transition hover:bg-white/10"
              >
                <SlidersHorizontal className="h-4 w-4" />
                {sortOrder.toUpperCase()}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleExportCSV}
              disabled={!messages.length}
              className="inline-flex h-12 items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-slate-100 transition hover:bg-white/10 disabled:opacity-50"
            >
              <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
              CSV Export
            </button>
            <button
              type="button"
              onClick={handleExportJSON}
              disabled={!messages.length}
              className="inline-flex h-12 items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-slate-100 transition hover:bg-white/10 disabled:opacity-50"
            >
              <FileDown className="h-4 w-4 text-cyan-400" />
              JSON Export
            </button>
            <button
              type="button"
              onClick={() => void refetch()}
              className="inline-flex h-12 items-center gap-2 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 px-4 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-400/25"
            >
              Refresh
            </button>
            <div className="inline-flex h-12 items-center rounded-2xl border border-white/10 bg-white/5 px-4 text-sm text-slate-300">
              Total {total.toLocaleString()}
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
          {error ? apiErrorToMessage(error) : `Showing page ${page}. Backend page size: ${data?.page_size ?? PAGE_SIZE}.`}
        </div>

        <div
          className="mt-4 overflow-auto rounded-[16px] border border-white/10"
          style={{ maxHeight: VIEWPORT_HEIGHT }}
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        >
          <AsyncState
            loading={isLoading && !messages.length}
            error={error}
            empty={empty}
            title="No messages"
            description="No stored Telegram messages matched the current filters."
            onRetry={refetch}
          >
            <div style={{ minHeight: messages.length * ROW_HEIGHT }}>
              <div style={{ height: topPadding }} />
              {visibleMessages.map((message: MessageRecord) => (
                <MessageRow 
                  key={`${message.chat_id}-${message.message_id}`} 
                  message={message} 
                  onDelete={() => void handleDelete(message.message_id)}
                  isDeleting={deletingId === message.message_id}
                />
              ))}
              <div style={{ height: bottomPadding }} />
            </div>
          </AsyncState>
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <div className="text-sm text-slate-400">
            Page {page} of {Math.max(1, Math.ceil(total / PAGE_SIZE))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page <= 1}
              className="inline-flex h-11 items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-slate-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronLeft className="h-4 w-4" />
              Prev
            </button>
            <button
              type="button"
              onClick={() => setPage((current) => current + 1)}
              disabled={page * PAGE_SIZE >= total && total > 0}
              className="inline-flex h-11 items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 text-sm font-semibold text-slate-100 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </PageBlock>
  );
}

function MessageRow({ message, onDelete, isDeleting }: { message: MessageRecord; onDelete: () => void; isDeleting: boolean }) {
  return (
    <div className="grid grid-cols-[140px_180px_180px_minmax(0,1fr)_80px] gap-4 border-b border-white/10 px-4 py-4 text-sm hover:bg-white/[0.03]">
      <div>
        <p className="font-semibold text-slate-100">#{message.message_id}</p>
        <p className="mt-1 text-xs text-slate-500">{formatIST(message.message_date ?? message.date)}</p>
      </div>
      <div className="min-w-0">
        <p className="truncate font-semibold text-slate-100">{message.chat_name ?? 'Unknown chat'}</p>
        <p className="mt-1 text-xs text-slate-500">Chat ID: {message.chat_id}</p>
      </div>
      <div className="min-w-0">
        <p className="truncate text-slate-300">{message.sender_name ?? message.sender_username ?? 'Unknown sender'}</p>
        <p className="mt-1 text-xs text-slate-500">{message.media_type ?? 'text'}</p>
      </div>
      <div className="min-w-0 text-slate-300">
        <p className="max-h-12 overflow-hidden whitespace-pre-wrap">{message.text ?? message.message_text ?? '(empty message)'}</p>
      </div>
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={onDelete}
          disabled={isDeleting}
          className="inline-flex items-center justify-center p-2 rounded-xl text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition disabled:opacity-50"
          title="Delete message"
        >
          {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
