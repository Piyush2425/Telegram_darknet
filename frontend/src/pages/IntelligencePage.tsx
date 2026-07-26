import React, { useEffect, useState } from 'react';
import { Cpu, Bug, Key, Wallet, Link, ShieldAlert, Hash } from 'lucide-react';
import { getIntelligenceSummary } from '../services/api';
import { IntelligenceSummary } from '../types';

export const IntelligencePage: React.FC = () => {
  const [summary, setSummary] = useState<IntelligenceSummary | null>(null);
  const [activeTab, setActiveTab] = useState<'cves' | 'credentials' | 'iocs' | 'wallets' | 'malware'>('cves');

  useEffect(() => {
    getIntelligenceSummary().then(setSummary).catch(console.error);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <Cpu className="w-5 h-5 text-cyan-600" />
          LLM Cyber Threat Intelligence Extractions
        </h2>
        <p className="text-xs text-slate-500">Structured threat indicators extracted automatically by Large Language Model (LLM) analysis.</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-darkBorder pb-3 overflow-x-auto">
        <button
          onClick={() => setActiveTab('cves')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'cves' ? 'bg-amber-500/10 text-amber-700 border border-amber-500/30' : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          <Bug className="w-4 h-4" />
          CVE Vulnerabilities ({summary?.total_cves || 0})
        </button>

        <button
          onClick={() => setActiveTab('credentials')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'credentials' ? 'bg-emerald-500/10 text-emerald-700 border border-emerald-500/30' : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          <Key className="w-4 h-4" />
          Leaked Credentials ({summary?.total_credentials || 0})
        </button>

        <button
          onClick={() => setActiveTab('iocs')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'iocs' ? 'bg-cyan-500/10 text-cyan-700 border border-cyan-500/30' : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          <Hash className="w-4 h-4" />
          IOC Hashes ({summary?.total_iocs || 0})
        </button>

        <button
          onClick={() => setActiveTab('wallets')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'wallets' ? 'bg-purple-500/10 text-purple-700 border border-purple-500/30' : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          <Wallet className="w-4 h-4" />
          Crypto Wallets ({summary?.total_wallets || 0})
        </button>

        <button
          onClick={() => setActiveTab('malware')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'malware' ? 'bg-rose-500/10 text-rose-700 border border-rose-500/30' : 'text-slate-500 hover:bg-slate-100'
          }`}
        >
          <ShieldAlert className="w-4 h-4" />
          Malware & Threat Actors
        </button>
      </div>

      {/* Tab Contents */}
      <div className="glass-card p-6 rounded-2xl border border-darkBorder min-h-[300px] bg-darkCard">
        {activeTab === 'cves' && (
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-amber-800 uppercase tracking-wider">Identified Software Vulnerabilities & Zero-Days</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {summary?.cves_list.map((cve, idx) => (
                <div key={idx} className="p-3.5 rounded-xl bg-slate-100 border border-amber-500/25 flex items-center justify-between font-mono text-xs text-amber-700">
                  <span>{cve}</span>
                  <span className="text-[10px] bg-amber-500/10 px-2 py-0.5 rounded text-amber-700 font-bold border border-amber-500/20">HIGH SEVERITY</span>
                </div>
              ))}
              {summary?.cves_list.length === 0 && (
                <div className="text-slate-500 text-xs italic">No CVEs extracted yet. Run scraper to process messages.</div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'credentials' && (
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-emerald-800 uppercase tracking-wider">Extracted Leaked Credentials & Combo Lines</h3>
            <div className="space-y-2">
              {summary?.leaked_credentials_list.map((cred, idx) => (
                <div key={idx} className="p-3 rounded-xl bg-slate-100 border border-emerald-500/25 font-mono text-xs text-emerald-700">
                  {cred}
                </div>
              ))}
              {summary?.leaked_credentials_list.length === 0 && (
                <div className="text-slate-500 text-xs italic">No leaked credentials extracted in recent runs.</div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'iocs' && (
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-cyan-800 uppercase tracking-wider">File Hashes & Malware Indicators (SHA256/MD5)</h3>
            <div className="space-y-2">
              {summary?.iocs_list.map((hash, idx) => (
                <div key={idx} className="p-3 rounded-xl bg-slate-100 border border-cyan-500/25 font-mono text-xs text-cyan-700 break-all">
                  {hash}
                </div>
              ))}
              {summary?.iocs_list.length === 0 && (
                <div className="text-slate-500 text-xs italic">No IOC file hashes identified.</div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'wallets' && (
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-purple-800 uppercase tracking-wider">Detected Cryptocurrency Addresses</h3>
            <div className="space-y-2">
              {summary?.crypto_wallets_list.map((w, idx) => (
                <div key={idx} className="p-3 rounded-xl bg-slate-100 border border-purple-500/25 font-mono text-xs text-purple-700 break-all">
                  {w}
                </div>
              ))}
              {summary?.crypto_wallets_list.length === 0 && (
                <div className="text-slate-500 text-xs italic">No crypto addresses detected.</div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'malware' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-bold text-rose-800 uppercase tracking-wider mb-2">Malware Families & Stealer Tools</h3>
              <div className="flex flex-wrap gap-2">
                {summary?.malware_families.map((m, idx) => (
                  <span key={idx} className="px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-700 font-bold text-xs">
                    {m}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold text-purple-800 uppercase tracking-wider mb-2">Attributed Threat Actors</h3>
              <div className="flex flex-wrap gap-2">
                {summary?.threat_actors.map((ta, idx) => (
                  <span key={idx} className="px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/30 text-purple-700 font-bold text-xs">
                    {ta}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
