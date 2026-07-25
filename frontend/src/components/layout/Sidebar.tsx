import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Settings, Cpu, ShieldAlert, Key, Globe } from 'lucide-react';

const navItems = [
  { path: '/', label: 'Overview Dashboard', icon: LayoutDashboard },
  { path: '/settings', label: 'Settings & Telethon', icon: Settings },
];

export const Sidebar: React.FC = () => {
  return (
    <aside className="w-60 bg-darkCard border-r border-darkBorder flex flex-col justify-between shrink-0">
      <div className="py-4">
        <nav className="space-y-1 px-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                    isActive
                      ? 'bg-blue-600/10 text-blue-400 font-bold border-l-2 border-blue-500 shadow-inner'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-darkBg/50'
                  }`
                }
              >
                <Icon className="w-4 h-4" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* LLM Engine status widget matching the screenshot */}
      <div className="p-4 m-4 rounded-xl bg-darkBg border border-darkBorder space-y-3">
        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
          LLM Engine
        </div>
        <div className="flex items-center gap-2 text-xs font-bold text-emerald-400">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          Ready
        </div>
        
        <div className="space-y-2 border-t border-darkBorder/60 pt-3 text-[11px] text-slate-400 font-medium">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-3.5 h-3.5 text-blue-400" />
            IOC Extraction
          </div>
          <div className="flex items-center gap-2">
            <Globe className="w-3.5 h-3.5 text-blue-400" />
            URL Detection
          </div>
          <div className="flex items-center gap-2">
            <Cpu className="w-3.5 h-3.5 text-blue-400" />
            CVE Detection
          </div>
          <div className="flex items-center gap-2">
            <Key className="w-3.5 h-3.5 text-blue-400" />
            Wallet Detection
          </div>
        </div>
      </div>
    </aside>
  );
};
