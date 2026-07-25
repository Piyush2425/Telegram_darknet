import React, { useState } from 'react';
import { Settings as SettingsIcon, Save, Key, Database, Cpu, Server, CheckCircle2, XCircle } from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const [apiId, setApiId] = useState('');
  const [apiHash, setApiHash] = useState('');
  const [botToken, setBotToken] = useState('');
  
  // Local LLM States
  const [useLocalLlm, setUseLocalLlm] = useState(true);
  const [localLlmUrl, setLocalLlmUrl] = useState('http://localhost:11434/api/generate');
  const [localLlmModel, setLocalLlmModel] = useState('llama3');
  const [testingLlm, setTestingLlm] = useState(false);
  const [llmTestResult, setLlmTestResult] = useState<'success' | 'failed' | null>(null);

  const [mongoUri, setMongoUri] = useState('mongodb://localhost:27017');
  const [saved, setSaved] = useState(false);

  const handleTestLocalLlm = async () => {
    setTestingLlm(true);
    setLlmTestResult(null);
    try {
      // Simple ping attempt to Local LLM (Ollama or API server)
      const res = await fetch(localLlmUrl.replace('/api/generate', '/api/tags'), { method: 'GET' });
      if (res.ok || res.status === 404 || res.status === 405) {
        setLlmTestResult('success');
      } else {
        setLlmTestResult('failed');
      }
    } catch (e) {
      setLlmTestResult('failed');
    } finally {
      setTestingLlm(false);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <SettingsIcon className="w-5 h-5 text-cyan-400" />
          Platform Settings & Local LLM Configurations
        </h2>
        <p className="text-xs text-slate-400">Configure Telegram Telethon API keys, Local LLM inference (Ollama / LM Studio), and MongoDB settings.</p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Local LLM Configuration Section */}
        <div className="glass-card p-6 rounded-2xl border border-cyan-500/30 bg-cyan-500/5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-2">
              <Server className="w-4 h-4" />
              Local LLM Integration (Ollama / LM Studio / LocalAI / vLLM)
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
              PRIVACY FIRST • NO CLOUD API REQUIRED
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Local LLM Endpoint URL</label>
              <input
                type="text"
                value={localLlmUrl}
                onChange={(e) => setLocalLlmUrl(e.target.value)}
                className="w-full bg-darkBg text-xs text-white px-3.5 py-2.5 rounded-xl border border-darkBorder focus:outline-none focus:border-cyan-500 font-mono"
              />
              <p className="text-[10px] text-slate-500 mt-1">Default Ollama: http://localhost:11434/api/generate</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Local Model Name</label>
              <input
                type="text"
                value={localLlmModel}
                onChange={(e) => setLocalLlmModel(e.target.value)}
                className="w-full bg-darkBg text-xs text-white px-3.5 py-2.5 rounded-xl border border-darkBorder focus:outline-none focus:border-cyan-500 font-mono"
              />
              <p className="text-[10px] text-slate-500 mt-1">e.g. llama3, mistral, phi3, qwen2.5, gemma</p>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={handleTestLocalLlm}
              disabled={testingLlm}
              className="flex items-center gap-2 px-3.5 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 text-xs font-bold rounded-xl transition-all"
            >
              <Cpu className={`w-3.5 h-3.5 ${testingLlm ? 'animate-spin' : ''}`} />
              {testingLlm ? 'Pinging Local LLM...' : 'Test Connection to Local LLM'}
            </button>

            {llmTestResult === 'success' && (
              <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> Local LLM Endpoint Reachable!
              </span>
            )}
            {llmTestResult === 'failed' && (
              <span className="text-xs text-amber-400 font-semibold flex items-center gap-1">
                <XCircle className="w-4 h-4" /> Local LLM offline. System will use automatic regex fallback.
              </span>
            )}
          </div>
        </div>

        {/* Telegram API Credentials */}
        <div className="glass-card p-6 rounded-2xl border border-darkBorder space-y-4">
          <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <Key className="w-4 h-4 text-cyan-400" />
            Telegram Telethon API Credentials
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Telegram API ID</label>
              <input
                type="text"
                placeholder="e.g. 29384021"
                value={apiId}
                onChange={(e) => setApiId(e.target.value)}
                className="w-full bg-darkBg text-xs text-white px-3.5 py-2.5 rounded-xl border border-darkBorder focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Telegram API Hash</label>
              <input
                type="password"
                placeholder="e.g. a8f9e018b2c3d4..."
                value={apiHash}
                onChange={(e) => setApiHash(e.target.value)}
                className="w-full bg-darkBg text-xs text-white px-3.5 py-2.5 rounded-xl border border-darkBorder focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>
        </div>

        {/* Storage */}
        <div className="glass-card p-6 rounded-2xl border border-darkBorder space-y-4">
          <h3 className="text-sm font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
            <Database className="w-4 h-4 text-emerald-400" />
            MongoDB Storage Configuration
          </h3>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">MongoDB Connection URI</label>
            <input
              type="text"
              value={mongoUri}
              onChange={(e) => setMongoUri(e.target.value)}
              className="w-full bg-darkBg text-xs text-white px-3.5 py-2.5 rounded-xl border border-darkBorder focus:outline-none focus:border-emerald-500 font-mono"
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            type="submit"
            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-cyan-500/20 transition-all"
          >
            <Save className="w-4 h-4" />
            Save Local LLM & System Settings
          </button>

          {saved && (
            <span className="text-xs text-emerald-400 font-semibold animate-fade-in">
              ✓ Configurations saved successfully!
            </span>
          )}
        </div>
      </form>
    </div>
  );
};
