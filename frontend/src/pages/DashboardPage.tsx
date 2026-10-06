import React, { useEffect, useState, useRef, useMemo } from 'react';
import { 
  Radio, RefreshCw, ArrowRight, CheckSquare, Square, 
  Terminal, PlayCircle, MessageSquare, Briefcase, Search, MoreVertical,
  Calendar, ChevronLeft, ChevronRight, Clock, ShieldAlert, Check, X,
  Activity, Layers, ExternalLink
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

  // Calendar State
  const [currentCalendarDate, setCurrentCalendarDate] = useState(() => new Date());
  const [selectedCalendarDateStr, setSelectedCalendarDateStr] = useState<string | null>(null);

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

  // Map of date string -> DailyStatItem for instant lookup
  const dailyStatsMap = useMemo(() => {
    const map = new Map<string, DailyStatItem>();
    if (dailyStats && dailyStats.daily_stats) {
      dailyStats.daily_stats.forEach(item => {
        map.set(item.date, item);
      });
    }
    return map;
  }, [dailyStats]);

  // Calendar calculations
  const year = currentCalendarDate.getFullYear();
  const month = currentCalendarDate.getMonth(); // 0-indexed (0 = Jan)

  const monthName = currentCalendarDate.toLocaleString('default', { month: 'long' });

  // First day of month (0 = Sun, 1 = Mon, ..., 6 = Sat)
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  // Total days in current month
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const handlePrevMonth = () => {
    setCurrentCalendarDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentCalendarDate(new Date(year, month + 1, 1));
  };

  const handleTodayMonth = () => {
    const now = new Date();
    setCurrentCalendarDate(now);
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    setSelectedCalendarDateStr(todayStr);
  };

  // Selected date telemetry
  const selectedDayTelemetry = selectedCalendarDateStr ? dailyStatsMap.get(selectedCalendarDateStr) : null;

  // Format selected date into nice string (e.g. 20th August 2026)
  const formattedSelectedDate = useMemo(() => {
    if (!selectedCalendarDateStr) return '';
    try {
      const [y, m, d] = selectedCalendarDateStr.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      const dayNum = dt.getDate();
      const suffix = (dayNum % 10 === 1 && dayNum !== 11) ? 'st' :
                     (dayNum % 10 === 2 && dayNum !== 12) ? 'nd' :
                     (dayNum % 10 === 3 && dayNum !== 13) ? 'rd' : 'th';
      return `${dayNum}${suffix} ${dt.toLocaleString('default', { month: 'long' })} ${y}`;
    } catch {
      return selectedCalendarDateStr;
    }
  }, [selectedCalendarDateStr]);

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

  return (
    <div className="space-y-4 w-full relative">
      {/* Header block */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            Overview Dashboard
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-600 border border-blue-500/20">
              Live Command Center
            </span>
          </h2>
          <p className="text-xs text-slate-500">Real-time Telegram Channel Monitoring & Daily Telemetry</p>
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

      {/* Compact Executive Summary Row (Space-Efficient) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Card 1 — Monitored Channels */}
        <div className="glass-card p-3.5 rounded-xl flex items-center justify-between border border-darkBorder bg-darkCard shadow-sm">
          <div className="space-y-0.5">
            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Monitored</div>
            <div className="text-xl font-bold text-slate-800">{monitoredList.length}</div>
            <div className="text-[10px] text-slate-400 font-medium">Total: {channels.length} channels</div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-600 flex items-center justify-center border border-cyan-500/20">
            <Radio className="w-4 h-4 animate-pulse" />
          </div>
        </div>

        {/* Card 2 — Total Messages */}
        <div className="glass-card p-3.5 rounded-xl flex items-center justify-between border border-darkBorder bg-darkCard shadow-sm">
          <div className="space-y-0.5">
            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Total Messages</div>
            <div className="text-xl font-bold text-slate-800">
              {msgCount.total_on_disk > 0 ? msgCount.total_on_disk.toLocaleString() : messages.length.toLocaleString()}
            </div>
            <div className="text-[10px] text-slate-400 font-medium">Indexed Messages</div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center border border-blue-500/20">
            <MessageSquare className="w-4 h-4" />
          </div>
        </div>

        {/* Card 3 — Today's Scraped Volume */}
        <div className="glass-card p-3.5 rounded-xl flex items-center justify-between border border-darkBorder bg-darkCard shadow-sm">
          <div className="space-y-0.5">
            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1">
              <span>Today's Scraped</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
            </div>
            <div className="text-xl font-bold text-emerald-600">
              {dailyStats ? dailyStats.today_count.toLocaleString() : '0'}
            </div>
            <div className="text-[10px] text-slate-400 font-medium">
              Yesterday: {dailyStats?.yesterday_count ?? 0}
            </div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center border border-emerald-500/20">
            <Clock className="w-4 h-4" />
          </div>
        </div>

        {/* Card 4 — Scraper Status */}
        <div className="glass-card p-3.5 rounded-xl flex items-center justify-between border border-darkBorder bg-darkCard shadow-sm">
          <div className="space-y-0.5">
            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Engine Status</div>
            <div className="text-xl font-bold text-slate-800">
              {status.is_scraping ? 'Active' : 'Standby'}
            </div>
            <div className="text-[10px] text-slate-400 font-medium">
              {status.is_scraping ? 'Scraping Live...' : 'Ready'}
            </div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-600 flex items-center justify-center border border-purple-500/20">
            <Briefcase className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* 📅 INTERACTIVE CALENDAR & DAILY SCRAPE MESSAGE COUNTER WIDGET */}
      <div className="bg-darkCard rounded-xl border border-darkBorder p-4 shadow-sm">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          
          {/* Left Column: Interactive Month Calendar (7 cols) */}
          <div className="lg:col-span-7 space-y-3">
            {/* Calendar Controls (Month Navigation) */}
            <div className="flex items-center justify-between border-b border-darkBorder/60 pb-2">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-600" />
                <h3 className="text-sm font-bold text-slate-800">
                  {monthName} {year}
                </h3>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleTodayMonth}
                  className="px-2 py-1 text-[10px] font-bold text-blue-600 hover:bg-blue-50 border border-blue-200 rounded-md transition-all"
                >
                  Today
                </button>
                <button
                  onClick={handlePrevMonth}
                  className="p-1 text-slate-600 hover:bg-slate-100 rounded-md transition-all border border-darkBorder"
                  title="Previous Month"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={handleNextMonth}
                  className="p-1 text-slate-600 hover:bg-slate-100 rounded-md transition-all border border-darkBorder"
                  title="Next Month"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Days of Week Header */}
            <div className="grid grid-cols-7 text-center text-[10px] font-bold text-slate-600 uppercase tracking-wider py-1">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                <div key={d}>{d}</div>
              ))}
            </div>

            {/* Calendar Grid Cells */}
            <div className="grid grid-cols-7 gap-1">
              {/* Empty leading padding days */}
              {Array.from({ length: firstDayOfMonth }).map((_, i) => (
                <div key={`empty-${i}`} className="h-9 rounded-lg" />
              ))}

              {/* Month Day Cells */}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const dayNum = i + 1;
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                const stat = dailyStatsMap.get(dateStr);
                const hasScraped = !!stat && stat.count > 0;
                const isSelected = selectedCalendarDateStr === dateStr;
                
                const now = new Date();
                const isToday = now.getFullYear() === year && now.getMonth() === month && now.getDate() === dayNum;

                return (
                  <button
                    key={dateStr}
                    type="button"
                    onClick={() => setSelectedCalendarDateStr(isSelected ? null : dateStr)}
                    className={`h-10 rounded-lg p-1 text-xs font-semibold flex flex-col items-center justify-between transition-all select-none relative ${
                      isSelected
                        ? 'bg-blue-600 text-white shadow-md ring-2 ring-blue-400'
                        : hasScraped
                          ? 'bg-blue-50/80 hover:bg-blue-100 text-blue-900 border border-blue-200'
                          : 'hover:bg-slate-100 text-slate-700'
                    } ${isToday && !isSelected ? 'border border-blue-500 font-bold' : ''}`}
                  >
                    <span className="text-[11px] leading-none">{dayNum}</span>

                    {/* Scrape Count Indicator Pill */}
                    {hasScraped ? (
                      <span className={`text-[9px] font-bold px-1 rounded-full leading-none ${
                        isSelected 
                          ? 'bg-blue-800 text-white' 
                          : 'bg-blue-200/80 text-blue-800'
                      }`}>
                        {stat.count}
                      </span>
                    ) : (
                      <span className="w-1 h-1 rounded-full opacity-0" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-3 text-[10px] text-slate-400 pt-1">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded bg-blue-100 border border-blue-300 inline-block" />
                <span>Days with scraped messages</span>
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded border border-blue-500 inline-block" />
                <span>Today</span>
              </span>
            </div>
          </div>

          {/* Right Column: Selected Date Message Count & Details Showcase (5 cols) */}
          <div className="lg:col-span-5 bg-slate-50/80 rounded-xl border border-slate-200 p-4 flex flex-col justify-between min-h-[220px]">
            {selectedCalendarDateStr ? (
              <div className="space-y-3">
                <div className="flex items-start justify-between border-b border-slate-200 pb-2">
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Scrape Telemetry for Date
                    </div>
                    <div className="text-sm font-bold text-slate-800 flex items-center gap-1.5 mt-0.5">
                      <Calendar className="w-3.5 h-3.5 text-blue-600" />
                      <span>{formattedSelectedDate}</span>
                    </div>
                    <div className="text-[10px] font-mono text-slate-500">{selectedCalendarDateStr}</div>
                  </div>

                  <button
                    onClick={() => setSelectedCalendarDateStr(null)}
                    className="text-slate-400 hover:text-slate-600 p-1 rounded hover:bg-slate-200"
                    title="Clear Date Selection"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Message Count Display */}
                <div className="p-3 bg-white rounded-lg border border-slate-200 shadow-sm flex items-center justify-between">
                  <div>
                    <div className="text-[10px] uppercase font-bold text-slate-400">Total Scraped on this Day</div>
                    <div className="text-2xl font-extrabold text-blue-600">
                      {selectedDayTelemetry ? selectedDayTelemetry.count.toLocaleString() : 0}
                      <span className="text-xs font-semibold text-slate-500 ml-1.5">messages</span>
                    </div>
                  </div>

                  <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-xs border border-blue-100">
                    {selectedDayTelemetry ? `${selectedDayTelemetry.channel_count} Ch` : '0 Ch'}
                  </div>
                </div>

                {/* Threat Levels Breakdown */}
                {selectedDayTelemetry && selectedDayTelemetry.count > 0 && (
                  <div className="space-y-1.5">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Threat Classification</div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {selectedDayTelemetry.threat_levels.CRITICAL > 0 && (
                        <span className="px-2 py-0.5 rounded bg-rose-50 text-rose-700 font-bold text-[10px] border border-rose-200">
                          {selectedDayTelemetry.threat_levels.CRITICAL} CRITICAL
                        </span>
                      )}
                      {selectedDayTelemetry.threat_levels.HIGH > 0 && (
                        <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 font-bold text-[10px] border border-amber-200">
                          {selectedDayTelemetry.threat_levels.HIGH} HIGH
                        </span>
                      )}
                      {selectedDayTelemetry.threat_levels.MEDIUM > 0 && (
                        <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-bold text-[10px] border border-blue-200">
                          {selectedDayTelemetry.threat_levels.MEDIUM} MED
                        </span>
                      )}
                      {selectedDayTelemetry.threat_levels.LOW > 0 && (
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] border border-slate-200">
                          {selectedDayTelemetry.threat_levels.LOW} LOW
                        </span>
                      )}
                    </div>

                    {/* Active Channels List for this date */}
                    {selectedDayTelemetry.top_channels.length > 0 && (
                      <div className="pt-1.5">
                        <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">Active Channels</div>
                        <div className="flex items-center gap-1 flex-wrap">
                          {selectedDayTelemetry.top_channels.slice(0, 3).map(c => (
                            <span key={c.id} className="px-2 py-0.5 rounded bg-white text-slate-700 text-[10px] font-medium border border-slate-200">
                              {c.title}: <strong className="text-slate-900">{c.count}</strong>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {(!selectedDayTelemetry || selectedDayTelemetry.count === 0) && (
                  <div className="text-xs text-slate-400 italic py-2">
                    No messages scraped or archived on this calendar date.
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center py-6 space-y-2 h-full">
                <Calendar className="w-8 h-8 text-slate-300" />
                <div className="text-xs font-bold text-slate-600">Select Any Date on Calendar</div>
                <p className="text-[11px] text-slate-400 max-w-[200px]">
                  Click on any day in the calendar to view its exact scraped message count and telemetry.
                </p>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Scraping Progress Tracker Panel */}
      {(status.is_scraping || (status.total_channels_count > 0 && status.completed_channels.length === status.total_channels_count && status.total_channels_count > 0)) && (
        <div className="bg-white border border-blue-200 rounded-xl shadow-sm overflow-hidden grid grid-cols-1 md:grid-cols-2 mb-4 md:h-[260px]">
          
          {/* Left Column: Channels Progress List */}
          <div className="border-r border-slate-200 flex flex-col h-full overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-blue-50 border-b border-blue-200 shrink-0">
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

            <div className="w-full h-1.5 bg-slate-100 shrink-0">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-500"
                style={{ width: `${status.progress}%` }}
              />
            </div>

            <div ref={channelsContainerRef} className="px-4 py-2 space-y-1 overflow-y-auto flex-1 bg-slate-50/20 text-xs">
              {status.completed_channels.map((name) => (
                <div key={`done-${name}`} className="flex items-center gap-2 py-0.5">
                  <span className="w-4 h-4 rounded-full bg-emerald-100 border border-emerald-300 flex items-center justify-center shrink-0">
                    <Check className="w-2.5 h-2.5 text-emerald-600" />
                  </span>
                  <span className="text-slate-500 line-through text-[11px]">{name}</span>
                  <span className="ml-auto text-[9px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded-full">Done</span>
                </div>
              ))}

              {status.is_scraping && status.current_channel && (
                <div className="flex items-center gap-2 py-0.5">
                  <span className="w-4 h-4 rounded-full bg-blue-100 border border-blue-300 flex items-center justify-center shrink-0 animate-spin">
                    <RefreshCw className="w-2.5 h-2.5 text-blue-600" />
                  </span>
                  <span className="text-blue-800 font-bold text-[11px]">{status.current_channel}</span>
                  <span className="ml-auto text-[9px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.2 rounded-full animate-pulse">Scraping</span>
                </div>
              )}

              {status.scrape_queue.map((name) => (
                <div key={`queue-${name}`} className="flex items-center gap-2 py-0.5">
                  <span className="w-2 h-2 rounded-full bg-slate-300 shrink-0 ml-1" />
                  <span className="text-slate-400 text-[11px]">{name}</span>
                  <span className="ml-auto text-[9px] font-bold text-slate-400 bg-slate-50 border border-slate-200 px-1.5 py-0.2 rounded-full">Queued</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column: Scraper Logs */}
          <div className="flex flex-col border-t md:border-t-0 md:border-l border-slate-200 h-full overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-b border-slate-200 shrink-0">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
                <Terminal className="w-3.5 h-3.5 text-emerald-600" />
                Live Terminal Logs
              </div>
              <span className={`w-2 h-2 rounded-full bg-emerald-500 ${status.is_scraping ? 'animate-pulse' : ''}`} />
            </div>

            <div ref={logsContainerRef} className="flex-1 bg-slate-900 p-3 font-mono text-[9px] text-emerald-400 overflow-y-auto space-y-0.5 shadow-inner select-all leading-normal">
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
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 bg-darkCard p-2.5 rounded-xl border border-darkBorder shadow-sm">
        <div className="relative w-full md:w-80">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search Channel..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-darkBg text-xs text-slate-800 pl-9 pr-3 py-1.5 rounded-lg border border-darkBorder focus:outline-none focus:border-blue-500 font-medium"
          />
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span>Filter:</span>
            <div className="flex bg-darkBg rounded-lg p-0.5 border border-darkBorder">
              <button
                onClick={() => setFilterType('ALL')}
                className={`px-2.5 py-1 rounded-md transition-all font-bold ${
                  filterType === 'ALL' ? 'bg-blue-600/10 text-blue-600 border border-blue-500/20' : 'hover:text-slate-800'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilterType('GROUPS')}
                className={`px-2.5 py-1 rounded-md transition-all font-bold ${
                  filterType === 'GROUPS' ? 'bg-blue-600/10 text-blue-600 border border-blue-500/20' : 'hover:text-slate-800'
                }`}
              >
                Groups
              </button>
              <button
                onClick={() => setFilterType('CHANNELS')}
                className={`px-2.5 py-1 rounded-md transition-all font-bold ${
                  filterType === 'CHANNELS' ? 'bg-blue-600/10 text-blue-600 border border-blue-500/20' : 'hover:text-slate-800'
                }`}
              >
                Channels
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-darkBg text-xs text-slate-700 px-2.5 py-1 rounded-lg border border-darkBorder focus:outline-none cursor-pointer font-bold"
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
                <th className="py-3 px-4 w-10 text-center">
                  <button onClick={handleToggleAll} className="text-blue-500 hover:text-blue-400">
                    {allSelected ? <CheckSquare className="w-3.5 h-3.5 text-blue-500" /> : <Square className="w-3.5 h-3.5 text-slate-600" />}
                  </button>
                </th>
                <th className="py-3 px-3 w-14 text-center">Avatar</th>
                <th className="py-3 px-4">Channel Name</th>
                <th className="py-3 px-4">Username</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4 text-center">Messages</th>
                <th className="py-3 px-4 text-center">Last Scraped</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-right pr-6">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-darkBorder/60 text-xs text-slate-700">
              {sortedChannels.map((ch) => (
                <tr key={ch.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="py-3 px-4 text-center">
                    <button onClick={() => handleToggle(ch.id)} className="text-blue-500 hover:text-blue-400">
                      {ch.is_monitored ? <CheckSquare className="w-3.5 h-3.5 text-blue-500" /> : <Square className="w-3.5 h-3.5 text-slate-400" />}
                    </button>
                  </td>

                  <td className="py-3 px-3 text-center" onClick={() => openChannelInNewTab(ch.id)}>
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-slate-200 to-slate-300 border border-slate-300 text-slate-700 flex items-center justify-center mx-auto cursor-pointer font-bold text-[10px]">
                      {ch.title.substring(0, 2).toUpperCase()}
                    </div>
                  </td>

                  <td className="py-3 px-4 cursor-pointer" onClick={() => openChannelInNewTab(ch.id)}>
                    <div className="font-bold text-slate-800 text-xs group-hover:text-blue-600 transition-colors">{ch.title}</div>
                    <div className="text-[9px] text-slate-400 font-mono">ID: {ch.id}</div>
                  </td>

                  <td className="py-3 px-4 font-mono text-blue-600 font-bold hover:underline cursor-pointer text-xs" onClick={() => openChannelInNewTab(ch.id)}>
                    {ch.username}
                  </td>

                  <td className="py-3 px-4 text-slate-600 text-xs">
                    {ch.type || ch.category || 'Channel'}
                  </td>

                  <td className="py-3 px-4 text-center font-bold text-slate-800 text-xs">
                    {ch.message_count ?? 0}
                  </td>

                  <td className="py-3 px-4 text-center text-slate-500 font-mono text-[10px]">
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

                  <td className="py-3 px-4 text-center">
                    {ch.status === 'scraping' ? (
                      <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20">
                        🟡 Scraping
                      </span>
                    ) : ch.is_auto_monitoring ? (
                      <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                        🟢 Auto ({ch.monitoring_interval_value}m)
                      </span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                        ⚪ Idle
                      </span>
                    )}
                  </td>

                  <td className="py-3 px-4 text-right pr-6 space-x-2">
                    <button
                      onClick={() => handleSingleScrape(ch.id)}
                      disabled={status.is_scraping}
                      className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-blue-600/10 hover:bg-blue-600/20 text-blue-600 border border-blue-500/30 font-bold text-[11px] transition-all"
                    >
                      <ArrowRight className="w-3 h-3" />
                      Scrape
                    </button>

                    <button
                      onClick={() => handleDelete(ch.id)}
                      className="inline-flex items-center p-1 rounded-lg text-slate-400 hover:text-slate-700"
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}

              {channels.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-slate-400 text-xs">
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
