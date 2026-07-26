import React, { useEffect, useState } from 'react';
import { Shield, Radio, RefreshCw, Eye, Trash2, ArrowRight, CheckSquare, Square, Terminal, PlayCircle, MessageSquare, Briefcase, FileText, Search, MoreVertical } from 'lucide-react';
import { getChannels, getMessages, toggleChannelMonitoring, startScraping, getScraperStatus, deleteChannel, scrapeSingleChannel, syncTelegramChannels } from '../services/api';
import { Channel, Message, ScraperStatus } from '../types';

export const DashboardPage: React.FC = () => {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<ScraperStatus>({ is_scraping: false, progress: 0, current_channel: '', logs: [] });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // Search, Filter & Sort states
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'GROUPS' | 'CHANNELS'>('ALL');
  const [sortBy, setSortBy] = useState<'LATEST' | 'MESSAGES' | 'NAME'>('LATEST');

  const fetchData = async () => {
    try {
      const [chData, msgData] = await Promise.all([
        getChannels(),
        getMessages()
      ]);
      setChannels(chData);
      setMessages(msgData);
    } catch (e) {
      console.error("Dashboard fetch error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const st = await getScraperStatus();
        setStatus(st);
        
        // Auto-refresh messages and channels in real-time
        await fetchData();
      } catch (e) {
        console.error(e);
      }
    }, 1500);
    return () => clearInterval(interval);
  }, []);

  const handleSyncAccount = async () => {
    setSyncing(true);
    try {
      const res = await syncTelegramChannels();
      setChannels(res.channels);
      await fetchData();
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
    fetchData();
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
    try {
      await startScraping();
    } catch (e) {
      console.error(e);
    }
  };

  const openChannelInNewTab = (channelId: string) => {
    window.open(`/channel/${channelId}`, '_blank');
  };

  const monitoredList = channels.filter(c => c.is_monitored);
  const allSelected = channels.length > 0 && channels.every(c => c.is_monitored);

  // Filter channels based on search and selected tab
  const filteredChannels = channels.filter(ch => {
    const matchesSearch = ch.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          ch.username.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (filterType === 'GROUPS') {
      return matchesSearch && (ch.type === 'Group' || ch.type === 'Supergroup');
    }
    if (filterType === 'CHANNELS') {
      return matchesSearch && ch.type === 'Channel';
    }
    return matchesSearch;
  });

  // Sort channels
  const sortedChannels = [...filteredChannels].sort((a, b) => {
    if (sortBy === 'MESSAGES') {
      return (b.message_count || 0) - (a.message_count || 0);
    }
    if (sortBy === 'NAME') {
      return a.title.localeCompare(b.title);
    }
    // Default / Latest activity (based on message counts or ID sorting)
    return b.id.localeCompare(a.id);
  });

  return (
    <div className="space-y-5 w-full relative">
      {/* Overview Dashboard Header block */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Overview Dashboard</h2>
          <p className="text-xs text-slate-500">Real-time Telegram Channel Monitoring</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSyncAccount}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-darkBorder hover:border-slate-400 text-slate-600 hover:text-slate-800 text-xs font-bold rounded-lg transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
            Sync Channels
          </button>
          
          <button
            onClick={handleStartScrape}
            disabled={status.is_scraping || monitoredList.length === 0}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-all shadow-md shadow-blue-600/10"
          >
            <PlayCircle className="w-3.5 h-3.5" />
            Scrape Selected
          </button>
        </div>
      </div>

      {/* Metrics Row (Matching 4 premium cards in screenshot) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1 */}
        <div className="glass-card p-5 rounded-xl flex items-center justify-between border border-darkBorder bg-darkCard">
          <div className="space-y-1">
            <div className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Channels Monitored</div>
            <div className="text-2xl font-bold text-slate-800">{monitoredList.length}</div>
            <div className="text-[10px] text-slate-400 font-medium">Total Channels: {channels.length}</div>
          </div>
          <div className="w-11 h-11 rounded-lg bg-cyan-500/10 text-cyan-600 flex items-center justify-center border border-cyan-500/20">
            <Radio className="w-5 h-5 animate-pulse" />
          </div>
        </div>

        {/* Card 2 */}
        <div className="glass-card p-5 rounded-xl flex items-center justify-between border border-darkBorder bg-darkCard">
          <div className="space-y-1">
            <div className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Total Messages</div>
            <div className="text-2xl font-bold text-slate-800">{messages.length}</div>
            <div className="text-[10px] text-slate-400 font-medium">Messages Scraped</div>
          </div>
          <div className="w-11 h-11 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center border border-blue-500/20">
            <MessageSquare className="w-5 h-5" />
          </div>
        </div>

        {/* Card 3 */}
        <div className="glass-card p-5 rounded-xl flex items-center justify-between border border-darkBorder bg-darkCard">
          <div className="space-y-1">
            <div className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Active Jobs</div>
            <div className="text-2xl font-bold text-slate-800">{status.is_scraping ? '1' : '0'}</div>
            <div className="text-[10px] text-slate-400 font-medium">{status.is_scraping ? 'Running Now' : 'Standby'}</div>
          </div>
          <div className="w-11 h-11 rounded-lg bg-purple-500/10 text-purple-600 flex items-center justify-center border border-purple-500/20">
            <Briefcase className="w-5 h-5" />
          </div>
        </div>

        {/* Card 4 */}
        <div className="glass-card p-5 rounded-xl flex items-center justify-between border border-darkBorder bg-darkCard">
          <div className="space-y-1">
            <div className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Reports Generated</div>
            <div className="text-2xl font-bold text-slate-800">4</div>
            <div className="text-[10px] text-slate-400 font-medium">Today</div>
          </div>
          <div className="w-11 h-11 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center border border-emerald-500/20">
            <FileText className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      {status.is_scraping && (
        <div className="glass-card p-5 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-amber-400">
            <span>Scraping Active: {status.current_channel}</span>
            <span>{status.progress}% Complete</span>
          </div>
          <div className="w-full h-2 bg-darkBg rounded-full overflow-hidden border border-white/10">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-300"
              style={{ width: `${status.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Filter and search bar row matching screenshot */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-darkCard p-3 rounded-xl border border-darkBorder">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Search Channel..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-darkBg text-xs text-slate-800 pl-10 pr-4 py-2.5 rounded-lg border border-darkBorder focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Filters and Sorts */}
        <div className="flex items-center gap-4 w-full md:w-auto justify-end">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span>Filter:</span>
            <div className="flex bg-darkBg rounded-lg p-0.5 border border-darkBorder">
              <button
                onClick={() => setFilterType('ALL')}
                className={`px-3 py-1 rounded-md transition-all font-bold ${
                  filterType === 'ALL' ? 'bg-blue-600/10 text-blue-600 border border-blue-500/20' : 'hover:text-slate-800'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilterType('GROUPS')}
                className={`px-3 py-1 rounded-md transition-all font-bold ${
                  filterType === 'GROUPS' ? 'bg-blue-600/10 text-blue-600 border border-blue-500/20' : 'hover:text-slate-800'
                }`}
              >
                Groups
              </button>
              <button
                onClick={() => setFilterType('CHANNELS')}
                className={`px-3 py-1 rounded-md transition-all font-bold ${
                  filterType === 'CHANNELS' ? 'bg-blue-600/10 text-blue-600 border border-blue-500/20' : 'hover:text-slate-800'
                }`}
              >
                Channels
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Sort by:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-darkBg text-xs text-slate-700 px-3 py-1.5 rounded-lg border border-darkBorder focus:outline-none cursor-pointer font-bold"
            >
              <option value="LATEST">Latest Activity</option>
              <option value="MESSAGES">Messages Count</option>
              <option value="NAME">Name Alphabetical</option>
            </select>
          </div>
        </div>
      </div>

      {/* CHANNELS DATA TABLE */}
      <div className="glass-card rounded-xl border border-darkBorder overflow-hidden shadow-sm bg-darkCard">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-100/90 border-b border-darkBorder text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                <th className="py-4 px-4 w-12 text-center">
                  <button onClick={handleToggleAll} className="text-blue-500 hover:text-blue-400">
                    {allSelected ? <CheckSquare className="w-4 h-4 text-blue-500" /> : <Square className="w-4 h-4 text-slate-600" />}
                  </button>
                </th>
                <th className="py-4 px-3 w-16 text-center">Avatar</th>
                <th className="py-4 px-4">Channel Name</th>
                <th className="py-4 px-4">Username</th>
                <th className="py-4 px-4">Type</th>
                <th className="py-4 px-4 text-center">Messages</th>
                <th className="py-4 px-4 text-center">Last Scraped</th>
                <th className="py-4 px-4 text-center">Status</th>
                <th className="py-4 px-4 text-right pr-6">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-darkBorder/60 text-xs text-slate-700">
              {sortedChannels.map((ch) => (
                <tr key={ch.id} className="hover:bg-slate-50 transition-colors group">
                  {/* Select Checkbox */}
                  <td className="py-4 px-4 text-center">
                    <button onClick={() => handleToggle(ch.id)} className="text-blue-500 hover:text-blue-400">
                      {ch.is_monitored ? <CheckSquare className="w-4 h-4 text-blue-500" /> : <Square className="w-4 h-4 text-slate-400" />}
                    </button>
                  </td>

                  {/* Avatar Icon */}
                  <td className="py-4 px-3 text-center" onClick={() => openChannelInNewTab(ch.id)}>
                    <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-slate-200 to-slate-300 border border-slate-300 text-slate-700 flex items-center justify-center mx-auto cursor-pointer font-bold text-[10px]">
                      {ch.title.substring(0, 2).toUpperCase()}
                    </div>
                  </td>

                  {/* Channel Name & ID */}
                  <td className="py-4 px-4 cursor-pointer" onClick={() => openChannelInNewTab(ch.id)}>
                    <div className="font-bold text-slate-800 text-sm group-hover:text-blue-600 transition-colors">{ch.title}</div>
                    <div className="text-[10px] text-slate-500 font-mono">ID: {ch.id}</div>
                  </td>

                  {/* Username Link */}
                  <td className="py-4 px-4 font-mono text-blue-600 font-bold hover:underline cursor-pointer" onClick={() => openChannelInNewTab(ch.id)}>
                    {ch.username}
                  </td>

                  {/* Type */}
                  <td className="py-4 px-4 text-slate-600 font-medium">
                    {ch.type || ch.category || 'Channel'}
                  </td>

                  {/* Messages Count */}
                  <td className="py-4 px-4 text-center font-bold text-slate-800">
                    {ch.message_count ?? 0}
                  </td>

                  {/* Last Scraped Duration */}
                  <td className="py-4 px-4 text-center text-slate-500">
                    {ch.status === 'scraping' ? 'Active' : '15 min ago'}
                  </td>

                  {/* Status Indicator Badges matching screenshot */}
                  <td className="py-4 px-4 text-center">
                    {ch.status === 'scraping' ? (
                      <span className="inline-block px-3 py-1 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20">
                        🟡 Scraping
                        <span className="block text-[8px] opacity-75 font-normal">Auto every 30 min</span>
                      </span>
                    ) : ch.is_auto_monitoring ? (
                      <span className="inline-block px-3 py-1 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                        🟢 Monitoring
                        <span className="block text-[8px] opacity-75 font-normal">Auto every {ch.monitoring_interval_value} min</span>
                      </span>
                    ) : (
                      <span className="inline-block px-3 py-1 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                        ⚪ Idle
                        <span className="block text-[8px] opacity-75 font-normal">Manual Scrape</span>
                      </span>
                    )}
                  </td>

                  {/* Actions Scrape / Delete */}
                  <td className="py-4 px-4 text-right pr-6 space-x-2">
                    <button
                      onClick={() => handleSingleScrape(ch.id)}
                      disabled={status.is_scraping}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600/10 hover:bg-blue-600/20 text-blue-600 border border-blue-500/30 font-bold text-[11px] transition-all"
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                      Scrape
                    </button>

                    <button
                      onClick={() => handleDelete(ch.id)}
                      className="inline-flex items-center gap-1.5 p-1.5 rounded-lg text-slate-500 hover:text-slate-800"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}

              {channels.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500 text-xs">
                    No channels linked yet. Connect your account in Settings and click "Sync Channels"!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Terminal Output Log */}
      <div className="glass-card p-5 rounded-xl border border-darkBorder flex flex-col h-[280px]">
        <div className="flex items-center justify-between pb-3 border-b border-darkBorder mb-3">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <Terminal className="w-4 h-4 text-emerald-600" />
            Live Scraper Terminal Output Log
          </div>
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
        </div>

        <div className="flex-1 bg-slate-900 rounded-lg p-4 font-mono text-[11px] text-emerald-400 overflow-y-auto space-y-1 border border-slate-800 shadow-inner">
          {status.logs.map((log, idx) => (
            <div key={idx} className="leading-relaxed">
              {log}
            </div>
          ))}
          {status.logs.length === 0 && (
            <div className="text-slate-500 italic">Terminal log standing by...</div>
          )}
        </div>
      </div>
    </div>
  );
};
