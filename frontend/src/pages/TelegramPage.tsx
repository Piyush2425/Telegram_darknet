import React, { useEffect, useState } from 'react';
import { Search, Plus, Eye, MessageSquare, RefreshCw, ShieldCheck, Download } from 'lucide-react';
import { getChannels, getMessages, toggleChannelMonitoring, addCustomChannel, syncTelegramChannels } from '../services/api';
import { Channel, Message } from '../types';

export const TelegramPage: React.FC = () => {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [search, setSearch] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  // Add Channel Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const chs = await getChannels();
      setChannels(chs);
      if (chs.length > 0 && !selectedChannel) {
        setSelectedChannel(chs[0]);
        const msgs = await getMessages({ channel_id: chs[0].id });
        setMessages(msgs);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSyncRealChannels = async () => {
    setSyncing(true);
    setSyncMsg('');
    try {
      const res = await syncTelegramChannels();
      setChannels(res.channels);
      if (res.channels.length > 0) {
        setSelectedChannel(res.channels[0]);
        const msgs = await getMessages({ channel_id: res.channels[0].id });
        setMessages(msgs);
      }
      setSyncMsg(`✓ Imported ${res.imported_count} real channels/groups from your Telegram account!`);
      setTimeout(() => setSyncMsg(''), 4000);
    } catch (e) {
      console.error(e);
      setSyncMsg('⚠️ Sync failed. Please make sure your Telegram account is authorized in Settings.');
      setTimeout(() => setSyncMsg(''), 4000);
    } finally {
      setSyncing(false);
    }
  };

  const handleSelectChannel = async (ch: Channel) => {
    setSelectedChannel(ch);
    const msgs = await getMessages({ channel_id: ch.id });
    setMessages(msgs);
  };

  const handleToggleMonitoring = async (channelId: string) => {
    const res = await toggleChannelMonitoring(channelId);
    setChannels(prev => prev.map(c => c.id === channelId ? { ...c, is_monitored: res.is_monitored } : c));
    if (selectedChannel && selectedChannel.id === channelId) {
      setSelectedChannel(prev => prev ? { ...prev, is_monitored: res.is_monitored } : null);
    }
  };

  const handleAddChannelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim()) return;
    setAdding(true);
    try {
      const added = await addCustomChannel(newUsername);
      setChannels(prev => [...prev, added]);
      setSelectedChannel(added);
      setNewUsername('');
      setShowAddModal(false);
    } catch (err) {
      console.error(err);
    } finally {
      setAdding(false);
    }
  };

  const filteredChannels = channels.filter(c => 
    c.title.toLowerCase().includes(search.toLowerCase()) || 
    c.username.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="h-[calc(100vh-6.5rem)] flex bg-telegramDark rounded-2xl overflow-hidden border border-darkBorder shadow-2xl relative">
      {/* Left Chat List (Telegram Style) */}
      <div className="w-80 bg-darkCard/90 border-r border-darkBorder flex flex-col shrink-0">
        {/* Top Controls: Search, Sync & Add Channel */}
        <div className="p-3 border-b border-darkBorder space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">Telegram Channels</span>
            <div className="flex items-center gap-1">
              <button
                onClick={handleSyncRealChannels}
                disabled={syncing}
                title="Sync channels from your real Telegram account"
                className="flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 px-2 py-1 rounded-lg border border-emerald-500/30 transition-all"
              >
                <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
                {syncing ? 'Syncing...' : 'Sync Account'}
              </button>

              <button
                onClick={() => setShowAddModal(true)}
                className="flex items-center gap-1 text-[11px] font-bold text-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20 px-2 py-1 rounded-lg border border-cyan-500/30 transition-all"
              >
                <Plus className="w-3 h-3" />
                Add
              </button>
            </div>
          </div>

          {syncMsg && (
            <div className="text-[10px] font-medium text-emerald-400 p-1.5 rounded bg-emerald-500/10 border border-emerald-500/20">
              {syncMsg}
            </div>
          )}

          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search Telegram Channels..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-darkBg text-xs text-slate-800 pl-9 pr-3 py-2 rounded-xl border border-darkBorder focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>

        {/* Channels List */}
        <div className="flex-1 overflow-y-auto space-y-0.5 p-2">
          {filteredChannels.map((ch) => (
            <div
              key={ch.id}
              onClick={() => handleSelectChannel(ch)}
              className={`p-3 rounded-xl cursor-pointer transition-all flex items-center justify-between ${
                selectedChannel?.id === ch.id 
                  ? 'bg-slate-100 text-slate-800 font-bold border border-slate-200 shadow-sm' 
                  : 'hover:bg-darkBorder/40 text-slate-600'
              }`}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="w-10 h-10 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-600 flex items-center justify-center font-bold text-sm shrink-0">
                  {ch.title.substring(0, 2).toUpperCase()}
                </div>
                <div className="overflow-hidden">
                  <div className="text-xs font-semibold truncate text-slate-800">{ch.title}</div>
                  <div className="text-[10px] text-slate-500 truncate">@{ch.username}</div>
                </div>
              </div>

              {ch.is_monitored && (
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Right Chat Conversation View */}
      <div className="flex-1 flex flex-col bg-slate-50">
        {selectedChannel ? (
          <div className="h-14 px-6 bg-darkCard border-b border-darkBorder flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-cyan-500/10 text-cyan-600 flex items-center justify-center font-bold text-xs border border-cyan-500/20">
                {selectedChannel.title.substring(0, 2).toUpperCase()}
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">{selectedChannel.title}</h3>
                <p className="text-[11px] text-slate-500">@{selectedChannel.username} • {selectedChannel.member_count.toLocaleString()} subscribers</p>
              </div>
            </div>

            <button
              onClick={() => handleToggleMonitoring(selectedChannel.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                selectedChannel.is_monitored
                  ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 hover:bg-rose-500/20 hover:text-rose-600'
                  : 'bg-cyan-600 hover:bg-cyan-500 text-white'
              }`}
            >
              {selectedChannel.is_monitored ? 'Monitoring Enabled' : 'Enable Monitoring'}
            </button>
          </div>
        ) : (
          <div className="h-14 px-6 bg-darkCard border-b border-darkBorder flex items-center">
            <span className="text-xs text-slate-500">Select a Telegram Channel to view messages</span>
          </div>
        )}

        {/* Chat Message Stream */}
        <div className="flex-1 p-6 overflow-y-auto space-y-4">
          {messages.map((msg) => (
            <div key={msg.id} className="max-w-2xl bg-darkCard border border-darkBorder rounded-2xl p-4 shadow-sm hover:border-slate-300 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-cyan-600">{msg.sender}</span>
                  <span className="text-[10px] text-slate-500">• Real Telegram Post</span>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  msg.threat_level === 'CRITICAL' ? 'bg-rose-500/10 text-rose-600 border border-rose-500/20' :
                  msg.threat_level === 'HIGH' ? 'bg-amber-500/10 text-amber-600 border border-amber-500/20' :
                  'bg-blue-500/10 text-blue-600 border border-blue-500/20'
                }`}>
                  {msg.threat_level}
                </span>
              </div>

              <div className="text-xs text-slate-700 leading-relaxed font-mono whitespace-pre-wrap bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                {msg.text}
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2">
                <div className="flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5" />
                  <span>{msg.views} views</span>
                </div>
                <span>{new Date(msg.date).toLocaleString()}</span>
              </div>
            </div>
          ))}

          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-2">
              <MessageSquare className="w-12 h-12 opacity-30 text-slate-400" />
              <p className="text-sm font-medium">No messages collected for {selectedChannel?.title} yet.</p>
              <p className="text-xs text-slate-500">Go to "Scraper Controller" in the sidebar and click "Initiate Scrape Run" to fetch real messages from your Telegram account.</p>
            </div>
          )}
        </div>
      </div>

      {/* Add Custom Channel Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-darkCard border border-darkBorder w-full max-w-md p-6 rounded-2xl space-y-4 shadow-2xl">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Plus className="w-5 h-5 text-cyan-400" />
              Add Target Telegram Channel
            </h3>
            <p className="text-xs text-slate-400">Enter any public or private Telegram channel or group username to monitor.</p>

            <form onSubmit={handleAddChannelSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Telegram Username</label>
                <input
                  type="text"
                  placeholder="e.g. durov, cybersecurity_feed, breachforums"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="w-full bg-darkBg text-xs text-white px-3.5 py-2.5 rounded-xl border border-darkBorder focus:outline-none focus:border-cyan-500 font-mono"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-darkBorder text-slate-300 text-xs font-bold rounded-xl"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={adding}
                  className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-darkBg text-xs font-bold rounded-xl transition-all"
                >
                  {adding ? 'Adding...' : 'Add Channel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
