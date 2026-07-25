import { useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import { ChevronLeft, Shield } from 'lucide-react';
import { navigationItems } from '@/types/navigation';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const sections = useMemo(() => {
    const map = new Map<string, typeof navigationItems>();
    for (const item of navigationItems) {
      const key = item.section ?? '';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return [...map.entries()];
  }, []);

  return (
    <aside
      className={`glass-panel sticky top-0 hidden h-screen flex-col border-r border-white/10 bg-slate-950/90 px-2.5 py-3 lg:flex ${collapsed ? 'w-[80px]' : 'w-[248px]'}`}
    >
      {/* Logo */}
      <div className="flex items-center justify-between gap-2 px-1.5 py-2">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-teal-500 text-slate-950 shadow-lg shadow-cyan-500/20">
            <Shield className="h-4 w-4" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-cyan-300/80">Darknet Monitor</p>
              <p className="truncate text-[11px] text-slate-400">Telegram Intelligence Platform</p>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <ChevronLeft className={`h-3.5 w-3.5 transition ${collapsed ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Navigation sections */}
      <nav className="mt-3.5 flex-1 space-y-1 overflow-y-auto pr-0.5 scrollbar-thin">
        {sections.map(([sectionName, items], sectionIndex) => (
          <div key={sectionName || 'default'} className={sectionIndex > 0 ? 'mt-4' : ''}>
            {/* Section header */}
            {sectionName && !collapsed && (
              <div className="mb-1.5 flex items-center gap-2 px-3 pt-1">
                <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">
                  {sectionName}
                </span>
                <span className="h-px flex-1 bg-white/5" />
              </div>
            )}
            {collapsed && sectionIndex > 0 && (
              <div className="mx-3 mb-2 mt-1 h-px bg-white/10" />
            )}

            {/* Items */}
            <div className="space-y-0.5">
              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.path === '/'}
                    className={({ isActive }) =>
                      [
                        'group relative flex items-center gap-2.5 rounded-2xl px-3 py-2 text-[12px] font-medium transition-all duration-200',
                        isActive
                          ? 'bg-cyan-400/10 text-cyan-100 shadow-[inset_0_0_0_1px_rgba(34,211,238,0.18),0_0_12px_rgba(34,211,238,0.06)]'
                          : 'text-slate-300 hover:bg-white/5 hover:text-white',
                      ].join(' ')
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.5)]" />
                        )}
                        <Icon className={`h-3.5 w-3.5 shrink-0 transition ${isActive ? 'text-cyan-300' : 'text-slate-400 group-hover:text-cyan-300'}`} />
                        {!collapsed && <span className="truncate">{item.label}</span>}
                      </>
                    )}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-2.5 text-center">
        {!collapsed ? (
          <div>
            <p className="text-[10px] font-medium text-slate-400">Darknet Monitor</p>
            <p className="text-[9px] text-slate-500">v1.0.0 — Flask Backend</p>
          </div>
        ) : (
          <p className="text-[10px] font-bold text-slate-400">DM</p>
        )}
      </div>
    </aside>
  );
}
