import React, { useEffect, useState, useRef } from 'react';
import { Shield, Radio, RefreshCw, Eye, Trash2, ArrowRight, CheckSquare, Square, Terminal, PlayCircle, MessageSquare, Briefcase, FileText, Search, MoreVertical } from 'lucide-react';
import { getChannels, getMessages, toggleChannelMonitoring, startScraping, getScraperStatus, deleteChannel, scrapeSingleChannel, syncTelegramChannels, getMessageCount } from '../services/api';
import { Channel, Message, ScraperStatus } from '../types';

export const DashboardPage: React.FC = () => {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgCount, setMsgCount] = useState<{ total: number; total_on_disk: number; per_channel_on_disk: Record<string, number> }>({ total: 0, total_on_disk: 0, per_channel_on_disk: {} });
  const [status, setStatus] = useState<ScraperStatus>({ is_scraping: false, progress: 0, current_channel: '', logs: [], scrape_queue: [], completed_channels: [], total_channels_count: 0 });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const logsContainerRef = useRef<HTMLDivElement>(null);
  const channelsContainerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll logs to bottom
  useEffect(() => {
    if (logsContainerRef.current) {
      logsContainerRef.current.scrollTop = logsContainerRef.current.scrollHeight;
    }
  }, [status.logs]);

  // Auto-scroll channels to bottom
  useEffect(() => {
    if (channelsContainerRef.current) {
      channelsContainerRef.current.scrollTop = channelsContainerRef.current.scrollHeight;
    }
  }, [status.completed_channels, status.current_channel]);

  // Search, Filter & Sort states
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'GROUPS' | 'CHANNELS'>('ALL');
  const [sortBy, setSortBy] = useState<'LATEST' | 'MESSAGES' | 'NAME'>('LATEST');

  const fetchData = async () => {
    try {
      const [chData, msgData, countData] = await Promise.all([
        getChannels(),
        getMessages(),
        getMessageCount(),
      ]);
      setChannels(chData);
      setMessages(msgData);
      setMsgCount(countData);
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

        {/* Card 2 — Total Messages */}
        <div className="glass-card p-5 rounded-xl flex items-center justify-between border border-darkBorder bg-darkCard">
          <div className="space-y-1">
            <div className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Total Messages</div>
            <div className="text-2xl font-bold text-slate-800">
              {msgCount.total_on_disk > 0 ? msgCount.total_on_disk.toLocaleString() : messages.length.toLocaleString()}
            </div>
            <div className="text-[10px] text-slate-400 font-medium">
              {msgCount.total_on_disk > 0
                ? `${msgCount.total.toLocaleString()} across ${Object.keys(msgCount.per_channel_on_disk).length} channels`
                : 'Messages Scraped'}
            </div>
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

      {/* Scraping Progress Tracker Panel */}
      {(status.is_scraping || (status.total_channels_count > 0 && status.completed_channels.length === status.total_channels_count && status.total_channels_count > 0)) && (
        <div className="bg-white border border-blue-200 rounded-2xl shadow-sm overflow-hidden grid grid-cols-1 md:grid-cols-2 mb-5 md:h-[300px]">
          
          {/* Left Column: Channels Progress List */}
          <div className="border-r border-slate-200 flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 bg-blue-50 border-b border-blue-200 shrink-0">
              <div className="flex items-center gap-2">
                {status.is_scraping ? (
                  <span className="flex items-center gap-1.5 text-blue-700 text-xs font-bold">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse inline-block" />
                    Scraping in Progress
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-emerald-700 text-xs font-bold">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                    ✓ All Channels Scraped!
                  </span>
                )}
                <span className="text-xs text-slate-500 font-medium">
                  {status.completed_channels.length} / {status.total_channels_count} complete
                </span>
              </div>
              <span className="text-xs font-bold text-blue-700">{status.progress}%</span>
            </div>

            {/* Progress bar */}
            <div className="w-full h-1.5 bg-slate-100 shrink-0">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-500"
                style={{ width: `${status.progress}%` }}
              />
            </div>

            {/* Channel list */}
            <div ref={channelsContainerRef} className="px-5 py-3 space-y-1.5 overflow-y-auto flex-1 bg-slate-50/20">
              {/* Completed channels */}
              {status.completed_channels.map((name) => (
                <div key={`done-${name}`} className="flex items-center gap-2.5 py-1">
                  <span className="w-5 h-5 rounded-full bg-emerald-100 border border-emerald-300 flex items-center justify-center shrink-0">
                    <svg className="w-3 h-3 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                  <span className="text-xs font-semibold text-slate-500 line-through">{name}</span>
                  <span className="ml-auto text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">Done</span>
                </div>
              ))}

              {/* Currently scraping */}
              {status.is_scraping && status.current_channel && (
                <div className="flex items-center gap-2.5 py-1">
                  <span className="w-5 h-5 rounded-full bg-blue-100 border border-blue-300 flex items-center justify-center shrink-0">
                    <svg className="w-3 h-3 text-blue-600 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </span>
                  <span className="text-xs font-bold text-blue-800">{status.current_channel}</span>
                  <span className="ml-auto text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full animate-pulse">Scraping...</span>
                </div>
              )}

              {/* Queue — channels not yet started */}
              {status.scrape_queue.map((name) => (
                <div key={`queue-${name}`} className="flex items-center gap-2.5 py-1">
                  <span className="w-5 h-5 rounded-full bg-slate-100 border border-slate-300 flex items-center justify-center shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                  </span>
                  <span className="text-xs font-medium text-slate-400">{name}</span>
                  <span className="ml-auto text-[10px] font-bold text-slate-500 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full">Queued</span>
                </div>
              ))}

              {/* All done banner */}
              {!status.is_scraping && status.total_channels_count > 0 && status.completed_channels.length === status.total_channels_count && (
                <div className="text-center py-2 text-xs font-bold text-emerald-700">
                  🎉 All {status.total_channels_count} channels scraped successfully.
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Scraper Logs */}
          <div className="flex flex-col border-t md:border-t-0 md:border-l border-slate-200 h-full overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-200 shrink-0">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
                <Terminal className="w-4 h-4 text-emerald-600" />
                Live Scraper Terminal Output Logs
              </div>
              <span className={`w-2.5 h-2.5 rounded-full bg-emerald-500 ${status.is_scraping ? 'animate-pulse' : ''}`} />
            </div>

            {/* Logs Body */}
            <div ref={logsContainerRef} className="flex-1 bg-slate-900 p-4 font-mono text-[9px] text-emerald-400 overflow-y-auto space-y-1 shadow-inner select-all leading-normal">
              {status.logs.map((log, idx) => (
                <div key={idx} className="break-all whitespace-pre-wrap">
                  {log}
                </div>
              ))}
              {status.logs.length === 0 && (
                <div className="text-slate-500 italic">Terminal log standing by...</div>
              )}
            </div>
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
                  <td className="py-4 px-4 text-center text-slate-500 font-mono text-[10px]">
                    {ch.status === 'scraping' 
                      ? <span className="text-amber-600 font-bold animate-pulse">Active</span> 
                      : ch.last_scraped_at 
                        ? new Date(ch.last_scraped_at).toLocaleString('en-IN', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                            hour12: false
                          }) 
                        : 'Never'}
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


    </div>
  );
};
