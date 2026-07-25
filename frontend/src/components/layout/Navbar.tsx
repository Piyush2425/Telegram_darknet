import React, { useState } from 'react';
import { Shield, Radio, Bell, RefreshCw, PlayCircle } from 'lucide-react';
import { syncTelegramChannels, startScraping } from '../../services/api';

interface NavbarProps {
  isScraping: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({ isScraping }) => {
  const [syncing, setSyncing] = useState(false);

  const handleSync = async () => {
    setSyncing(true);
    try {
      await syncTelegramChannels();
      window.location.reload();
    } catch (e) {
      console.error(e);
    } finally {
      setSyncing(false);
    }
  };

  const handleScrapeAll = async () => {
    try {
      await startScraping();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <header className="h-16 bg-darkCard border-b border-darkBorder px-6 flex items-center justify-between sticky top-0 z-30 shadow-md">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/10">
          <Shield className="w-5 h-5 text-white" />
        </div>
        <div className="flex items-center gap-2">
          <h1 className="font-bold text-sm text-slate-100 uppercase tracking-wide">
            Telegram Darknet Monitor
          </h1>
          <span className="px-2 py-0.5 text-[10px] font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded">
            CTI v1.0
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* System status indicator pill */}
        <div className="flex items-center gap-2 bg-darkBg px-3 py-1.5 rounded-lg border border-darkBorder text-[11px] font-medium text-slate-400">
          <div className={`w-2 h-2 rounded-full ${isScraping ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500'}`} />
          <span>{isScraping ? 'System Scraping' : 'System Idle'}</span>
        </div>

        {/* Sync Channels Navbar Button */}
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-1.5 px-3 py-1.5 border border-darkBorder hover:border-slate-600 text-slate-300 hover:text-white text-xs font-bold rounded-lg transition-all"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
          Sync Channels
        </button>

        {/* Scrape Selected Navbar Button */}
        <button
          onClick={handleScrapeAll}
          disabled={isScraping}
          className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-all shadow-md shadow-blue-600/10"
        >
          <PlayCircle className="w-3.5 h-3.5" />
          Scrape Selected
        </button>

        <div className="w-px h-6 bg-darkBorder" />

        <div className="flex items-center gap-3">
          <button className="p-1.5 rounded-lg text-slate-400 hover:text-white transition-colors relative">
            <Bell className="w-4 h-4" />
          </button>

          <div className="w-8 h-8 rounded-full bg-purple-600/30 border border-purple-500/30 text-purple-400 flex items-center justify-center font-bold text-xs shadow-md">
            CT
          </div>
        </div>
      </div>
    </header>
  );
};
