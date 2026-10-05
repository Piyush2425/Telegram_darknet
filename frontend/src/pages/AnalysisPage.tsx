import React, { useEffect, useState } from 'react';
import { 
  BarChart3, Calendar, TrendingUp, Sparkles, Clock, ShieldAlert, 
  Layers, Search, Filter, ArrowRight, RefreshCw, Eye, MessageSquare, 
  Radio, CheckCircle2, ChevronRight, X, ExternalLink, Globe, AlertTriangle
} from 'lucide-react';
import { getDailyMessageStats, getChannels, getMessages } from '../services/api';
import { DailyStatsResponse, DailyStatItem, Channel, Message } from '../types';

export const AnalysisPage: React.FC = () => {
  const [dailyStats, setDailyStats] = useState<DailyStatsResponse | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dayMessages, setDayMessages] = useState<Message[]>([]);
  const [dayMessagesLoading, setDayMessagesLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [threatFilter, setThreatFilter] = useState<string>('ALL');

  const fetchStats = async (channelId?: string) => {
    setLoading(true);
    try {
      const [statsData, chData] = await Promise.all([
        getDailyMessageStats(channelId || undefined),
        getChannels(),
      ]);
      setDailyStats(statsData);
      setChannels(chData);
    } catch (e) {
      console.error("Error fetching daily stats:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats(selectedChannelId);
  }, [selectedChannelId]);

  // When a day is clicked, fetch that day's messages to inspect
  const handleSelectDay = async (dateStr: string) => {
    if (selectedDate === dateStr) {
      setSelectedDate(null);
      setDayMessages([]);
      return;
    }
    setSelectedDate(dateStr);
    setDayMessagesLoading(true);
    try {
      const msgs = await getMessages({
        channel_id: selectedChannelId || undefined,
        date: dateStr,
      });
      setDayMessages(msgs);
    } catch (e) {
      console.error("Error loading day messages:", e);
    } finally {
      setDayMessagesLoading(false);
    }
  };

  // Max daily count for visual scaling
  const maxDayCount = dailyStats && dailyStats.daily_stats.length > 0 
    ? Math.max(...dailyStats.daily_stats.map(d => d.count), 1)
    : 1;

  // Filtered daily items by search query
  const filteredDailyStats = dailyStats?.daily_stats.filter(item => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return item.formatted_date.toLowerCase().includes(q) || 
           item.date.includes(q) ||
           item.display_day.toLowerCase().includes(q) ||
           item.top_channels.some(c => c.title.toLowerCase().includes(q));
  }) || [];

  const selectedDayItem = dailyStats?.daily_stats.find(d => d.date === selectedDate);

  const filteredDayMessages = dayMessages.filter(m => {
    if (threatFilter === 'ALL') return true;
    return m.threat_level === threatFilter;
  });

  return (
    <div className="space-y-6 w-full relative">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            Daily Scrape & Threat Analysis
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-600 border border-blue-500/20">
              Telemetry Intelligence
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Day-by-day message volume tracking, date breakdown (e.g. 20th Aug, 19th Aug), and threat telemetry
          </p>
        </div>

        {/* Filter controls */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-darkCard px-3 py-1.5 rounded-xl border border-darkBorder shadow-sm">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs text-slate-500 font-medium">Channel:</span>
            <select
              value={selectedChannelId}
              onChange={(e) => setSelectedChannelId(e.target.value)}
              className="bg-darkBg text-xs text-slate-800 font-bold px-2 py-1 rounded-lg border border-darkBorder focus:outline-none cursor-pointer"
            >
              <option value="">All Monitored Channels</option>
              {channels.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {ch.title} ({ch.username})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => fetchStats(selectedChannelId)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 bg-darkCard hover:bg-slate-50 border border-darkBorder text-slate-700 text-xs font-bold rounded-xl transition-all shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1 — 1-Day Scraped Volume (Today) */}
        <div className="glass-card p-5 rounded-xl flex items-center justify-between border border-darkBorder bg-darkCard shadow-sm hover:border-slate-300 transition-all">
          <div className="space-y-1">
            <div className="text-[11px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
              <span>Today's Scraped</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
            </div>
            <div className="text-2xl font-bold text-emerald-600">
              {dailyStats ? dailyStats.today_count.toLocaleString() : '0'}
            </div>
            <div className="text-[10px] text-slate-500 font-medium flex items-center gap-1">
              <Clock className="w-3 h-3 text-slate-400" />
              <span>Yesterday: <strong className="text-slate-700">{dailyStats?.yesterday_count ?? 0}</strong></span>
            </div>
          </div>
          <div className="w-11 h-11 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center border border-emerald-500/20 shadow-sm">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        {/* Card 2 — Total Messages Indexed */}
        <div className="glass-card p-5 rounded-xl flex items-center justify-between border border-darkBorder bg-darkCard shadow-sm hover:border-slate-300 transition-all">
          <div className="space-y-1">
            <div className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Total Scraped Volume</div>
            <div className="text-2xl font-bold text-slate-800">
              {dailyStats ? dailyStats.total_messages.toLocaleString() : '0'}
            </div>
            <div className="text-[10px] text-slate-400 font-medium">
              Across {dailyStats?.days_recorded || 0} active partition days
            </div>
          </div>
          <div className="w-11 h-11 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center border border-blue-500/20 shadow-sm">
            <MessageSquare className="w-5 h-5" />
          </div>
        </div>

        {/* Card 3 — Peak Scraping Day */}
        <div className="glass-card p-5 rounded-xl flex items-center justify-between border border-darkBorder bg-darkCard shadow-sm hover:border-slate-300 transition-all">
          <div className="space-y-1">
            <div className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Peak Scraping Day</div>
            <div className="text-2xl font-bold text-purple-700">
              {dailyStats?.peak_day ? `${dailyStats.peak_day.count} msgs` : '0'}
            </div>
            <div className="text-[10px] text-slate-500 font-medium">
              {dailyStats?.peak_day?.formatted_date || 'No history recorded'}
            </div>
          </div>
          <div className="w-11 h-11 rounded-lg bg-purple-500/10 text-purple-600 flex items-center justify-center border border-purple-500/20 shadow-sm">
            <Sparkles className="w-5 h-5" />
          </div>
        </div>

        {/* Card 4 — Monitored Partition Days */}
        <div className="glass-card p-5 rounded-xl flex items-center justify-between border border-darkBorder bg-darkCard shadow-sm hover:border-slate-300 transition-all">
          <div className="space-y-1">
            <div className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Active Calendar Days</div>
            <div className="text-2xl font-bold text-cyan-600">
              {dailyStats?.days_recorded || 0}
            </div>
            <div className="text-[10px] text-slate-400 font-medium">
              {dailyStats && dailyStats.days_recorded > 0
                ? `Avg ~${Math.round(dailyStats.total_messages / dailyStats.days_recorded)} msgs / day`
                : 'No partition history'}
            </div>
          </div>
          <div className="w-11 h-11 rounded-lg bg-cyan-500/10 text-cyan-600 flex items-center justify-center border border-cyan-500/20 shadow-sm">
            <Calendar className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Interactive Daily Volume Visualization */}
      <div className="bg-darkCard rounded-2xl border border-darkBorder p-5 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-darkBorder/60 pb-3">
          <div className="space-y-0.5">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-600" />
              Daily Scrape Activity Timeline
            </h3>
            <p className="text-xs text-slate-500">
              Click any day bar or row to inspect that specific day's collected messages & threat telemetry
            </p>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search date (e.g. 20th Aug, 19th Aug)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-darkBg text-xs text-slate-800 pl-9 pr-3 py-1.5 rounded-lg border border-darkBorder focus:outline-none focus:border-blue-500 font-medium"
            />
          </div>
        </div>

        {/* Visual Graph Cards */}
        {filteredDailyStats.length === 0 ? (
          <div className="py-12 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200 text-xs text-slate-500">
            <Calendar className="w-8 h-8 text-slate-400 mx-auto mb-2 opacity-50" />
            No daily scrape records match the filter. Trigger a scrape to populate date-wise metrics.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredDailyStats.map((item) => {
              const isSelected = selectedDate === item.date;
              const percent = Math.max(10, Math.round((item.count / maxDayCount) * 100));

              return (
                <div
                  key={item.date}
                  onClick={() => handleSelectDay(item.date)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer select-none ${
                    isSelected 
                      ? 'bg-blue-50 border-blue-500 shadow-md ring-2 ring-blue-400/50' 
                      : 'bg-white hover:bg-slate-50/80 border-darkBorder hover:border-slate-300 shadow-sm'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-slate-900">{item.formatted_date}</span>
                      {item.date === dailyStats?.today_date && (
                        <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[9px] font-bold">Today</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold text-blue-700">{item.count.toLocaleString()}</span>
                      <span className="text-[10px] text-slate-400">msgs</span>
                    </div>
                  </div>

                  {/* Volume progress bar */}
                  <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden flex my-2">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 rounded-full transition-all duration-500"
                      style={{ width: `${percent}%` }}
                    />
                  </div>

                  {/* Bottom tags & threat breakdown */}
                  <div className="flex items-center justify-between pt-1 text-[10px]">
                    <div className="flex items-center gap-1 text-slate-500">
                      <Radio className="w-3 h-3 text-slate-400" />
                      <span>{item.channel_count} Channels</span>
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
        )}

        {/* Day-by-day table */}
        <div className="pt-4 border-t border-darkBorder/60">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Complete Date History Ledger
            </h4>
            <span className="text-[11px] text-slate-400 font-medium">
              {filteredDailyStats.length} dates recorded
            </span>
          </div>

          <div className="border border-darkBorder rounded-xl overflow-hidden shadow-inner bg-white">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-100/90 border-b border-darkBorder text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">Date / Day</th>
                  <th className="py-3 px-4 text-center">Messages Scraped</th>
                  <th className="py-3 px-4">Threat Classification</th>
                  <th className="py-3 px-4">Active Channels</th>
                  <th className="py-3 px-4 text-right pr-6">Actions</th>
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
                    <td className="py-3 px-4 text-right pr-6">
                      <button
                        onClick={() => handleSelectDay(item.date)}
                        className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                          selectedDate === item.date
                            ? 'bg-blue-600 text-white'
                            : 'bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200'
                        }`}
                      >
                        <Eye className="w-3.5 h-3.5" />
                        {selectedDate === item.date ? 'Viewing' : 'Inspect'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Selected Day Message Inspector Drawer / Modal */}
      {selectedDate && selectedDayItem && (
        <div className="bg-darkCard rounded-2xl border border-blue-300 p-5 space-y-4 shadow-md">
          <div className="flex items-center justify-between border-b border-darkBorder/60 pb-3">
            <div className="space-y-0.5">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Eye className="w-4 h-4 text-blue-600" />
                Messages Scraped on {selectedDayItem.formatted_date}
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                  {selectedDate}
                </span>
              </h3>
              <p className="text-xs text-slate-500">
                {dayMessages.length} messages indexed on this day
              </p>
            </div>

            <div className="flex items-center gap-2">
              {/* Threat Filter */}
              <div className="flex bg-darkBg rounded-lg p-0.5 border border-darkBorder text-xs font-bold">
                {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => setThreatFilter(lvl)}
                    className={`px-2 py-1 rounded-md transition-all ${
                      threatFilter === lvl 
                        ? 'bg-blue-600 text-white shadow-sm' 
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setSelectedDate(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages table for the selected day */}
          <div className="border border-darkBorder rounded-xl overflow-hidden shadow-inner bg-white max-h-96 overflow-y-auto">
            {dayMessagesLoading ? (
              <div className="py-12 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                Loading messages from date partition...
              </div>
            ) : filteredDayMessages.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500">
                No messages found matching the threat filter for this day.
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/90 border-b border-darkBorder text-[10px] font-bold text-slate-600 uppercase tracking-wider sticky top-0">
                    <th className="py-2.5 px-3 w-16">ID</th>
                    <th className="py-2.5 px-3 w-32">Channel</th>
                    <th className="py-2.5 px-3 w-28">Sender</th>
                    <th className="py-2.5 px-3">Message Content</th>
                    <th className="py-2.5 px-3 w-24 text-center">Threat</th>
                    <th className="py-2.5 px-3 w-28 text-right pr-4">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-darkBorder/40 text-slate-700">
                  {filteredDayMessages.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2 px-3 font-mono text-[10px] text-slate-400">{m.id}</td>
                      <td className="py-2 px-3 font-bold text-slate-800 truncate max-w-[120px]">{m.channel_username}</td>
                      <td className="py-2 px-3 font-mono text-[11px] text-blue-600 truncate max-w-[100px]">{m.sender || 'Anonymous'}</td>
                      <td className="py-2 px-3 break-words text-[11px] select-all">{m.text}</td>
                      <td className="py-2 px-3 text-center">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          m.threat_level === 'CRITICAL' ? 'bg-rose-100 text-rose-700 border border-rose-200' :
                          m.threat_level === 'HIGH' ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                          m.threat_level === 'MEDIUM' ? 'bg-blue-100 text-blue-700 border border-blue-200' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {m.threat_level}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right pr-4 font-mono text-[10px] text-slate-400">
                        {m.date ? new Date(m.date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
