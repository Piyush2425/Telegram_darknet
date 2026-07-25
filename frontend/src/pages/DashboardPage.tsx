import React, { useEffect, useState } from 'react';
import { Shield, Bug, AlertTriangle, Key, Wallet, RefreshCw, Radio } from 'lucide-react';
import { getChannels, getMessages, getIntelligenceSummary, startScraping } from '../services/api';
import { Channel, Message, IntelligenceSummary } from '../types';

export const DashboardPage: React.FC = () => {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [summary, setSummary] = useState<IntelligenceSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [chData, msgData, sumData] = await Promise.all([
        getChannels(),
        getMessages(),
        getIntelligenceSummary(),
      ]);
      setChannels(chData);
      setMessages(msgData);
      setSummary(sumData);
    } catch (e) {
      console.error("Dashboard fetch error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const monitoredCount = channels.filter(c => c.is_monitored).length;
  const criticalCount = messages.filter(m => m.threat_level === 'CRITICAL').length;

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-cyan-950/40 via-darkCard to-blue-950/30 p-6 rounded-2xl border border-cyan-500/20">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-3">
            <Shield className="w-7 h-7 text-cyan-400" />
            Cyber Threat Intelligence Command Center
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Real-time automated Telegram darknet monitoring and LLM vulnerability extraction.
          </p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-darkBg font-semibold text-sm rounded-xl transition-all shadow-lg shadow-cyan-500/20"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh Intel
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card p-5 rounded-2xl flex items-center gap-4 border border-darkBorder">
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center font-bold text-xl">
            <Radio className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">Monitored Channels</div>
            <div className="text-2xl font-bold text-white">{monitoredCount} / {channels.length}</div>
          </div>
        </div>

        <div className="glass-card p-5 rounded-2xl flex items-center gap-4 border border-darkBorder">
          <div className="w-12 h-12 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center font-bold text-xl">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">Critical Threats</div>
            <div className="text-2xl font-bold text-rose-400">{criticalCount}</div>
          </div>
        </div>

        <div className="glass-card p-5 rounded-2xl flex items-center gap-4 border border-darkBorder">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold text-xl">
            <Bug className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">Extracted CVEs</div>
            <div className="text-2xl font-bold text-amber-400">{summary?.total_cves || 0}</div>
          </div>
        </div>

        <div className="glass-card p-5 rounded-2xl flex items-center gap-4 border border-darkBorder">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center font-bold text-xl">
            <Key className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-400 font-medium">Leaked Credentials</div>
            <div className="text-2xl font-bold text-emerald-400">{summary?.total_credentials || 0}</div>
          </div>
        </div>
      </div>

      {/* Main Grid: Live Threat Feed & Monitored Channels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Critical Messages Stream */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-rose-400" />
              High & Critical Cyber Threat Stream
            </h3>
            <span className="text-xs text-slate-400">Total Scraped: {messages.length}</span>
          </div>

          <div className="space-y-3">
            {messages.slice(0, 5).map((msg) => (
              <div key={msg.id} className="p-4 rounded-xl bg-darkCard border border-darkBorder hover:border-slate-700 transition-colors">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-cyan-400">@{msg.channel_username}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    msg.threat_level === 'CRITICAL' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                    msg.threat_level === 'HIGH' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                    'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                  }`}>
                    {msg.threat_level}
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed font-mono bg-darkBg/60 p-3 rounded-lg border border-white/5">
                  {msg.text}
                </p>
                <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2">
                  <span>Views: {msg.views}</span>
                  <span>{new Date(msg.date).toLocaleString()}</span>
                </div>
              </div>
            ))}

            {messages.length === 0 && (
              <div className="p-8 text-center text-slate-500 text-sm glass-card rounded-xl">
                No messages scraped yet. Go to Scraper Controller to run initial data collection.
              </div>
            )}
          </div>
        </div>

        {/* Monitored Channels Widget */}
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-white">Darknet Channels</h3>
          <div className="space-y-2">
            {channels.map((ch) => (
              <div key={ch.id} className="p-3 rounded-xl bg-darkCard border border-darkBorder flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    @{ch.username}
                    {ch.is_monitored && (
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400">{ch.category} • {ch.member_count.toLocaleString()} members</div>
                </div>
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                  ch.is_monitored ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-800 text-slate-500'
                }`}>
                  {ch.is_monitored ? 'Active' : 'Disabled'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
