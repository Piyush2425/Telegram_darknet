import React, { useEffect, useState, useRef } from 'react';
import { 
  Shield, Radio, RefreshCw, Eye, Trash2, ArrowRight, CheckSquare, Square, 
  Terminal, PlayCircle, MessageSquare, Briefcase, FileText, Search, MoreVertical,
  Calendar, TrendingUp, BarChart3, Clock, AlertTriangle, Layers, ChevronRight,
  CheckCircle2, Sparkles, Filter, ExternalLink
} from 'lucide-react';
import { 
  getChannels, getMessages, toggleChannelMonitoring, startScraping, 
  getScraperStatus, deleteChannel, scrapeSingleChannel, syncTelegramChannels, 
  getMessageCount, getDailyMessageStats 
} from '../services/api';
import { Channel, Message, ScraperStatus, DailyStatsResponse, DailyStatItem } from '../types';

export const DashboardPage: React.FC = () => {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgCount, setMsgCount] = useState<{ total: number; total_on_disk: number; per_channel_on_disk: Record<string, number> }>({ total: 0, total_on_disk: 0, per_channel_on_disk: {} });
  const [dailyStats, setDailyStats] = useState<DailyStatsResponse | null>(null);
  const [status, setStatus] = useState<ScraperStatus>({ is_scraping: false, progress: 0, current_channel: '', logs: [], scrape_queue: [], completed_channels: [], total_channels_count: 0 });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  // Daily Telemetry UI state
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [dailyViewMode, setDailyViewMode] = useState<'chart' | 'table'>('chart');
  const [dailySearchQuery, setDailySearchQuery] = useState('');

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

  // Search, Filter & Sort states for Channels
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'GROUPS' | 'CHANNELS'>('ALL');
  const [sortBy, setSortBy] = useState<'LATEST' | 'MESSAGES' | 'NAME'>('LATEST');

  const fetchData = async () => {
    try {
      const [chData, msgData, countData, dailyData] = await Promise.all([
        getChannels(),
        getMessages(),
        getMessageCount(),
        getDailyMessageStats().catch(() => null),
      ]);
      setChannels(chData);
      setMessages(msgData);
      setMsgCount(countData);
      if (dailyData) {
        setDailyStats(dailyData);
      }
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
    const eventSource = new EventSource('/api/scraper/stream');
    let wasScraping = false;

    eventSource.onmessage = (event) => {
      try {
        const st = JSON.parse(event.data);
        setStatus(st);
        
        // If scraping just finished, refresh metrics once
        if (wasScraping && !st.is_scraping) {
          fetchData();
        }
        wasScraping = st.is_scraping;
      } catch (err) {
        console.error("SSE parse error:", err);
      }
    };

    eventSource.onerror = (err) => {
      console.warn("SSE connection interrupted, EventSource will automatically reconnect.", err);
    };

    return () => {
      eventSource.close();
    };
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
    return b.id.localeCompare(a.id);
  });

  // Calculate max daily count for chart scaling
  const maxDayCount = dailyStats && dailyStats.daily_stats.length > 0 
    ? Math.max(...dailyStats.daily_stats.map(d => d.count), 1)
    : 1;

  // Filtered daily list
  const filteredDailyStats = dailyStats?.daily_stats.filter(item => {
    if (!dailySearchQuery) return true;
    const q = dailySearchQuery.toLowerCase();
    return item.formatted_date.toLowerCase().includes(q) || 
           item.date.includes(q) ||
           item.display_day.toLowerCase().includes(q) ||
           item.top_channels.some(c => c.title.toLowerCase().includes(q));
  }) || [];

  const selectedDayItem = dailyStats?.daily_stats.find(d => d.date === selectedDay);

  return (
    <div className="space-y-6 w-full relative">
      {/* Overview Dashboard Header block */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            Overview Dashboard
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-600 border border-blue-500/20">
              Live CTI Telemetry
            </span>
          </h2>
          <p className="text-xs text-slate-500">Real-time Telegram Channel Monitoring & Daily Threat Volume</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSyncAccount}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-darkBorder hover:border-slate-400 text-slate-600 hover:text-slate-800 text-xs font-bold rounded-lg transition-all shadow-sm"
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

      {/* Metrics Row (4 premium cards with 1-day scraped volume showcase) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1 — Monitored Channels */}
        <div className="glass-card p-5 rounded-xl flex items-center justify-between border border-darkBorder bg-darkCard shadow-sm hover:border-slate-300 transition-all">
          <div className="space-y-1">
            <div className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Channels Monitored</div>
            <div className="text-2xl font-bold text-slate-800">{monitoredList.length}</div>
            <div className="text-[10px] text-slate-400 font-medium">Total Linked: {channels.length}</div>
          </div>
          <div className="w-11 h-11 rounded-lg bg-cyan-500/10 text-cyan-600 flex items-center justify-center border border-cyan-500/20 shadow-sm">
            <Radio className="w-5 h-5 animate-pulse" />
          </div>
        </div>

        {/* Card 2 — Total Scraped Messages */}
        <div className="glass-card p-5 rounded-xl flex items-center justify-between border border-darkBorder bg-darkCard shadow-sm hover:border-slate-300 transition-all">
          <div className="space-y-1">
            <div className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Total Messages</div>
            <div className="text-2xl font-bold text-slate-800">
              {msgCount.total_on_disk > 0 ? msgCount.total_on_disk.toLocaleString() : (dailyStats?.total_messages || messages.length).toLocaleString()}
            </div>
            <div className="text-[10px] text-slate-400 font-medium">
              {msgCount.total_on_disk > 0
                ? `${msgCount.total.toLocaleString()} across ${Object.keys(msgCount.per_channel_on_disk).length} channels`
                : `${messages.length} indexed messages`}
            </div>
          </div>
          <div className="w-11 h-11 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center border border-blue-500/20 shadow-sm">
            <MessageSquare className="w-5 h-5" />
          </div>
        </div>

        {/* Card 3 — 1-Day Scraped Volume (Today's Telemetry) */}
        <div className="glass-card p-5 rounded-xl flex items-center justify-between border border-darkBorder bg-darkCard shadow-sm hover:border-slate-300 transition-all">
          <div className="space-y-1">
            <div className="text-[11px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
              <span>Today's Scraped</span>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
            </div>
            <div className="text-2xl font-bold text-emerald-600">
              {dailyStats ? dailyStats.today_count.toLocaleString() : '0'}
            </div>
            <div className="text-[10px] text-slate-500 font-medium flex items-center gap-1">
              <Clock className="w-3 h-3 text-slate-400" />
              <span>Yesterday: <strong className="text-slate-700">{dailyStats?.yesterday_count ?? 0}</strong></span>
              {dailyStats && dailyStats.today_count > 0 && (
                <span className="text-emerald-600 font-bold ml-1">
                  (1-Day Active)
                </span>
              )}
            </div>
          </div>
          <div className="w-11 h-11 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center border border-emerald-500/20 shadow-sm">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        {/* Card 4 — Active Scraper Jobs / Status */}
        <div className="glass-card p-5 rounded-xl flex items-center justify-between border border-darkBorder bg-darkCard shadow-sm hover:border-slate-300 transition-all">
          <div className="space-y-1">
            <div className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Scraper Engine</div>
            <div className="text-2xl font-bold text-slate-800">{status.is_scraping ? '1 Active' : 'Standby'}</div>
            <div className="text-[10px] text-slate-400 font-medium">
              {status.is_scraping ? `Scraping ${status.current_channel || 'channels'}...` : 'Ready to Scrape'}
            </div>
          </div>
          <div className="w-11 h-11 rounded-lg bg-purple-500/10 text-purple-600 flex items-center justify-center border border-purple-500/20 shadow-sm">
            <Briefcase className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 📅 DAILY MESSAGES SCRAPED TELEMETRY SECTION */}
      <div className="bg-darkCard rounded-2xl border border-darkBorder p-5 space-y-4 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-darkBorder/60 pb-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-800">Daily Messages Scraped Telemetry</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-600 border border-indigo-200">
                {dailyStats?.days_recorded || 0} Recorded Days
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Breakdown of scraped Telegram messages across dates (e.g., 20th Aug, 19th Aug) with threat classification
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex bg-darkBg rounded-lg p-0.5 border border-darkBorder">
              <button
                onClick={() => setDailyViewMode('chart')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                  dailyViewMode === 'chart' 
                    ? 'bg-blue-600 text-white shadow-sm' 
                    : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5" />
                <span>Visual Graph</span>
              </button>
              <button
                onClick={() => setDailyViewMode('table')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                  dailyViewMode === 'table' 
                    ? 'bg-blue-600 text-white shadow-sm' 
                    : 'text-slate-600 hover:text-slate-800'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Day-by-Day Log</span>
              </button>
            </div>
          </div>
        </div>

        {/* Highlight Peak & Today Summary Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-500">1-Day Scraped Volume (Today)</div>
              <div className="text-base font-bold text-slate-800">{dailyStats?.today_count ?? 0} Messages</div>
              <div className="text-[10px] text-slate-400">{dailyStats?.today_formatted || 'Today'}</div>
            </div>
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs">
              1D
            </div>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-500">Peak Scraping Day</div>
              <div className="text-base font-bold text-purple-700">
                {dailyStats?.peak_day ? `${dailyStats.peak_day.count} Messages` : 'N/A'}
              </div>
              <div className="text-[10px] text-slate-400">
                {dailyStats?.peak_day?.formatted_date || 'No history recorded'}
              </div>
            </div>
            <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>

          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase font-bold text-slate-500">Avg Scrape per Active Day</div>
              <div className="text-base font-bold text-emerald-700">
                {dailyStats && dailyStats.days_recorded > 0 
                  ? Math.round(dailyStats.total_messages / dailyStats.days_recorded)
                  : 0} Messages / Day
              </div>
              <div className="text-[10px] text-slate-400">Calculated across monitored partition dates</div>
            </div>
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
        </div>

        {/* VISUAL CHART VIEW */}
        {dailyViewMode === 'chart' && (
          <div className="space-y-3 pt-2">
            {filteredDailyStats.length === 0 ? (
              <div className="py-8 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200 text-xs text-slate-500">
                <Calendar className="w-6 h-6 text-slate-400 mx-auto mb-1.5 opacity-60" />
                No daily scrape telemetry recorded yet. Trigger a scrape to populate date-wise metrics.
              </div>
            ) : (
              <div className="space-y-2">
                {/* Horizontal / Bar representation of daily messages */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredDailyStats.map((item) => {
                    const isSelected = selectedDay === item.date;
                    const percent = Math.max(8, Math.round((item.count / maxDayCount) * 100));
                    
                    return (
                      <div
                        key={item.date}
                        onClick={() => setSelectedDay(isSelected ? null : item.date)}
                        className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                          isSelected 
                            ? 'bg-blue-50/50 border-blue-400 shadow-sm ring-1 ring-blue-400' 
                            : 'bg-white hover:bg-slate-50/80 border-darkBorder'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-slate-800">{item.formatted_date}</span>
                            {item.date === dailyStats?.today_date && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[9px] font-bold">Today</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-slate-900">{item.count.toLocaleString()}</span>
                            <span className="text-[10px] text-slate-400">messages</span>
                          </div>
                        </div>

                        {/* Visual Progress Bar with Threat classification */}
                        <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden flex">
                          <div
                            className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-500"
                            style={{ width: `${percent}%` }}
                          />
                        </div>

                        {/* Breakdown pills below bar */}
                        <div className="flex items-center justify-between mt-2 pt-1 text-[10px]">
                          <div className="flex items-center gap-2 text-slate-500 font-medium">
                            <span>{item.channel_count} Channels</span>
                            <span>•</span>
                            <span className="font-mono text-slate-400">{item.date}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            {item.threat_levels.CRITICAL > 0 && (
                              <span className="px-1.5 py-0.2 rounded bg-rose-100 text-rose-700 font-bold text-[9px]">
                                {item.threat_levels.CRITICAL} Crit
                              </span>
                            )}
                            {item.threat_levels.HIGH > 0 && (
                              <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-700 font-bold text-[9px]">
                                {item.threat_levels.HIGH} High
                              </span>
                            )}
                            {item.threat_levels.LOW > 0 && (
                              <span className="px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 text-[9px]">
                                {item.threat_levels.LOW} Low
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* DAY-BY-DAY TABLE VIEW */}
        {dailyViewMode === 'table' && (
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between gap-3">
              <div className="relative w-72">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter by date (e.g. 20th Aug)..."
                  value={dailySearchQuery}
                  onChange={(e) => setDailySearchQuery(e.target.value)}
                  className="w-full bg-slate-50 text-xs text-slate-800 pl-9 pr-3 py-1.5 rounded-lg border border-darkBorder focus:outline-none focus:border-blue-500 font-medium"
                />
              </div>
              <span className="text-[11px] text-slate-400">
                Showing {filteredDailyStats.length} dates
              </span>
            </div>

            <div className="border border-darkBorder rounded-xl overflow-hidden shadow-inner bg-white">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/90 border-b border-darkBorder text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                    <th className="py-3 px-4">Date / Day</th>
                    <th className="py-3 px-4 text-center">Messages Scraped</th>
                    <th className="py-3 px-4">Threat Classification</th>
                    <th className="py-3 px-4">Active Channels on Day</th>
                    <th className="py-3 px-4 text-right pr-6">Partition File</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-darkBorder/60 text-slate-700">
                  {filteredDailyStats.map((item) => (
                    <tr key={item.date} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-800">{item.formatted_date}</div>
                        <div className="text-[10px] font-mono text-slate-400">{item.date}</div>
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-blue-600 text-sm">
                        {item.count.toLocaleString()}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {item.threat_levels.CRITICAL > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-600 border border-rose-500/20 font-bold text-[10px]">
                              {item.threat_levels.CRITICAL} CRITICAL
                            </span>
                          )}
                          {item.threat_levels.HIGH > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 border border-amber-500/20 font-bold text-[10px]">
                              {item.threat_levels.HIGH} HIGH
                            </span>
                          )}
                          {item.threat_levels.MEDIUM > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 border border-blue-500/20 font-bold text-[10px]">
                              {item.threat_levels.MEDIUM} MED
                            </span>
                          )}
                          {item.threat_levels.LOW > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 text-[10px]">
                              {item.threat_levels.LOW} LOW
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1 flex-wrap">
                          {item.top_channels.slice(0, 2).map(c => (
                            <span key={c.id} className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-medium border border-slate-200">
                              {c.title}: <strong className="text-slate-900">{c.count}</strong>
                            </span>
                          ))}
                          {item.top_channels.length > 2 && (
                            <span className="text-[10px] text-slate-400 font-bold">
                              +{item.top_channels.length - 2} more
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right pr-6 font-mono text-[10px] text-slate-500">
                        messages_{item.date}.csv
                      </td>
                    </tr>
                  ))}
                  {filteredDailyStats.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400 text-xs">
                        No daily scrape records matching filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Selected Day Expanded Detail Card */}
        {selectedDayItem && (
          <div className="mt-3 p-4 bg-blue-50/60 rounded-xl border border-blue-200 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs text-blue-900">
                  Detailed Scrape Telemetry for {selectedDayItem.formatted_date}
                </span>
                <span className="font-mono text-[10px] text-blue-600 bg-white px-2 py-0.5 rounded border border-blue-200">
                  {selectedDayItem.date}
                </span>
              </div>
              <button 
                onClick={() => setSelectedDay(null)}
                className="text-xs text-blue-600 hover:text-blue-800 font-bold"
              >
                Close
              </button>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-xs">
              <div className="bg-white p-2.5 rounded-lg border border-blue-100">
                <div className="text-[10px] text-slate-500 font-medium uppercase">Messages Scraped</div>
                <div className="text-lg font-bold text-slate-800">{selectedDayItem.count}</div>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-blue-100">
                <div className="text-[10px] text-slate-500 font-medium uppercase">Active Channels</div>
                <div className="text-lg font-bold text-slate-800">{selectedDayItem.channel_count}</div>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-blue-100">
                <div className="text-[10px] text-rose-600 font-bold uppercase">Critical & High Threats</div>
                <div className="text-lg font-bold text-rose-600">
                  {selectedDayItem.threat_levels.CRITICAL + selectedDayItem.threat_levels.HIGH}
                </div>
              </div>
              <div className="bg-white p-2.5 rounded-lg border border-blue-100">
                <div className="text-[10px] text-slate-500 font-medium uppercase">Partition CSV</div>
                <div className="text-[11px] font-mono font-bold text-blue-700 truncate">
                  messages_{selectedDayItem.date}.csv
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Scraping Progress Tracker Panel */}
      {(status.is_scraping || (status.total_channels_count > 0 && status.completed_channels.length === status.total_channels_count && status.total_channels_count > 0)) && (
        <div className="bg-white border border-blue-200 rounded-2xl shadow-sm overflow-hidden grid grid-cols-1 md:grid-cols-2 mb-5 md:h-[300px]">
          
          {/* Left Column: Channels Progress List */}
          <div className="border-r border-slate-200 flex flex-col h-full overflow-hidden">
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

              {status.scrape_queue.map((name) => (
                <div key={`queue-${name}`} className="flex items-center gap-2.5 py-1">
                  <span className="w-5 h-5 rounded-full bg-slate-100 border border-slate-300 flex items-center justify-center shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                  </span>
                  <span className="text-xs font-medium text-slate-400">{name}</span>
                  <span className="ml-auto text-[10px] font-bold text-slate-500 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full">Queued</span>
                </div>
              ))}

              {!status.is_scraping && status.total_channels_count > 0 && status.completed_channels.length === status.total_channels_count && (
                <div className="text-center py-2 text-xs font-bold text-emerald-700">
                  🎉 All {status.total_channels_count} channels scraped successfully.
                </div>
              )}
            </div>
          </div>

          {/* Right Column: Scraper Logs */}
          <div className="flex flex-col border-t md:border-t-0 md:border-l border-slate-200 h-full overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 bg-slate-50 border-b border-slate-200 shrink-0">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
                <Terminal className="w-4 h-4 text-emerald-600" />
                Live Scraper Terminal Output Logs
              </div>
              <span className={`w-2.5 h-2.5 rounded-full bg-emerald-500 ${status.is_scraping ? 'animate-pulse' : ''}`} />
            </div>

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

      {/* Filter and search bar row */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-darkCard p-3 rounded-xl border border-darkBorder shadow-sm">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Search Channel..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-darkBg text-xs text-slate-800 pl-10 pr-4 py-2.5 rounded-lg border border-darkBorder focus:outline-none focus:border-blue-500 font-medium"
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

                  {/* Status Indicator Badges */}
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
