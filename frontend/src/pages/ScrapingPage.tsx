import React, { useEffect, useState } from 'react';
import { PlayCircle, Terminal, CheckCircle2, Radio, ToggleLeft, ToggleRight } from 'lucide-react';
import { getChannels, toggleChannelMonitoring, startScraping, getScraperStatus } from '../services/api';
import { Channel, ScraperStatus } from '../types';

export const ScrapingPage: React.FC = () => {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [status, setStatus] = useState<ScraperStatus>({ is_scraping: false, progress: 0, current_channel: '', logs: [] });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadChannels();
    const interval = setInterval(checkStatus, 1000);
    return () => clearInterval(interval);
  }, []);

  const loadChannels = async () => {
    const data = await getChannels();
    setChannels(data);
  };

  const checkStatus = async () => {
    try {
      const st = await getScraperStatus();
      setStatus(st);
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggle = async (id: string) => {
    const res = await toggleChannelMonitoring(id);
    setChannels(prev => prev.map(c => c.id === id ? { ...c, is_monitored: res.is_monitored } : c));
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Radio className="w-5 h-5 text-cyan-400" />
            Telegram Scraper & Telethon Controller
          </h2>
          <p className="text-xs text-slate-400">Configure target darknet channels and launch automated message collection.</p>
        </div>

        <button
          onClick={handleStartScrape}
          disabled={status.is_scraping || monitoredList.length === 0}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg ${
            status.is_scraping || monitoredList.length === 0
              ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
              : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-cyan-500/25'
          }`}
        >
          <PlayCircle className={`w-5 h-5 ${status.is_scraping ? 'animate-spin' : ''}`} />
          {status.is_scraping ? `Scraping (${status.progress}%)...` : 'Initiate Scrape Run'}
        </button>
      </div>

      {/* Progress Bar */}
      {status.is_scraping && (
        <div className="glass-card p-5 rounded-2xl border border-amber-500/30 bg-amber-500/5 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold text-amber-400">
            <span>Scraping Active: @{status.current_channel}</span>
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

      {/* Channels Selector & Log Terminal */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Select Target Channels */}
        <div className="glass-card p-5 rounded-2xl border border-darkBorder space-y-4">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider text-slate-400">
            Target Channels Selection ({monitoredList.length} Selected)
          </h3>

          <div className="space-y-2">
            {channels.map((ch) => (
              <div
                key={ch.id}
                onClick={() => handleToggle(ch.id)}
                className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                  ch.is_monitored 
                    ? 'bg-cyan-500/10 border-cyan-500/30 text-white' 
                    : 'bg-darkCard border-darkBorder text-slate-400 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="text-xs font-bold flex items-center gap-2">
                    @{ch.username}
                    <span className="text-[10px] text-slate-500">({ch.category})</span>
                  </div>
                  <div className="text-[11px] text-slate-400">{ch.member_count.toLocaleString()} subscribers</div>
                </div>

                {ch.is_monitored ? (
                  <ToggleRight className="w-6 h-6 text-cyan-400" />
                ) : (
                  <ToggleLeft className="w-6 h-6 text-slate-600" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Live Terminal Log Stream */}
        <div className="glass-card p-5 rounded-2xl border border-darkBorder flex flex-col h-[400px]">
          <div className="flex items-center justify-between pb-3 border-b border-darkBorder mb-3">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-300">
              <Terminal className="w-4 h-4 text-emerald-400" />
              Live Telethon Terminal Feed
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
              <div className="text-slate-600 italic">Terminal standing by. Trigger a scraping run to view live output logs...</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
