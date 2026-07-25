import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Shield, Radio, RefreshCw, Eye, MessageSquare, Terminal, PlayCircle, Bug, Globe, AlertTriangle, ListFilter, Clock, Check, ArrowLeft } from 'lucide-react';
import { getChannels, getMessages, scrapeSingleChannel, getScraperStatus, scheduleChannel } from '../services/api';
import { Channel, Message, ScraperStatus } from '../types';

export const ChannelDetailPage: React.FC = () => {
  const { channelId } = useParams<{ channelId: string }>();
  const navigate = useNavigate();
  const [channel, setChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<ScraperStatus>({ is_scraping: false, progress: 0, current_channel: '', logs: [] });
  const [channelLogs, setChannelLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [isScrapingChannel, setIsScrapingChannel] = useState(false);
  const [threatFilter, setThreatFilter] = useState<string>('ALL');

  // Scheduler Form State
  const [isAutoMonitoring, setIsAutoMonitoring] = useState(false);
  const [intervalVal, setIntervalVal] = useState(15);
  const [intervalUnit, setIntervalUnit] = useState('minutes');
  const [schedulerSaved, setSchedulerSaved] = useState(false);

  const fetchChannelData = async () => {
    if (!channelId) return;
    try {
      const [chData, msgData] = await Promise.all([
        getChannels(),
        getMessages({ channel_id: channelId })
      ]);
      const currentCh = chData.find(c => c.id === channelId);
      if (currentCh) {
        setChannel(currentCh);
        setIsAutoMonitoring(!!currentCh.is_auto_monitoring);
        setIntervalVal(currentCh.monitoring_interval_value || 15);
        setIntervalUnit(currentCh.monitoring_interval_unit || 'minutes');
      }
      setMessages(msgData);
    } catch (e) {
      console.error("Error loading channel detail:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChannelData();
  }, [channelId]);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const st = await getScraperStatus();
        setStatus(st);

        // If scraping is active globally or specifically for this channel, refresh messages
        if (st.is_scraping) {
          const msgData = await getMessages({ channel_id: channelId });
          setMessages(msgData);
        }

        if (channel) {
          const matchingLogs = st.logs.filter(log => 
            log.toLowerCase().includes(channel.title.toLowerCase()) || 
            (channel.raw_username && log.toLowerCase().includes(channel.raw_username.toLowerCase())) ||
            log.includes(channel.id)
          );
          setChannelLogs(matchingLogs.length > 0 ? matchingLogs : st.logs.slice(-15));
          setIsScrapingChannel(st.is_scraping && st.current_channel === channel.title);
        }
      } catch (e) {
        console.error(e);
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [channel]);

  const handleScrape = async () => {
    if (!channelId) return;
    try {
      await scrapeSingleChannel(channelId);
      setIsScrapingChannel(true);
    } catch (e) {
      console.error(e);
    }
  };

  const handleUpdateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!channelId) return;
    try {
      const updated = await scheduleChannel(channelId, isAutoMonitoring, intervalVal, intervalUnit);
      setChannel(updated);
      setSchedulerSaved(true);
      setTimeout(() => setSchedulerSaved(false), 3000);
    } catch (err) {
      console.error("Error updating schedule rules:", err);
    }
  };

  const renderMessageTags = (text: string) => {
    const cves = text.match(/CVE-\d{4}-\d{4,7}/gi) || [];
    const ips = text.match(/\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b/g) || [];
    const onions = text.match(/[a-z2-7]{16,56}\.onion/gi) || [];

    if (cves.length === 0 && ips.length === 0 && onions.length === 0) return null;

    return (
      <div className="flex flex-wrap gap-1 mt-1">
        {cves.map((cve, idx) => (
          <span key={idx} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 text-[9px] font-bold border border-amber-500/20">
            <Bug className="w-2.5 h-2.5" />
            {cve.toUpperCase()}
          </span>
        ))}
        {ips.map((ip, idx) => (
          <span key={idx} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[9px] font-bold border border-blue-500/20">
            <Globe className="w-2.5 h-2.5" />
            {ip}
          </span>
        ))}
        {onions.map((onion, idx) => (
          <span key={idx} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 text-[9px] font-bold border border-purple-500/20">
            <Shield className="w-2.5 h-2.5" />
            {onion.toLowerCase()}
          </span>
        ))}
      </div>
    );
  };

  const filteredMessages = messages.filter(msg => {
    if (threatFilter === 'ALL') return true;
    return msg.threat_level === threatFilter;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-darkBg text-white">
        <div className="flex items-center gap-2">
          <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
          <span>Loading channel details...</span>
        </div>
      </div>
    );
  }

  if (!channel) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-darkBg text-white space-y-4">
        <AlertTriangle className="w-12 h-12 text-rose-500" />
        <span className="text-lg font-bold">Channel not found or database sync in progress.</span>
      </div>
    );
  }

  return (
    <div className="h-screen bg-darkBg text-slate-100 flex flex-col overflow-hidden p-4 font-sans select-none">
      
      {/* 1. Header Navigation Bar (Thin, Compact) */}
      <div className="flex items-center justify-between pb-3 border-b border-darkBorder mb-3 shrink-0">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Directory
        </button>

        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-slate-300 uppercase tracking-wide">
            Target Page Intelligence Console
          </h2>
        </div>
      </div>

      {/* 2. Channel Metadata Block (Super Compact) */}
      <div className="glass-card p-4 rounded-xl border border-cyan-500/20 bg-gradient-to-r from-cyan-950/20 to-blue-950/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shrink-0 mb-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-cyan-600/10 border border-cyan-500/30 text-cyan-400 flex items-center justify-center font-bold text-sm shadow-inner">
            {channel.title.substring(0, 2).toUpperCase()}
          </div>
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2 leading-none">
              {channel.title}
              <span className="text-[10px] text-slate-500 font-mono">ID: {channel.id}</span>
            </h2>
            <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-1">
              <span className="font-mono text-cyan-400 font-bold">{channel.username}</span>
              <span>•</span>
              <span>Type: {channel.type || 'Channel'}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs font-semibold">
          <div className="text-right">
            <div className="text-[9px] text-slate-500 uppercase font-bold tracking-wider leading-none">Subscribers</div>
            <div className="text-sm font-bold text-white mt-0.5">{channel.member_count.toLocaleString()}</div>
          </div>
          <div className="text-right border-l border-darkBorder pl-4">
            <div className="text-[9px] text-slate-500 uppercase font-bold tracking-wider leading-none">Scraped Posts</div>
            <div className="text-sm font-bold text-cyan-400 mt-0.5">{messages.length}</div>
          </div>
          
          <button
            onClick={handleScrape}
            disabled={status.is_scraping}
            className="ml-2 flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-lg transition-all shadow-md shadow-blue-600/10"
          >
            <PlayCircle className="w-3.5 h-3.5" />
            {isScrapingChannel ? 'Scraping live...' : 'Scrape Data'}
          </button>
        </div>
      </div>

      {/* Progress Bar inside specific tab */}
      {isScrapingChannel && (
        <div className="glass-card p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 space-y-1 mb-3 shrink-0">
          <div className="flex items-center justify-between text-[11px] font-bold text-amber-400">
            <span>Collecting posts...</span>
            <span>{status.progress}%</span>
          </div>
          <div className="w-full h-1.5 bg-darkBg rounded-full overflow-hidden border border-white/5">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-300"
              style={{ width: `${status.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* 3. Main Split Content Area (Grid fitting exactly in viewport) */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-4 min-h-0">
        
        {/* Left Column (3/4 Width): Scheduler & Message Table */}
        <div className="lg:col-span-3 flex flex-col gap-4 min-h-0">
          
          {/* Scheduler panel */}
          <div className="glass-card p-4 rounded-xl border border-cyan-500/20 bg-darkCard/40 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shrink-0">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-cyan-400" />
                <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Auto-Monitoring Scheduler</h3>
                {channel.is_auto_monitoring ? (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Active: {intervalVal}{intervalUnit === 'hours' ? 'h' : 'm'}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-800 text-slate-500">
                    Disabled
                  </span>
                )}
              </div>
              {channel.is_auto_monitoring && channel.next_scrape_at && (
                <div className="text-[10px] text-slate-400 font-medium">
                  Next execution run scheduled for: <span className="font-bold text-slate-200">{new Date(channel.next_scrape_at).toLocaleString()}</span>
                </div>
              )}
            </div>

            <form onSubmit={handleUpdateSchedule} className="flex items-center flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsAutoMonitoring(!isAutoMonitoring)}
                  className={`w-9 h-5 rounded-full p-0.5 transition-colors focus:outline-none ${
                    isAutoMonitoring ? 'bg-blue-600' : 'bg-slate-700'
                  }`}
                >
                  <div className={`w-4 h-4 rounded-full bg-white transition-transform ${
                    isAutoMonitoring ? 'translate-x-4' : 'translate-x-0'
                  }`} />
                </button>
                <span className="text-[11px] font-bold text-slate-400">Auto-scrape</span>
              </div>

              {isAutoMonitoring && (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    value={intervalVal}
                    onChange={(e) => setIntervalVal(parseInt(e.target.value) || 1)}
                    className="w-14 bg-darkBg text-xs text-white px-2 py-1 rounded border border-darkBorder text-center focus:outline-none focus:border-slate-500"
                  />
                  <select
                    value={intervalUnit}
                    onChange={(e) => setIntervalUnit(e.target.value)}
                    className="bg-darkBg text-xs text-white px-2 py-1 rounded border border-darkBorder focus:outline-none cursor-pointer"
                  >
                    <option value="minutes">Min</option>
                    <option value="hours">Hours</option>
                  </select>
                </div>
              )}

              <button
                type="submit"
                className="flex items-center gap-1 px-3 py-1 bg-cyan-500 hover:bg-cyan-400 text-darkBg font-bold text-[10px] rounded-lg transition-all"
              >
                <Check className="w-3 h-3" />
                Apply
              </button>

              {schedulerSaved && (
                <span className="text-[10px] text-emerald-400 font-bold">Saved!</span>
              )}
            </form>
          </div>

          {/* Scraped Target Data Table (Perfect scrolling layout) */}
          <div className="flex-1 flex flex-col min-h-0 bg-darkCard border border-darkBorder rounded-xl overflow-hidden">
            <div className="p-3 border-b border-darkBorder flex items-center justify-between bg-darkCard/50 shrink-0">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <MessageSquare className="w-3.5 h-3.5 text-cyan-400" />
                Scraped Target Data Directory ({filteredMessages.length} items shown)
              </h3>
              
              <div className="flex items-center gap-2 bg-darkBg border border-darkBorder px-2.5 py-1 rounded-lg">
                <ListFilter className="w-3 h-3 text-slate-400" />
                <select
                  value={threatFilter}
                  onChange={(e) => setThreatFilter(e.target.value)}
                  className="bg-transparent text-[11px] text-slate-300 focus:outline-none cursor-pointer"
                >
                  <option value="ALL" className="bg-darkBg">All Threat Levels</option>
                  <option value="CRITICAL" className="bg-darkBg text-rose-400 font-bold">Critical Only</option>
                  <option value="HIGH" className="bg-darkBg text-amber-400 font-bold">High Only</option>
                  <option value="MEDIUM" className="bg-darkBg text-blue-400">Medium Only</option>
                  <option value="LOW" className="bg-darkBg text-slate-400">Low Only</option>
                </select>
              </div>
            </div>

            {/* Scrollable table container */}
            <div className="flex-1 overflow-y-auto min-h-0">
              <table className="w-full text-left border-collapse table-fixed">
                <thead>
                  <tr className="bg-darkCard/80 border-b border-darkBorder text-[9px] font-bold text-slate-400 uppercase tracking-wider sticky top-0 z-10">
                    <th className="py-2.5 px-4 w-28">SENDER (USER ID)</th>
                    <th className="py-2.5 px-4 w-36">DATE & TIME</th>
                    <th className="py-2.5 px-4">MESSAGE TEXT</th>
                    <th className="py-2.5 px-3 w-16 text-center">VIEWS</th>
                    <th className="py-2.5 px-4 w-24 text-center">THREAT LEVEL</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-darkBorder/40 text-[11px] text-slate-300">
                  {filteredMessages.map((msg) => (
                    <tr key={msg.id} className="hover:bg-darkCard/20 transition-colors">
                      <td className="py-3 px-4 font-mono text-cyan-400 font-bold break-all">
                        {msg.sender}
                      </td>

                      <td className="py-3 px-4 text-slate-400">
                        {new Date(msg.date).toLocaleString()}
                      </td>

                      <td className="py-3 px-4 space-y-1">
                        <div className="text-slate-200 font-mono whitespace-pre-wrap bg-darkBg/30 p-2 rounded border border-white/5 break-words select-all max-h-36 overflow-y-auto leading-relaxed">
                          {msg.text}
                        </div>
                        {renderMessageTags(msg.text)}
                      </td>

                      <td className="py-3 px-3 text-center text-slate-400 font-medium">
                        {msg.views}
                      </td>

                      <td className="py-3 px-4 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold ${
                          msg.threat_level === 'CRITICAL' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                          msg.threat_level === 'HIGH' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                          msg.threat_level === 'MEDIUM' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                          'bg-slate-800 text-slate-400'
                        }`}>
                          {msg.threat_level}
                        </span>
                      </td>
                    </tr>
                  ))}

                  {filteredMessages.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-500">
                        No messages found matching your criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Column (1/4 Width): Specs & Terminal Logs */}
        <div className="flex flex-col gap-4 min-h-0">
          
          {/* Spec details card (Slimmed) */}
          <div className="glass-card p-4 rounded-xl border border-darkBorder bg-darkCard/40 shrink-0 space-y-2">
            <h4 className="text-[10px] font-bold text-white uppercase tracking-wider">Automated Scraper Specs</h4>
            <p className="text-[10px] text-slate-400 leading-normal">
              Silent background crawls automatically download de-duplicated messages, update risk factors, and append values to CSV backups.
            </p>
          </div>

          {/* Terminal output console (Fills the remaining vertical space perfectly) */}
          <div className="flex-1 flex flex-col min-h-0 bg-darkCard border border-darkBorder rounded-xl overflow-hidden">
            <div className="p-3 border-b border-darkBorder bg-darkCard/50 flex items-center justify-between shrink-0">
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-emerald-400" />
                Live Scraper Output Logs
              </h3>
            </div>
            
            <div className="flex-1 bg-darkBg/95 p-3.5 font-mono text-[9px] text-emerald-400 overflow-y-auto space-y-1 shadow-inner select-all leading-normal">
              {channelLogs.map((log, idx) => (
                <div key={idx} className="break-all whitespace-pre-wrap">
                  {log}
                </div>
              ))}
              {channelLogs.length === 0 && (
                <div className="text-slate-600 italic">Logs are populated during execution runs...</div>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
