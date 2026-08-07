import React, { useState, useEffect, useRef } from 'react';
import { Shield, Radio, Bell, RefreshCw, PlayCircle, Cpu, FileText, AlertTriangle, XCircle, Check } from 'lucide-react';
import { syncTelegramChannels, startScraping, getNotifications, markNotificationsRead } from '../../services/api';

interface NavbarProps {
  isScraping: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({ isScraping }) => {
  const [syncing, setSyncing] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifs = async () => {
    try {
      const data = await getNotifications();
      setNotifications(data);
    } catch (e) {
      console.error("Notifications fetch error:", e);
    }
  };

  useEffect(() => {
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (dropdownOpen) {
      fetchNotifs();
    }
  }, [dropdownOpen]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

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

  const handleMarkAllRead = async () => {
    try {
      await markNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (e) {
      console.error(e);
    }
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  const renderNotifIcon = (type: string) => {
    switch (type) {
      case 'scrape':
        return <Radio className="w-3.5 h-3.5 text-cyan-400" />;
      case 'analysis':
        return <Cpu className="w-3.5 h-3.5 text-emerald-400" />;
      case 'report':
        return <FileText className="w-3.5 h-3.5 text-blue-400" />;
      case 'warning':
        return <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />;
      case 'error':
        return <XCircle className="w-3.5 h-3.5 text-rose-400" />;
      default:
        return <Bell className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  return (
    <header className="h-14 bg-darkCard border-b border-darkBorder px-5 flex items-center justify-between sticky top-0 z-30 shadow-md">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/10">
          <Shield className="w-4 h-4 text-white" />
        </div>
        <div className="flex items-center gap-2">
          <h1 className="font-bold text-xs text-slate-800 uppercase tracking-wider">
            Telegram Darknet Monitor
          </h1>
          <span className="px-1.5 py-0.5 text-[9px] font-bold bg-cyan-500/10 text-cyan-600 border border-cyan-500/20 rounded">
            CTI v1.0
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* System status indicator pill */}
        <div className="flex items-center gap-2 bg-darkBg px-2.5 py-1 rounded-lg border border-darkBorder text-[11px] font-medium text-slate-600">
          <div className={`w-2 h-2 rounded-full ${isScraping ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
          <span>{isScraping ? 'System Scraping' : 'System Idle'}</span>
        </div>

        <div className="w-px h-5 bg-darkBorder" />

        <div className="flex items-center gap-3 relative" ref={dropdownRef}>
          {/* Bell Icon Trigger */}
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className={`p-1.5 rounded-lg transition-colors relative hover:bg-slate-100 ${dropdownOpen ? 'text-slate-800' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 text-[9px] font-bold text-white flex items-center justify-center rounded-full animate-bounce">
                {unreadCount}
              </span>
            )}
          </button>

          {/* Notifications Dropdown Panel */}
          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 glass-card rounded-xl border border-darkBorder/60 shadow-2xl p-4 space-y-3 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex items-center justify-between border-b border-darkBorder/50 pb-2">
                <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <Bell className="w-3.5 h-3.5 text-cyan-500" />
                  Notifications logs
                </span>
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="text-[10px] font-bold text-cyan-600 hover:text-cyan-500 transition-colors flex items-center gap-1"
                  >
                    <Check className="w-3 h-3" />
                    Mark all read
                  </button>
                )}
              </div>

              <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                {notifications.length === 0 ? (
                  <div className="text-center py-6 text-slate-400 text-xs">
                    No notifications logged today.
                  </div>
                ) : (
                  notifications.map((notif) => (
                    <div
                      key={notif.id}
                      className={`p-2.5 rounded-lg border text-xs flex items-start gap-2.5 transition-all ${
                        notif.read
                          ? 'bg-transparent border-darkBorder/30 text-slate-400'
                          : 'bg-blue-500/5 border-blue-500/20 text-slate-700 shadow-sm'
                      }`}
                    >
                      <div className="mt-0.5 shrink-0 bg-slate-100 p-1 rounded-md border border-darkBorder/40">
                        {renderNotifIcon(notif.type)}
                      </div>
                      <div className="flex-1 space-y-1">
                        <p className="leading-relaxed text-[11px] font-mono break-words">{notif.message}</p>
                        <span className="block text-[9px] text-slate-400 font-medium">{notif.timestamp} IST</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          <div className="w-7 h-7 rounded-full bg-purple-600/10 border border-purple-500/20 text-purple-600 flex items-center justify-center font-bold text-xs shadow-sm">
            CT
          </div>
        </div>
      </div>
    </header>
  );
};
