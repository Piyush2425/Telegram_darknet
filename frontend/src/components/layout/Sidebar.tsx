import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, MessageSquare, PlayCircle, Cpu, FileText, Settings } from 'lucide-react';

const navItems = [
  { path: '/', label: 'Overview Dashboard', icon: LayoutDashboard },
  { path: '/telegram', label: 'Telegram Web View', icon: MessageSquare },
  { path: '/scraping', label: 'Scrape Controller', icon: PlayCircle },
  { path: '/intelligence', label: 'Threat Intelligence', icon: Cpu },
  { path: '/reports', label: 'Reports Archive', icon: FileText },
  { path: '/settings', label: 'Settings & Telethon', icon: Settings },
];

export const Sidebar: React.FC = () => {
  return (
    <aside className="w-64 bg-darkCard/60 border-r border-darkBorder flex flex-col justify-between shrink-0">
      <div className="py-4">
        <div className="px-4 mb-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
          Main Navigation
        </div>
        <nav className="space-y-1 px-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-gradient-to-r from-cyan-500/20 to-blue-500/10 text-cyan-400 border-l-2 border-cyan-400 font-semibold'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-darkBorder/40'
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

      <div className="p-4 m-3 rounded-xl bg-darkBorder/30 border border-darkBorder/50 text-xs">
        <div className="flex items-center gap-2 font-semibold text-cyan-400 mb-1">
          <div className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
          LLM Engine Ready
        </div>
        <p className="text-slate-400 text-[11px]">
          Threat extractions enabled for IOCs, CVEs, Leaked Combo Lists & Crypto Wallets.
        </p>
      </div>
    </aside>
  );
};
