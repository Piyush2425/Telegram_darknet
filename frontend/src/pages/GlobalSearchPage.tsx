import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, AlertTriangle, Shield, AlertCircle, Info, ExternalLink, Loader2, X, Filter } from 'lucide-react';
import { globalSearch, getChannels } from '../services/api';
import { Message, Channel } from '../types';

const THREAT_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  CRITICAL: { label: 'CRITICAL', color: 'text-red-700', bg: 'bg-red-100 border-red-300', icon: <AlertTriangle className="w-3 h-3" /> },
  HIGH:     { label: 'HIGH',     color: 'text-orange-700', bg: 'bg-orange-100 border-orange-300', icon: <AlertCircle className="w-3 h-3" /> },
  MEDIUM:   { label: 'MEDIUM',   color: 'text-yellow-700', bg: 'bg-yellow-100 border-yellow-300', icon: <Shield className="w-3 h-3" /> },
  LOW:      { label: 'LOW',      color: 'text-blue-700',  bg: 'bg-blue-100 border-blue-300',  icon: <Info className="w-3 h-3" /> },
};

function ThreatBadge({ level }: { level: string }) {
  const cfg = THREAT_CONFIG[level?.toUpperCase()] || THREAT_CONFIG.LOW;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border ${cfg.bg} ${cfg.color}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} className="bg-yellow-200 text-yellow-900 rounded px-0.5 font-semibold">{part}</mark>
      : part
  );
}

