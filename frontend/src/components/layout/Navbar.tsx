import React from 'react';
import { Shield, Radio, Terminal, Cpu, Bell } from 'lucide-react';

interface NavbarProps {
  isScraping: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({ isScraping }) => {
  return (
    <header className="h-16 bg-darkCard/80 backdrop-blur-md border-b border-darkBorder px-6 flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
          <Shield className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="font-bold text-lg text-white flex items-center gap-2">
            Telegram Darknet Monitor
            <span className="px-2 py-0.5 text-xs font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 rounded-full">
              CTI v1.0
            </span>
          </h1>
          <p className="text-xs text-slate-400">Cyber Threat Intelligence & LLM Intelligence Platform</p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Scraping Status Pill */}
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${
          isScraping 
            ? 'bg-amber-500/10 border-amber-500/30 text-amber-400 animate-pulse' 
            : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
        }`}>
          <Radio className={`w-3.5 h-3.5 ${isScraping ? 'animate-spin' : ''}`} />
          <span>{isScraping ? 'Scraping Active...' : 'System Idle (Ready)'}</span>
        </div>

        <div className="w-px h-6 bg-darkBorder" />

        <div className="flex items-center gap-2">
          <button className="p-2 rounded-lg bg-darkBorder/50 text-slate-300 hover:text-white hover:bg-darkBorder transition-colors relative">
            <Bell className="w-4 h-4" />
            <span className="w-2 h-2 rounded-full bg-cyan-400 absolute top-1.5 right-1.5" />
          </button>

          <div className="flex items-center gap-2 pl-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center font-bold text-xs">
              CTI
            </div>
            <div className="hidden sm:block text-left">
              <div className="text-xs font-medium text-white">Threat Analyst</div>
              <div className="text-[10px] text-slate-400">SecOps Team</div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
