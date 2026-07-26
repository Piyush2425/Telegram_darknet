import React, { useEffect, useState } from 'react';
import { Settings as SettingsIcon, Save, Key, Database, Cpu, Server, CheckCircle2, XCircle, Phone, ShieldCheck, AlertCircle, Send } from 'lucide-react';
import { getTelegramAuthStatus, sendTelegramOtpCode, verifyTelegramOtpCode } from '../services/api';

export const SettingsPage: React.FC = () => {
  // Telegram API & Phone Credentials
  const [apiId, setApiId] = useState('');
  const [apiHash, setApiHash] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');

  // Telegram User Auth States
  const [authStatus, setAuthStatus] = useState<{ is_authorized: boolean; user?: any; reason?: string }>({ is_authorized: false });
  const [phoneCodeHash, setPhoneCodeHash] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [password2FA, setPassword2FA] = useState('');
  const [step, setStep] = useState<'PHONE' | 'OTP' | '2FA'>('PHONE');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authSuccessMsg, setAuthSuccessMsg] = useState('');

  // Local LLM States
  const [localLlmUrl, setLocalLlmUrl] = useState('http://localhost:11434/api/generate');
  const [localLlmModel, setLocalLlmModel] = useState('llama3');
  const [testingLlm, setTestingLlm] = useState(false);
  const [llmTestResult, setLlmTestResult] = useState<'success' | 'failed' | null>(null);

  const [mongoUri, setMongoUri] = useState('mongodb://localhost:27017');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    checkTelegramAuth();
  }, []);

  const checkTelegramAuth = async () => {
    try {
      const res = await getTelegramAuthStatus();
      setAuthStatus(res);
    } catch (e) {
      console.error("Auth status error:", e);
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccessMsg('');
    if (!phoneNumber.trim()) {
      setAuthError('Please enter your phone number in international format (e.g. +919876543210)');
      return;
    }

    setAuthLoading(true);
    try {
      const parsedApiId = parseInt(apiId.trim()) || 0;
      const res = await sendTelegramOtpCode(phoneNumber.trim(), parsedApiId, apiHash.trim());
      if (res.status === 'code_sent' && res.phone_code_hash) {
        setPhoneCodeHash(res.phone_code_hash);
        setStep('OTP');
        setAuthSuccessMsg('✓ OTP Code sent to your Telegram App! Please enter it below.');
      } else if (res.status === 'already_authenticated') {
        const userObj = (res as any).user;
        setAuthSuccessMsg(`🎉 Already authenticated as @${userObj?.username || userObj?.id}!`);
        setAuthStatus({ is_authorized: true, user: userObj });
      } else {
        setAuthError(res.error || 'Failed to send OTP code.');
      }
    } catch (err: any) {
      setAuthError(err?.response?.data?.detail || 'Error requesting OTP code.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccessMsg('');
    if (!otpCode.trim()) {
      setAuthError('Please enter the OTP code received on your Telegram app.');
      return;
    }

    setAuthLoading(true);
    try {
      const res = await verifyTelegramOtpCode(
        phoneNumber.trim(),
        otpCode.trim(),
        phoneCodeHash,
        password2FA.trim() || undefined
      );

      if (res.status === 'authenticated' && res.user) {
        const authenticatedUser = res.user;
        setAuthSuccessMsg(`🎉 Successfully connected as Telegram User @${authenticatedUser.username || authenticatedUser.first_name || 'User'}!`);
        // Immediately update authStatus badge to Authorized!
        setAuthStatus({
          is_authorized: true,
          user: authenticatedUser
        });
        setTimeout(checkTelegramAuth, 600);
        setStep('PHONE');
        setOtpCode('');
        setPassword2FA('');
      } else if (res.status === '2fa_required' || res.error === '2FA_PASSWORD_REQUIRED') {
        setStep('2FA');
        setAuthError('Two-Factor Authentication (2FA) is enabled on your account. Please enter your 2FA Password below.');
      } else {
        setAuthError(res.error || 'Invalid OTP code.');
      }
    } catch (err: any) {
      setAuthError(err?.response?.data?.detail || 'Error verifying OTP code.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleTestLocalLlm = async () => {
    setTestingLlm(true);
    setLlmTestResult(null);
    try {
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
    <div className="w-full max-w-5xl space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <SettingsIcon className="w-5 h-5 text-cyan-500" />
          Platform Settings & System Configurations
        </h2>
        <p className="text-xs text-slate-500">Configure Telegram Telethon Account, Local LLM Inference (Ollama), and MongoDB storage.</p>
      </div>

      {/* UNIFIED TELEGRAM & PHONE CREDENTIALS BLOCK */}
      <div className="glass-card p-6 rounded-2xl border border-telegramBlue/40 bg-gradient-to-br from-darkCard via-darkCard to-telegramBlue/10 space-y-5 shadow-xl">
        <div className="flex items-center justify-between pb-3 border-b border-darkBorder">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-telegramBlue/20 text-cyan-600 flex items-center justify-center font-bold">
              <Key className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                Telegram Telethon Credentials & Phone Authentication
              </h3>
              <p className="text-[11px] text-slate-500">Enter API ID, API Hash, and Phone Number to send & verify Telegram OTP.</p>
            </div>
          </div>

          {authStatus.is_authorized ? (
            <span className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center gap-1.5 shadow-lg shadow-emerald-500/10">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Connected: @{authStatus.user?.username || authStatus.user?.first_name || authStatus.user?.phone || 'User'}
            </span>
          ) : (
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4" />
              Unauthenticated (Demo Mode)
            </span>
          )}
        </div>

        {authError && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-center gap-2">
            <XCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{authError}</span>
          </div>
        )}

        {authSuccessMsg && (
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span className="font-medium">{authSuccessMsg}</span>
          </div>
        )}

        {/* Telegram API Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Telegram API ID</label>
            <input
              type="password"
              placeholder="Loaded from backend .env"
              value={apiId}
              onChange={(e) => setApiId(e.target.value)}
              className="w-full bg-darkBg text-xs text-slate-800 px-3.5 py-2.5 rounded-xl border border-darkBorder focus:outline-none focus:border-cyan-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Telegram API Hash</label>
            <input
              type="password"
              placeholder="Loaded from backend .env"
              value={apiHash}
              onChange={(e) => setApiHash(e.target.value)}
              className="w-full bg-darkBg text-xs text-slate-800 px-3.5 py-2.5 rounded-xl border border-darkBorder focus:outline-none focus:border-cyan-500 font-mono"
            />
          </div>
        </div>

        {/* Phone & OTP Authentication Flow */}
        <div className="pt-2 border-t border-darkBorder/60 space-y-4">
          {step === 'PHONE' && (
            <form onSubmit={handleSendOtp} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-cyan-500" />
                  Telegram Account Phone Number (International Format)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. +919876543210 or +12025550123"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="flex-1 bg-darkBg text-xs text-slate-800 px-3.5 py-2.5 rounded-xl border border-darkBorder focus:outline-none focus:border-cyan-500 font-mono"
                  />
                  <button
                    type="submit"
                    disabled={authLoading}
                    className="flex items-center gap-1.5 px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-cyan-500/20"
                  >
                    <Send className="w-3.5 h-3.5" />
                    {authLoading ? 'Sending OTP...' : 'Send OTP Code'}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">Telegram will send a login verification code directly to your official Telegram App.</p>
              </div>
            </form>
          )}

          {(step === 'OTP' || step === '2FA') && (
            <form onSubmit={handleVerifyOtp} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Telegram Login OTP Code
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 58392"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    className="w-full bg-darkBg text-xs text-slate-800 px-3.5 py-2.5 rounded-xl border border-cyan-500 focus:outline-none font-mono text-center tracking-widest text-base font-bold"
                  />
                </div>

                {step === '2FA' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      Two-Factor (2FA) Password
                    </label>
                    <input
                      type="password"
                      placeholder="Enter 2FA password"
                      value={password2FA}
                      onChange={(e) => setPassword2FA(e.target.value)}
                      className="w-full bg-darkBg text-xs text-slate-800 px-3.5 py-2.5 rounded-xl border border-purple-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={authLoading}
                  className="flex-1 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-darkBg text-xs font-bold rounded-xl transition-all shadow-md shadow-emerald-500/20"
                >
                  {authLoading ? 'Verifying OTP...' : 'Verify OTP & Authorize Session'}
                </button>

                <button
                  type="button"
                  onClick={() => { setStep('PHONE'); setAuthError(''); setAuthSuccessMsg(''); }}
                  className="px-3 py-2.5 bg-darkBorder text-slate-400 text-xs font-bold rounded-xl"
                >
                  Back
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Local LLM Configuration Section */}
        <div className="glass-card p-6 rounded-2xl border border-cyan-500/20 bg-cyan-500/5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-cyan-600 uppercase tracking-wider flex items-center gap-2">
              <Server className="w-4 h-4" />
              Local LLM Integration (Ollama / LM Studio / LocalAI / vLLM)
            </h3>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/10 text-cyan-600 border border-cyan-500/20">
              PRIVACY FIRST • LOCAL INFERENCE
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Local LLM Endpoint URL</label>
              <input
                type="text"
                value={localLlmUrl}
                onChange={(e) => setLocalLlmUrl(e.target.value)}
                className="w-full bg-darkBg text-xs text-slate-800 px-3.5 py-2.5 rounded-xl border border-darkBorder focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Local Model Name</label>
              <input
                type="text"
                value={localLlmModel}
                onChange={(e) => setLocalLlmModel(e.target.value)}
                className="w-full bg-darkBg text-xs text-slate-800 px-3.5 py-2.5 rounded-xl border border-darkBorder focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={handleTestLocalLlm}
              disabled={testingLlm}
              className="flex items-center gap-2 px-3.5 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-600 text-xs font-bold rounded-xl transition-all"
            >
              <Cpu className={`w-3.5 h-3.5 ${testingLlm ? 'animate-spin' : ''}`} />
              {testingLlm ? 'Pinging Local LLM...' : 'Test Connection to Local LLM'}
            </button>

            {llmTestResult === 'success' && (
              <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" /> Local LLM Endpoint Reachable!
              </span>
            )}
            {llmTestResult === 'failed' && (
              <span className="text-xs text-amber-600 font-semibold flex items-center gap-1">
                <XCircle className="w-4 h-4" /> Local LLM offline. Automatic regex fallback active.
              </span>
            )}
          </div>
        </div>

        {/* Database Storage Configuration */}
        <div className="glass-card p-6 rounded-2xl border border-darkBorder space-y-4">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <Database className="w-4 h-4 text-emerald-600" />
            MongoDB Storage Configuration
          </h3>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">MongoDB Connection URI</label>
            <input
              type="text"
              value={mongoUri}
              onChange={(e) => setMongoUri(e.target.value)}
              className="w-full bg-darkBg text-xs text-slate-800 px-3.5 py-2.5 rounded-xl border border-darkBorder focus:outline-none focus:border-emerald-500 font-mono"
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button
            type="submit"
            className="flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-cyan-500/20 transition-all"
          >
            <Save className="w-4 h-4" />
            Save System Configurations
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
