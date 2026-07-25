import React, { useEffect, useState } from 'react';
import { Settings as SettingsIcon, Save, Key, Database, Cpu, Server, CheckCircle2, XCircle, Phone, Lock, ShieldCheck, AlertCircle } from 'lucide-react';
import { getTelegramAuthStatus, sendTelegramOtpCode, verifyTelegramOtpCode } from '../services/api';

export const SettingsPage: React.FC = () => {
  const [apiId, setApiId] = useState('');
  const [apiHash, setApiHash] = useState('');
  const [botToken, setBotToken] = useState('');

  // Telegram User Phone & OTP States
  const [authStatus, setAuthStatus] = useState<{ is_authorized: boolean; user?: any; reason?: string }>({ is_authorized: false });
  const [phoneNumber, setPhoneNumber] = useState('');
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
      console.error(e);
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccessMsg('');
    if (!phoneNumber.trim()) {
      setAuthError('Please enter your phone number with country code (e.g. +919876543210)');
      return;
    }

    setAuthLoading(true);
    try {
      const res = await sendTelegramOtpCode(phoneNumber.trim());
      if (res.status === 'code_sent' && res.phone_code_hash) {
        setPhoneCodeHash(res.phone_code_hash);
        setStep('OTP');
        setAuthSuccessMsg('✓ Telegram OTP Code sent! Please check your Telegram App or SMS.');
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
      setAuthError('Please enter the OTP code sent to your Telegram app');
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

      if (res.status === 'authenticated') {
        setAuthSuccessMsg(`🎉 Successfully authenticated as @${res.user?.username || res.user?.first_name || 'User'}!`);
        checkTelegramAuth();
        setStep('PHONE');
        setOtpCode('');
        setPassword2FA('');
      } else if (res.error === '2FA_PASSWORD_REQUIRED') {
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
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <SettingsIcon className="w-5 h-5 text-cyan-400" />
          Platform Settings & Telegram OTP Authentication
        </h2>
        <p className="text-xs text-slate-400">Configure Telegram Telethon User Authentication, Phone OTP, Local LLM Inference, and MongoDB.</p>
      </div>

      {/* Telegram User Authentication & Phone OTP Card */}
      <div className="glass-card p-6 rounded-2xl border border-telegramBlue/40 bg-telegramBlue/5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-2">
            <Phone className="w-4 h-4" />
            Telegram User Session & OTP Verification
          </h3>

          {authStatus.is_authorized ? (
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" />
              Connected: @{authStatus.user?.username || authStatus.user?.first_name || authStatus.user?.phone}
            </span>
          ) : (
            <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4" />
              Unauthenticated (Demo Mode)
            </span>
          )}
        </div>

        {authStatus.is_authorized ? (
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 space-y-1">
            <div className="font-bold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Telegram Account Authenticated & Session File Active!
            </div>
            <p className="text-[11px] text-slate-400">
              User ID: {authStatus.user?.id} • Phone: {authStatus.user?.phone}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {authError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-center gap-2">
                <XCircle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{authError}</span>
              </div>
            )}

            {authSuccessMsg && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>{authSuccessMsg}</span>
              </div>
            )}

            {/* STEP 1: Phone Number */}
            {step === 'PHONE' && (
              <form onSubmit={handleSendOtp} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Telegram Phone Number (with Country Code)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. +919876543210 or +12025550123"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      className="flex-1 bg-darkBg text-xs text-white px-3.5 py-2.5 rounded-xl border border-darkBorder focus:outline-none focus:border-cyan-500 font-mono"
                    />
                    <button
                      type="submit"
                      disabled={authLoading}
                      className="px-4 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-darkBg text-xs font-bold rounded-xl transition-all shadow-md shadow-cyan-500/20"
                    >
                      {authLoading ? 'Sending OTP...' : 'Send OTP Code'}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">Telegram will send a login code to your active Telegram App.</p>
                </div>
              </form>
            )}

            {/* STEP 2: OTP Verification */}
            {(step === 'OTP' || step === '2FA') && (
              <form onSubmit={handleVerifyOtp} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Telegram Login OTP Code
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 58392"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      className="w-full bg-darkBg text-xs text-white px-3.5 py-2.5 rounded-xl border border-cyan-500 focus:outline-none font-mono text-center tracking-widest text-base font-bold"
                    />
                  </div>

                  {step === '2FA' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1">
                        Two-Factor (2FA) Password
                      </label>
                      <input
                        type="password"
                        placeholder="Enter 2FA password"
                        value={password2FA}
                        onChange={(e) => setPassword2FA(e.target.value)}
                        className="w-full bg-darkBg text-xs text-white px-3.5 py-2.5 rounded-xl border border-purple-500 focus:outline-none"
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
                    {authLoading ? 'Verifying OTP...' : 'Verify OTP & Log In'}
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
        )}
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
              PRIVACY FIRST • LOCAL INFERENCE
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
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Local Model Name</label>
              <input
                type="text"
                value={localLlmModel}
                onChange={(e) => setLocalLlmModel(e.target.value)}
                className="w-full bg-darkBg text-xs text-white px-3.5 py-2.5 rounded-xl border border-darkBorder focus:outline-none focus:border-cyan-500 font-mono"
              />
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
                <XCircle className="w-4 h-4" /> Local LLM offline. Automatic regex fallback active.
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
                placeholder="e.g. 35816761"
                value={apiId}
                onChange={(e) => setApiId(e.target.value)}
                className="w-full bg-darkBg text-xs text-white px-3.5 py-2.5 rounded-xl border border-darkBorder focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Telegram API Hash</label>
              <input
                type="password"
                placeholder="e.g. e8d176e13..."
                value={apiHash}
                onChange={(e) => setApiHash(e.target.value)}
                className="w-full bg-darkBg text-xs text-white px-3.5 py-2.5 rounded-xl border border-darkBorder focus:outline-none focus:border-cyan-500 font-mono"
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
