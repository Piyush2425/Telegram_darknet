import React, { useEffect, useState } from 'react';
import { PlayCircle, Terminal, Radio, Eye, Trash2, ArrowRight, CheckSquare, Square, RefreshCw, Plus } from 'lucide-react';
import { getChannels, toggleChannelMonitoring, startScraping, getScraperStatus, deleteChannel, scrapeSingleChannel, syncTelegramChannels } from '../services/api';
import { Channel, ScraperStatus } from '../types';

export const ScrapingPage: React.FC = () => {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [status, setStatus] = useState<ScraperStatus>({ is_scraping: false, progress: 0, current_channel: '', logs: [], scrape_queue: [], completed_channels: [], total_channels_count: 0 });
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    loadChannels();
    const interval = setInterval(checkStatus, 1500);
    return () => clearInterval(interval);
  }, []);

  const loadChannels = async () => {
    try {
      const data = await getChannels();
      setChannels(data);
    } catch (e) {
      console.error(e);
    }
  };

  const checkStatus = async () => {
    try {
      const st = await getScraperStatus();
      setStatus(st);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSyncAccount = async () => {
    setSyncing(true);
    try {
      const res = await syncTelegramChannels();
      setChannels(res.channels);
    } catch (e) {
      console.error(e);
    } finally {
      setSyncing(false);
    }
  };

  const handleToggle = async (id: string) => {
    const res = await toggleChannelMonitoring(id);
    setChannels(prev => prev.map(c => c.id === id ? { ...c, is_monitored: res.is_monitored } : c));
  };

  const handleToggleAll = async () => {
    const allSelected = channels.every(c => c.is_monitored);
    for (const c of channels) {
      if (c.is_monitored === allSelected) {
        await toggleChannelMonitoring(c.id);
      }
    }
    loadChannels();
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteChannel(id);
      setChannels(prev => prev.filter(c => c.id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  const handleSingleScrape = async (id: string) => {
    try {
      await scrapeSingleChannel(id);
    } catch (e) {
      console.error(e);
    }
  };

  const handleStartScrape = async () => {
    setLoading(true);
    try {
      await startScraping();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const monitoredList = channels.filter(c => c.is_monitored);
  const allSelected = channels.length > 0 && channels.every(c => c.is_monitored);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Radio className="w-5 h-5 text-cyan-400" />
            Telegram Channel & Scraper Management
          </h2>
          <p className="text-xs text-slate-400">Manage real Telegram channels from your account, toggle monitoring, and run scraping jobs.</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSyncAccount}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 font-bold text-xs rounded-xl transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Syncing...' : 'Sync Account Channels'}
          </button>

          <button
            onClick={handleStartScrape}
            disabled={status.is_scraping || monitoredList.length === 0}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition-all shadow-lg ${
              status.is_scraping || monitoredList.length === 0
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-cyan-500/25'
            }`}
          >
            <PlayCircle className={`w-4 h-4 ${status.is_scraping ? 'animate-spin' : ''}`} />
            {status.is_scraping ? `Scraping (${status.progress}%)...` : 'Scrape Selected'}
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      {status.is_scraping && (
        <div className="glass-card p-5 rounded-2xl border border-amber-500/30 bg-amber-500/5 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-amber-400">
            <span>Scraping Active: {status.current_channel}</span>
            <span>{status.progress}% Complete</span>
          </div>
          <div className="w-full h-2.5 bg-darkBg rounded-full overflow-hidden border border-white/10">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-emerald-400 transition-all duration-300"
              style={{ width: `${status.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* CHANNEL MANAGEMENT TABLE (EXACT USER DESIGN) */}
      <div className="glass-card rounded-2xl border border-darkBorder overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-darkCard/80 border-b border-darkBorder text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-4 px-4 w-12 text-center">
                  <button onClick={handleToggleAll} className="text-cyan-400 hover:text-cyan-300">
                    {allSelected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                  </button>
                </th>
                <th className="py-4 px-3 w-16 text-center">AVATAR</th>
                <th className="py-4 px-4">CHANNEL NAME</th>
                <th className="py-4 px-4">USERNAME</th>
                <th className="py-4 px-4">TYPE</th>
                <th className="py-4 px-4 text-center">MESSAGES</th>
                <th className="py-4 px-4 text-center">STATUS</th>
                <th className="py-4 px-4 text-right pr-6">ACTIONS</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-darkBorder/60 text-xs">
              {channels.map((ch) => (
                <tr key={ch.id} className="hover:bg-darkCard/40 transition-colors group">
                  {/* Select Checkbox */}
                  <td className="py-4 px-4 text-center">
                    <button onClick={() => handleToggle(ch.id)} className="text-cyan-400 hover:text-cyan-300">
                      {ch.is_monitored ? <CheckSquare className="w-4 h-4 text-cyan-400" /> : <Square className="w-4 h-4 text-slate-600" />}
                    </button>
                  </td>

                  {/* Avatar Icon */}
                  <td className="py-4 px-3 text-center">
                    <div className="w-9 h-9 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center mx-auto">
                      <Eye className="w-4 h-4" />
                    </div>
                  </td>

                  {/* Channel Name & ID */}
                  <td className="py-4 px-4">
                    <div className="font-bold text-white text-sm">{ch.title}</div>
                    <div className="text-[10px] text-slate-500 font-mono">ID: {ch.id}</div>
                  </td>

                  {/* Username */}
                  <td className="py-4 px-4 font-mono text-cyan-400 font-medium">
                    {ch.username}
                  </td>

                  {/* Type */}
                  <td className="py-4 px-4 text-slate-300 font-medium">
                    {ch.type || ch.category || 'Channel'}
                  </td>

                  {/* Messages Count */}
                  <td className="py-4 px-4 text-center font-bold text-white">
                    {ch.message_count ?? 0}
                  </td>

                  {/* Status */}
                  <td className="py-4 px-4 text-center">
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                      ch.status === 'scraping' 
                        ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse'
                        : 'bg-slate-800 text-slate-400'
                    }`}>
                      {ch.status || 'idle'}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="py-4 px-4 text-right pr-6 space-x-2">
                    <button
                      onClick={() => handleSingleScrape(ch.id)}
                      disabled={status.is_scraping}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold text-[11px] transition-all"
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                      Scrape
                    </button>

                    <button
                      onClick={() => handleDelete(ch.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 font-bold text-[11px] transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  </td>
                </tr>
              ))}

              {channels.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-500 text-xs">
                    No channels available. Click "Sync Account Channels" to import all real channels from your Telegram account!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Terminal Feed */}
      <div className="glass-card p-5 rounded-2xl border border-darkBorder flex flex-col h-[280px]">
        <div className="flex items-center justify-between pb-3 border-b border-darkBorder mb-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
            <Terminal className="w-4 h-4 text-emerald-400" />
            Live Scraper Terminal Output Log
          </div>
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        </div>

        <div className="flex-1 bg-darkBg/90 rounded-xl p-4 font-mono text-[11px] text-emerald-400 overflow-y-auto space-y-1 border border-white/5">
          {status.logs.map((log, idx) => (
            <div key={idx} className="leading-relaxed">
              {log}
            </div>
          ))}
          {status.logs.length === 0 && (
            <div className="text-slate-600 italic">Terminal log standing by...</div>
          )}
        </div>
      </div>
    </div>
  );
};