function formatDate(dateStr: string) {
  try {
    return new Date(dateStr).toLocaleString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

const THREAT_LEVELS = ['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

export const GlobalSearchPage: React.FC = () => {
  const [query, setQuery] = useState('');
  const [threatFilter, setThreatFilter] = useState('ALL');
  const [results, setResults] = useState<Message[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getChannels().then(setChannels).catch(console.error);
  }, []);

  const getChannelName = useCallback((msg: Message) => {
    const matched = channels.find(c => c.id === msg.channel_id);
    if (matched) return matched.title;
    // Fallback: strip leading dash or number-only usernames if they look like IDs
    if (msg.channel_username && !msg.channel_username.startsWith('-') && !/^\d+$/.test(msg.channel_username)) {
      return msg.channel_username;
    }
    return msg.channel_id;
  }, [channels]);

  const doSearch = useCallback(async (q: string, tl: string) => {
    if (!q.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await globalSearch(q.trim(), tl === 'ALL' ? undefined : tl);
      setResults(data);
      setSearched(true);
    } catch (e) {
      setError('Search failed. Please ensure the backend is running.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      doSearch(query, threatFilter);
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, threatFilter, doSearch]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const clearSearch = () => {
    setQuery('');
    setResults([]);
    setSearched(false);
    inputRef.current?.focus();
  };

  // Group results by channel for the stats bar
  const channelCounts = results.reduce((acc, m) => {
    const name = getChannelName(m);
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="min-h-full bg-slate-50 p-6 space-y-6">
      {/* Page Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-extrabold text-slate-900 flex items-center gap-2">
          <Search className="w-6 h-6 text-blue-600" />
          Global Message Search
        </h1>
        <p className="text-sm text-slate-500">
          Search across <span className="font-semibold text-slate-700">all monitored channels</span> simultaneously in real-time.
        </p>
      </div>

      {/* Search Bar */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-4">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 pointer-events-none" />
          <input
            ref={inputRef}
            id="global-search-input"
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search keywords, CVEs, usernames, wallet addresses, domains…"
            className="w-full pl-12 pr-12 py-3.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 text-sm font-medium placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition"
          />
          {query && (
            <button
              onClick={clearSearch}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Threat Filter Pills */}
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <span className="text-xs text-slate-500 font-medium">Severity:</span>
          {THREAT_LEVELS.map(lvl => (
            <button
              key={lvl}
              id={`filter-${lvl.toLowerCase()}`}
              onClick={() => setThreatFilter(lvl)}
              className={`px-3 py-1 rounded-full text-xs font-bold border transition ${
                threatFilter === lvl
                  ? 'bg-blue-600 text-white border-blue-600 shadow'
                  : 'bg-white text-slate-600 border-slate-300 hover:border-blue-400 hover:text-blue-600'
              }`}
            >
              {lvl}
            </button>
          ))}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center gap-3 py-10 text-slate-500">
          <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
          <span className="text-sm font-medium">Searching all channels…</span>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 font-medium">
          {error}
        </div>
      )}

      {/* Stats bar */}
      {!loading && searched && results.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-blue-600 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow">
            {results.length} result{results.length !== 1 ? 's' : ''} found
          </div>
          {Object.entries(channelCounts).slice(0, 5).map(([name, count]) => (
            <div key={name} className="bg-white border border-slate-200 text-slate-700 text-xs font-semibold px-3 py-1.5 rounded-full shadow-sm">
              {name}: {count}
            </div>
          ))}
          {Object.keys(channelCounts).length > 5 && (
            <div className="text-xs text-slate-400 font-medium">
              +{Object.keys(channelCounts).length - 5} more channels
            </div>
          )}
        </div>
      )}

      {/* Results Table */}
      {!loading && searched && results.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200">
                  <th className="text-left px-4 py-3 text-xs font-bold text-slate-600 uppercase tracking-wide w-40">Channel</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-slate-600 uppercase tracking-wide w-36">Date</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-slate-600 uppercase tracking-wide w-28">Sender</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-slate-600 uppercase tracking-wide w-24">Severity</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-slate-600 uppercase tracking-wide">Message</th>
                  <th className="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {results.map((msg, idx) => (
                  <tr
                    key={msg.id || idx}
                    className="hover:bg-slate-50 transition-colors group"
                  >
                    {/* Channel */}
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-800 truncate max-w-[140px]" title={getChannelName(msg)}>
                        {getChannelName(msg)}
                      </div>
                    </td>

                    {/* Date */}
                    <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                      {formatDate(msg.date)}
                    </td>

                    {/* Sender */}
                    <td className="px-4 py-3">
                      <span className="text-slate-700 font-medium text-xs truncate block max-w-[100px]" title={msg.sender}>
                        {msg.sender || 'Anonymous'}
                      </span>
                    </td>

                    {/* Threat */}
                    <td className="px-4 py-3">
                      <ThreatBadge level={msg.threat_level} />
                    </td>

                    {/* Message text with highlight */}
                    <td className="px-4 py-3 max-w-[440px]">
                      <p className="text-slate-700 text-xs leading-relaxed line-clamp-3 break-words">
                        {highlightText(msg.text || '(no text)', query)}
                      </p>
                    </td>

                    {/* Open channel */}
                    <td className="px-4 py-3">
                      <button
                        title="Open channel detail"
                        onClick={() => window.open(`/channel/${msg.channel_id}`, '_blank')}
                        className="opacity-0 group-hover:opacity-100 transition p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state — no results */}
      {!loading && searched && results.length === 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-3">
          <Search className="w-10 h-10 text-slate-300 mx-auto" />
          <p className="text-slate-700 font-semibold text-base">No messages found</p>
          <p className="text-slate-400 text-sm">
            No messages matched <span className="font-medium text-slate-600">"{query}"</span> across any monitored channel.
          </p>
        </div>
      )}

      {/* Initial state — not searched yet */}
      {!loading && !searched && (
        <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-12 text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto">
            <Search className="w-7 h-7 text-blue-500" />
          </div>
          <p className="text-slate-700 font-semibold text-base">Start typing to search</p>
          <p className="text-slate-400 text-sm max-w-md mx-auto">
            Results from <span className="font-medium text-slate-600">all monitored Telegram channels</span> will appear here in real-time as you type.
          </p>
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            {['CVE-2024', 'ransomware', 'leaked', 'bitcoin', 'shell'].map(hint => (
              <button
                key={hint}
                onClick={() => setQuery(hint)}
                className="px-3 py-1.5 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-600 text-xs font-semibold rounded-full border border-slate-200 hover:border-blue-300 transition"
              >
                {hint}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default GlobalSearchPage;
