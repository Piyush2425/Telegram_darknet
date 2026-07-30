import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Shield, Radio, RefreshCw, Eye, MessageSquare, Terminal, PlayCircle, Bug, Globe, AlertTriangle, Clock, Check, ArrowLeft, Calendar, RotateCcw, Cpu, Copy, X, FileText } from 'lucide-react';
import { getChannels, getMessages, scrapeSingleChannel, getScraperStatus, scheduleChannel, generateAiReport, getLiveReport } from '../services/api';
import { Channel, Message, ScraperStatus } from '../types';

const MarkdownRenderer: React.FC<{ content: string }> = ({ content }) => {
  if (!content) return <p className="text-slate-500 italic">No report content available.</p>;

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  
  let currentTableRows: string[][] = [];

  const flushTable = (key: number) => {
    if (currentTableRows.length === 0) return null;
    
    const headers = currentTableRows[0];
    const dataRows = currentTableRows.slice(1);
    
    currentTableRows = [];

    return (
      <div key={`table-${key}`} className="overflow-x-auto my-4 rounded-lg border border-white/5 bg-darkCard/25 shadow-inner">
        <table className="w-full text-left border-collapse text-[11px] table-fixed">
          <thead>
            <tr className="bg-darkCard/90 border-b border-darkBorder/60 font-bold text-slate-300">
              {headers.map((h, i) => {
                const headerText = h.trim();
                // Custom width adjustments depending on columns
                let wClass = "py-2 px-3";
                if (headerText.toLowerCase().includes("url") || headerText.toLowerCase().includes("link")) {
                  wClass += " w-80";
                } else if (headerText.toLowerCase().includes("count")) {
                  wClass += " w-16 text-center";
                } else if (headerText.toLowerCase().includes("severity")) {
                  wClass += " w-20";
                } else if (headerText.toLowerCase().includes("seen") || headerText.toLowerCase().includes("time")) {
                  wClass += " w-28";
                } else if (headerText.toLowerCase().includes("sender") || headerText.toLowerCase().includes("user")) {
                  wClass += " w-36";
                }
                return (
                  <th key={i} className={wClass}>{headerText}</th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-darkBorder/20 text-slate-700">
            {dataRows.map((row, idx) => (
              <tr key={idx} className="hover:bg-slate-50 transition-colors">
                {row.map((cell, cellIdx) => {
                  const val = cell.trim();
                  
                  // Safe column alignment mapping
                  const headerText = (headers[cellIdx] || "").trim().toLowerCase();
                  let alignment = "py-2 px-3 leading-relaxed break-words whitespace-pre-wrap select-all";
                  if (headerText.includes("count")) {
                    alignment = "py-2 px-3 text-center font-bold text-cyan-600";
                  }

                  // Render links cleanly
                  const linkMatch = val.match(/\[(.*?)\]\((.*?)\)/);
                  if (linkMatch) {
                    return (
                      <td key={cellIdx} className="py-2 px-3 font-mono text-cyan-600 font-bold break-all">
                        <a href={linkMatch[2]} target="_blank" rel="noopener noreferrer" className="hover:underline">
                          {linkMatch[1]}
                        </a>
                      </td>
                    );
                  }

                  // Severity badges
                  if (val.toUpperCase() === 'HIGH' || val.toUpperCase() === 'CRITICAL') {
                    return (
                      <td key={cellIdx} className="py-2 px-3">
                        <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-600 border border-rose-500/20 font-bold uppercase text-[9px]">
                          {val}
                        </span>
                      </td>
                    );
                  }
                  if (val.toUpperCase() === 'MEDIUM') {
                    return (
                      <td key={cellIdx} className="py-2 px-3">
                        <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 border border-amber-500/20 font-bold uppercase text-[9px]">
                          {val}
                        </span>
                      </td>
                    );
                  }
                  if (val.toUpperCase() === 'LOW') {
                    return (
                      <td key={cellIdx} className="py-2 px-3">
                        <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 border border-blue-500/20 font-bold uppercase text-[9px]">
                          {val}
                        </span>
                      </td>
                    );
                  }

                  // Inline code formatting
                  if (val.startsWith('`') && val.endsWith('`')) {
                    return (
                      <td key={cellIdx} className="py-2 px-3 font-mono text-indigo-600 break-all select-all">
                        {val.slice(1, -1)}
                      </td>
                    );
                  }

                  return <td key={cellIdx} className={alignment}>{val}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx].trim();

    // Table rows check
    if (line.startsWith('|')) {
      const cells = line.split('|').slice(1, -1);
      
      // Skip divider lines
      if (cells.every(c => c.trim().startsWith(':') || c.trim().startsWith('-'))) {
        continue;
      }
      
      currentTableRows.push(cells);
      continue;
    } else {
      if (currentTableRows.length > 0) {
        const table = flushTable(idx);
        if (table) elements.push(table);
      }
    }

    if (!line) continue;

    // Headings
    if (line.startsWith('# ')) {
      elements.push(
        <h1 key={idx} className="text-base font-extrabold text-slate-800 uppercase tracking-wider mt-4 mb-2 border-b border-darkBorder pb-1.5 flex items-center gap-2">
          {line.replace('# ', '')}
        </h1>
      );
    } else if (line.startsWith('## ')) {
      elements.push(
        <h2 key={idx} className="text-xs font-bold text-slate-700 uppercase tracking-widest mt-5 mb-2 border-l-2 border-cyan-500 pl-2 pb-0.5">
          {line.replace('## ', '')}
        </h2>
      );
    } else if (line.startsWith('### ')) {
      elements.push(
        <h3 key={idx} className="text-[10px] font-bold text-cyan-600 uppercase tracking-widest mt-3 mb-1.5">
          {line.replace('### ', '')}
        </h3>
      );
    } else if (line.startsWith('* ') || line.startsWith('- ')) {
      elements.push(
        <div key={idx} className="flex items-start gap-2.5 my-1 ml-3 text-slate-700 text-xs">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-600 mt-1.5 shrink-0 animate-pulse" />
          <span className="leading-relaxed select-text select-all">{line.slice(2)}</span>
        </div>
      );
    } else if (line.startsWith('> ')) {
      elements.push(
        <blockquote key={idx} className="border-l-2 border-cyan-500/40 bg-cyan-500/5 p-2.5 rounded-r-lg my-1.5 text-xs italic text-slate-600 select-text leading-relaxed whitespace-pre-wrap select-all">
          {line.replace('> ', '')}
        </blockquote>
      );
    } else {
      elements.push(
        <p key={idx} className="text-xs text-slate-700 my-1 leading-relaxed select-text select-all">
          {line}
        </p>
      );
    }
  }

  if (currentTableRows.length > 0) {
    const table = flushTable(lines.length);
    if (table) elements.push(table);
  }

  return <div className="space-y-1.5">{elements}</div>;
};

export const ChannelDetailPage: React.FC = () => {
  const { channelId } = useParams<{ channelId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight');
  const [channel, setChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<ScraperStatus>({ is_scraping: false, progress: 0, current_channel: '', logs: [], scrape_queue: [], completed_channels: [], total_channels_count: 0 });
  const [channelLogs, setChannelLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [isScrapingChannel, setIsScrapingChannel] = useState(false);

  // Date Range Filter State
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  // AI Report State
  const [reportLoading, setReportLoading] = useState(false);
  const [reportMarkdown, setReportMarkdown] = useState<string | null>(null);
  const [activeReportId, setActiveReportId] = useState<string | null>(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [copied, setCopied] = useState(false);

  // Scheduler Form State
  const [isAutoMonitoring, setIsAutoMonitoring] = useState(false);
  const [intervalVal, setIntervalVal] = useState(15);
  const [intervalUnit, setIntervalUnit] = useState('minutes');
  
  // Tabs & Live Report State
  const [activeTab, setActiveTab] = useState<'messages' | 'live-report'>('messages');
  const [liveReportMd, setLiveReportMd] = useState<string>('');
  const [liveReportLoading, setLiveReportLoading] = useState(false);
  
  // AI Scheduler Form State
  const [isAutoAi, setIsAutoAi] = useState(false);
  const [aiIntervalVal, setAiIntervalVal] = useState(60);
  const [aiIntervalUnit, setAiIntervalUnit] = useState('minutes');

  // Report Scheduler Form State
  const [isAutoReport, setIsAutoReport] = useState(false);
  const [reportIntervalVal, setReportIntervalVal] = useState(24);
  const [reportIntervalUnit, setReportIntervalUnit] = useState('hours');
  
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
        
        setIsAutoAi(!!currentCh.is_auto_ai);
        setAiIntervalVal(currentCh.ai_interval_value || 60);
        setAiIntervalUnit(currentCh.ai_interval_unit || 'minutes');
        
        setIsAutoReport(!!currentCh.is_auto_report);
        setReportIntervalVal(currentCh.report_interval_value || 24);
        setReportIntervalUnit(currentCh.report_interval_unit || 'hours');
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
    if (highlightId && messages.length > 0) {
      setTimeout(() => {
        const el = document.getElementById(`msg-row-${highlightId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 800);
    }
  }, [highlightId, messages]);

  const fetchLiveReport = async () => {
    if (!channelId) return;
    setLiveReportLoading(true);
    try {
      const res = await getLiveReport(channelId);
      setLiveReportMd(res.report);
    } catch (e) {
      console.error("Error fetching live report:", e);
    } finally {
      setLiveReportLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'live-report') {
      fetchLiveReport();
    }
  }, [activeTab, channelId]);

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
      const updated = await scheduleChannel(
        channelId, 
        isAutoMonitoring, 
        intervalVal, 
        intervalUnit, 
        isAutoAi, 
        aiIntervalVal, 
        aiIntervalUnit,
        isAutoReport,
        reportIntervalVal,
        reportIntervalUnit
      );
      setChannel(updated);
      setSchedulerSaved(true);
      setTimeout(() => setSchedulerSaved(false), 3000);
    } catch (err) {
      console.error("Error updating schedule rules:", err);
    }
  };

  const handleResetDates = () => {
    setStartDate('');
    setEndDate('');
  };

  const handleGenerateAiReport = async () => {
    if (!channelId) return;
    setReportLoading(true);
    try {
      const res = await generateAiReport(channelId, startDate, endDate);
      setReportMarkdown(res.report);
      setActiveReportId(res.report_id);
      setShowReportModal(true);
    } catch (err) {
      console.error("AI Report generation error:", err);
      alert("Failed to generate report: No messages found in the selected range, or LLM offline.");
    } finally {
      setReportLoading(false);
    }
  };

  const handleCopyReport = () => {
    if (reportMarkdown) {
      navigator.clipboard.writeText(reportMarkdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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

  // Filter messages by Date Range
  const filteredMessages = messages.filter(msg => {
    const msgDate = new Date(msg.date);
    
    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      if (msgDate < start) return false;
    }
    
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      if (msgDate > end) return false;
    }
    
    return true;
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
    <div className="h-screen bg-darkBg text-slate-100 flex flex-col overflow-hidden p-3.5 font-sans select-none">
      
      {/* 1. Header Navigation Bar (Thin, Compact) */}
      <div className="flex items-center justify-between pb-2 border-b border-darkBorder mb-2.5 shrink-0">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Directory
        </button>

        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
            Target Page Intelligence Console
          </h2>
        </div>
      </div>

      {/* 2. Channel Metadata Block (Super Compact) */}
      <div className="glass-card p-4 rounded-xl border border-cyan-500/20 bg-gradient-to-r from-cyan-50/40 to-blue-50/40 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 shrink-0 mb-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-600 flex items-center justify-center font-bold text-sm shadow-inner">
            {channel.title.substring(0, 2).toUpperCase()}
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2 leading-none">
              {channel.title}
              <span className="text-[10px] text-slate-500 font-mono">ID: {channel.id}</span>
            </h2>
            <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-1">
              <span className="font-mono text-cyan-600 font-bold">{channel.username}</span>
              <span>•</span>
              <span>Type: {channel.type || 'Channel'}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs font-semibold">
          <div className="text-right">
            <div className="text-[9px] text-slate-400 uppercase font-bold tracking-wider leading-none">Subscribers</div>
            <div className="text-sm font-bold text-slate-800 mt-0.5">{channel.member_count.toLocaleString()}</div>
          </div>
          <div className="text-right border-l border-darkBorder pl-4">
            <div className="text-[9px] text-slate-400 uppercase font-bold tracking-wider leading-none">Scraped Posts</div>
            <div className="text-sm font-bold text-cyan-600 mt-0.5">{messages.length}</div>
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

      {/* 3. Main Split Content Area */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-4 gap-4 min-h-0">
        
        {/* Left Column (3/4 Width): Scheduler & Message Table */}
        <div className="lg:col-span-3 flex flex-col gap-4 min-h-0">
          
          {/* Unified Schedulers Panel (Three columns layout: Scraper, AI Cycles, and PDF Schedulers) */}
          <div className="glass-card p-4 rounded-xl border border-cyan-500/20 bg-darkCard shrink-0">
            <form onSubmit={handleUpdateSchedule} className="space-y-3.5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Column 1: Scraper Scheduler */}
                <div className="space-y-2 border-r border-darkBorder/30 pr-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-cyan-600" />
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Auto-Scrape Schedule</span>
                    </div>
                    {channel.is_auto_monitoring ? (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-500/10 text-emerald-600 border border-emerald-500/20">
                        Active
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                        Off
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setIsAutoMonitoring(!isAutoMonitoring)}
                        className={`w-9 h-5 rounded-full p-0.5 transition-colors focus:outline-none ${
                          isAutoMonitoring ? 'bg-blue-600' : 'bg-slate-300'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded-full bg-white transition-transform ${
                          isAutoMonitoring ? 'translate-x-4' : 'translate-x-0'
                        }`} />
                      </button>
                      <span className="text-[11px] font-bold text-slate-500">Enable</span>
                    </div>

                    {isAutoMonitoring && (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="1"
                          value={intervalVal}
                          onChange={(e) => setIntervalVal(parseInt(e.target.value) || 1)}
                          className="w-14 bg-darkBg text-xs text-slate-800 px-2 py-1 rounded border border-darkBorder text-center focus:outline-none"
                        />
                        <select
                          value={intervalUnit}
                          onChange={(e) => setIntervalUnit(e.target.value)}
                          className="bg-darkBg text-xs text-slate-800 px-2 py-1 rounded border border-darkBorder focus:outline-none cursor-pointer"
                        >
                          <option value="minutes">Min</option>
                          <option value="hours">Hours</option>
                        </select>
                      </div>
                    )}
                  </div>
                  
                  {channel.is_auto_monitoring && channel.next_scrape_at && (
                    <div className="text-[10px] text-slate-500">
                      Next Scrape: <span className="font-bold text-slate-700">{new Date(channel.next_scrape_at).toLocaleString()}</span>
                    </div>
                  )}
                </div>

                {/* Column 2: AI Cycles Scheduler */}
                <div className="space-y-2 border-r border-darkBorder/30 pr-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-cyan-600" />
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Auto-AI Cycles Schedule</span>
                    </div>
                    {channel.is_auto_ai ? (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-indigo-500/10 text-indigo-600 border border-indigo-500/20">
                        Active
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                        Off
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setIsAutoAi(!isAutoAi)}
                        className={`w-9 h-5 rounded-full p-0.5 transition-colors focus:outline-none ${
                          isAutoAi ? 'bg-indigo-600' : 'bg-slate-300'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded-full bg-white transition-transform ${
                          isAutoAi ? 'translate-x-4' : 'translate-x-0'
                        }`} />
                      </button>
                      <span className="text-[11px] font-bold text-slate-500">Enable</span>
                    </div>

                    {isAutoAi && (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="1"
                          value={aiIntervalVal}
                          onChange={(e) => setAiIntervalVal(parseInt(e.target.value) || 1)}
                          className="w-14 bg-darkBg text-xs text-slate-800 px-2 py-1 rounded border border-darkBorder text-center focus:outline-none"
                        />
                        <select
                          value={aiIntervalUnit}
                          onChange={(e) => setAiIntervalUnit(e.target.value)}
                          className="bg-darkBg text-xs text-slate-800 px-2 py-1 rounded border border-darkBorder focus:outline-none cursor-pointer"
                        >
                          <option value="minutes">Min</option>
                          <option value="hours">Hours</option>
                          <option value="days">Days</option>
                        </select>
                      </div>
                    )}
                  </div>
                  
                  {channel.is_auto_ai && channel.next_ai_at && (
                    <div className="text-[10px] text-slate-500">
                      Next AI Cycle: <span className="font-bold text-slate-700">{new Date(channel.next_ai_at).toLocaleString()}</span>
                    </div>
                  )}
                </div>

                {/* Column 3: Report Compiler */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-cyan-600" />
                      <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Auto-Report PDF Compiler</span>
                    </div>
                    {channel.is_auto_report ? (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-rose-500/10 text-rose-600 border border-rose-500/20">
                        Active
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                        Off
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setIsAutoReport(!isAutoReport)}
                        className={`w-9 h-5 rounded-full p-0.5 transition-colors focus:outline-none ${
                          isAutoReport ? 'bg-rose-600' : 'bg-slate-300'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded-full bg-white transition-transform ${
                          isAutoReport ? 'translate-x-4' : 'translate-x-0'
                        }`} />
                      </button>
                      <span className="text-[11px] font-bold text-slate-500">Enable</span>
                    </div>

                    {isAutoReport && (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="1"
                          value={reportIntervalVal}
                          onChange={(e) => setReportIntervalVal(parseInt(e.target.value) || 1)}
                          className="w-14 bg-darkBg text-xs text-slate-800 px-2 py-1 rounded border border-darkBorder text-center focus:outline-none"
                        />
                        <select
                          value={reportIntervalUnit}
                          onChange={(e) => setReportIntervalUnit(e.target.value)}
                          className="bg-darkBg text-xs text-slate-800 px-2 py-1 rounded border border-darkBorder focus:outline-none cursor-pointer"
                        >
                          <option value="minutes">Min</option>
                          <option value="hours">Hours</option>
                          <option value="days">Days</option>
                        </select>
                      </div>
                    )}
                  </div>
                  
                  {channel.is_auto_report && channel.next_report_at && (
                    <div className="text-[10px] text-slate-500">
                      Next PDF Report: <span className="font-bold text-slate-700">{new Date(channel.next_report_at).toLocaleString()}</span>
                    </div>
                  )}
                </div>

              </div>

              <div className="flex items-center justify-between pt-2 border-t border-darkBorder/30">
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-lg transition-all"
                >
                  <Check className="w-3.5 h-3.5" />
                  Apply Scheduler Rules
                </button>

                {schedulerSaved && (
                  <span className="text-[11px] text-emerald-600 font-bold">✓ Scheduler rules updated successfully!</span>
                )}
              </div>
            </form>
          </div>

          {/* Scraped Target Data Table */}
          <div className="flex-1 flex flex-col min-h-0 bg-darkCard border border-darkBorder rounded-xl overflow-hidden">
            
            {/* Tabs Header */}
            <div className="flex border-b border-darkBorder bg-darkCard justify-between items-center shrink-0 px-2 flex-wrap">
              <div className="flex">
                <button
                  type="button"
                  onClick={() => setActiveTab('messages')}
                  className={`px-4 py-3 text-xs font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all ${
                    activeTab === 'messages'
                      ? 'border-cyan-500 text-cyan-600 bg-cyan-500/5'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5 text-cyan-500" />
                  Message Log Directory
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('live-report')}
                  className={`px-4 py-3 text-xs font-bold uppercase tracking-wider flex items-center gap-2 border-b-2 transition-all ${
                    activeTab === 'live-report'
                      ? 'border-indigo-500 text-indigo-600 bg-indigo-500/5'
                      : 'border-transparent text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5 text-indigo-500" />
                  Live daily Report (.md)
                </button>
              </div>

              {/* Action Buttons depending on Tab */}
              {activeTab === 'messages' ? (
                <div className="flex items-center gap-3 pr-2 text-[11px] text-slate-500 py-2 sm:py-0">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-cyan-500" />
                    <span className="font-bold">Select Range:</span>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="bg-darkBg text-slate-700 text-xs px-2 py-0.5 rounded border border-darkBorder focus:outline-none"
                    />
                    <span>to</span>
                    <input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="bg-darkBg text-slate-700 text-xs px-2 py-0.5 rounded border border-darkBorder focus:outline-none"
                    />
                    {(startDate || endDate) && (
                      <button
                        type="button"
                        onClick={handleResetDates}
                        className="p-1 hover:text-slate-800 rounded bg-slate-100 transition-colors"
                        title="Reset date filter"
                      >
                        <RotateCcw className="w-3 h-3 text-slate-500 hover:text-slate-800" />
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleGenerateAiReport}
                    disabled={reportLoading || filteredMessages.length === 0}
                    className="flex items-center gap-1 px-3 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-[10px] rounded-lg transition-all disabled:opacity-55 disabled:cursor-not-allowed"
                  >
                    <Cpu className={`w-3 h-3 ${reportLoading ? 'animate-spin' : ''}`} />
                    {reportLoading ? 'Analyzing...' : 'Generate AI Report'}
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2 pr-2 py-2 sm:py-0">
                  <button
                    type="button"
                    onClick={fetchLiveReport}
                    disabled={liveReportLoading}
                    className="flex items-center gap-1 px-3 py-1 bg-darkBg hover:bg-slate-100 text-slate-600 font-bold text-[10px] rounded border border-darkBorder transition-colors"
                  >
                    <RefreshCw className={`w-3 h-3 ${liveReportLoading ? 'animate-spin' : ''}`} />
                    Refresh Logs
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(liveReportMd);
                      alert("Markdown daily log report copied to clipboard!");
                    }}
                    className="flex items-center gap-1 px-3 py-1 bg-darkBg hover:bg-slate-100 text-slate-600 font-bold text-[10px] rounded border border-darkBorder transition-colors"
                  >
                    <Copy className="w-3 h-3" />
                    Copy Markdown
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!channelId) return;
                      window.open(`/api/channels/${channelId}/live-report/download-pdf`, '_blank');
                    }}
                    className="flex items-center gap-1 px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white font-bold text-[10px] rounded transition-colors"
                  >
                    <FileText className="w-3 h-3" />
                    Export PDF Report
                  </button>
                </div>
              )}
            </div>

            {/* Scrollable table/report container */}
            <div className="flex-1 overflow-y-auto min-h-0 bg-darkBg/15">
              {activeTab === 'messages' ? (
                <table className="w-full text-left border-collapse table-fixed">
                  <thead>
                    <tr className="bg-slate-100 border-b border-darkBorder text-[9px] font-bold text-slate-600 uppercase tracking-wider sticky top-0 z-10">
                      <th className="py-2.5 px-4 w-36">SENDER (USER ID)</th>
                      <th className="py-2.5 px-4 w-44">DATE & TIME</th>
                      <th className="py-2.5 px-4">MESSAGE TEXT</th>
                      <th className="py-2.5 px-4 w-28 text-center font-bold">VIEWS</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-darkBorder/40 text-[11px] text-slate-600">
                    {filteredMessages.map((msg) => {
                      const isHighlighted = highlightId === msg.id;
                      return (
                        <tr
                          key={msg.id}
                          id={`msg-row-${msg.id}`}
                          className={`hover:bg-slate-50 transition-all ${
                            isHighlighted ? 'bg-amber-100/80 border-l-4 border-l-amber-500 font-medium' : 'hover:bg-slate-50'
                          }`}
                        >
                        <td className="py-3 px-4 font-mono text-cyan-600 font-bold break-all">
                          {msg.sender}
                        </td>

                        <td className="py-3 px-4 text-slate-500">
                          {new Date(msg.date).toLocaleString()}
                        </td>

                        <td className="py-3 px-4 space-y-1">
                          <div className="text-slate-700 font-mono whitespace-pre-wrap bg-slate-100 p-2 rounded border border-slate-200 break-words select-all max-h-36 overflow-y-auto leading-relaxed">
                            {msg.text}
                          </div>
                          {renderMessageTags(msg.text)}
                        </td>

                        <td className="py-3 px-4 text-center text-slate-500 font-medium">
                          {msg.views}
                        </td>
                      </tr>
                    );
                    })}

                    {filteredMessages.length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-12 text-center text-slate-500">
                          No messages found matching your date range criteria.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              ) : (
                <div className="p-5 font-sans text-xs text-slate-700 leading-relaxed bg-white select-text rounded-lg border border-darkBorder/40">
                  {liveReportLoading ? (
                    <div className="flex items-center justify-center py-12 gap-2 text-slate-400">
                      <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
                      <span>Reading daily markdown report logs...</span>
                    </div>
                  ) : (
                    <MarkdownRenderer content={liveReportMd} />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column (1/4 Width): Specs & Terminal Logs */}
        <div className="flex flex-col gap-4 min-h-0">
          
          {/* Spec details card */}
          <div className="glass-card p-4 rounded-xl border border-darkBorder bg-darkCard shrink-0 space-y-2">
            <h4 className="text-[10px] font-bold text-slate-800 uppercase tracking-wider">Automated Scraper Specs</h4>
            <p className="text-[10px] text-slate-500 leading-normal">
              Silent background crawls automatically download de-duplicated messages, update risk factors, and append values to CSV backups.
            </p>
          </div>

          {/* Terminal output console */}
          <div className="flex-1 flex flex-col min-h-0 bg-darkCard border border-darkBorder rounded-xl overflow-hidden">
            <div className="p-3 border-b border-darkBorder bg-darkCard flex items-center justify-between shrink-0">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-emerald-600" />
                Live Scraper Output Logs
              </h3>
            </div>
            
            <div className="flex-1 bg-slate-900 p-3.5 font-mono text-[9px] text-emerald-400 overflow-y-auto space-y-1 shadow-inner select-all leading-normal">
              {channelLogs.map((log, idx) => (
                <div key={idx} className="break-all whitespace-pre-wrap">
                  {log}
                </div>
              ))}
              {channelLogs.length === 0 && (
                <div className="text-slate-500 italic">Logs are populated during execution runs...</div>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* AI Threat Intelligence Report Modal */}
      {showReportModal && reportMarkdown && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-cyan-500/35 w-full max-w-4xl h-[80vh] rounded-2xl overflow-hidden flex flex-col shadow-2xl relative animate-fade-in">
            {/* Header */}
            <div className="h-14 px-5 bg-darkCard border-b border-darkBorder flex items-center justify-between">
              <div className="flex items-center gap-2 text-cyan-600">
                <Cpu className="w-5 h-5 text-cyan-600" />
                <span className="text-sm font-bold uppercase tracking-wider text-slate-800">
                  AI Threat Intelligence Report: {channel.title}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {activeReportId && (
                  <a
                    href={`/api/reports/${activeReportId}/pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg transition-all shadow-md"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Download PDF
                  </a>
                )}
                <button
                  onClick={handleCopyReport}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs rounded-lg transition-all"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copied ? 'Copied!' : 'Copy Markdown'}
                </button>
                <button
                  onClick={() => setShowReportModal(false)}
                  className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors border border-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Markdown Display Body */}
            <div className="flex-1 p-6 overflow-y-auto font-mono text-xs text-slate-700 leading-relaxed bg-slate-50/50 select-text select-all whitespace-pre-wrap">
              {reportMarkdown}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
