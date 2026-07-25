import { Suspense, lazy, useMemo } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/layouts/AppShell';
import { useAsyncQuery } from '@/hooks/useAsyncQuery';
import { fetchDashboard, fetchStatus } from '@/services/api';

const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage').then((module) => ({ default: module.DashboardPage })));
const MessagesPage = lazy(() => import('@/pages/messages/MessagesPage').then((module) => ({ default: module.MessagesPage })));
const CredentialsPage = lazy(() => import('@/pages/credentials/CredentialsPage').then((module) => ({ default: module.CredentialsPage })));
const ReportsPage = lazy(() => import('@/pages/reports/ReportsPage').then((module) => ({ default: module.ReportsPage })));
const MonitoringPage = lazy(() => import('@/pages/monitoring/MonitoringPage').then((module) => ({ default: module.MonitoringPage })));
const TelegramExplorerPage = lazy(() => import('@/pages/telegram-explorer/TelegramExplorerPage').then((module) => ({ default: module.TelegramExplorerPage })));
const LogsPage = lazy(() => import('@/pages/logs/LogsPage').then((module) => ({ default: module.LogsPage })));
const SettingsPage = lazy(() => import('@/pages/settings/SettingsPage').then((module) => ({ default: module.SettingsPage })));
const SchedulerPage = lazy(() => import('@/pages/scheduler/SchedulerPage').then((module) => ({ default: module.SchedulerPage })));
const ScraperPage = lazy(() => import('@/pages/scraper/ScraperPage').then((module) => ({ default: module.ScraperPage })));
const AnalyticsPage = lazy(() => import('@/pages/analytics/AnalyticsPage').then((module) => ({ default: module.AnalyticsPage })));
const ExportsPage = lazy(() => import('@/pages/exports/ExportsPage').then((module) => ({ default: module.ExportsPage })));

export default function App() {
  const routeShell = useMemo(
    () => (
      <div className="flex min-h-[40vh] items-center justify-center rounded-[24px] border border-white/10 bg-white/5">
        <div className="flex items-center gap-3 text-sm text-slate-300">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-300 border-t-transparent" />
          Loading page
        </div>
      </div>
    ),
    [],
  );

  const shellDashboard = useAsyncQuery(fetchDashboard, { refreshIntervalMs: 30000 });
  const shellStatus = useAsyncQuery(fetchStatus, { refreshIntervalMs: 30000 });

  return (
    <BrowserRouter>
      <Suspense fallback={routeShell}>
        <Routes>
            <Route
              element={
                <AppShell
                telegramStatus={shellDashboard.data?.telegram_status ?? (shellStatus.data?.client_connected ? 'Connected' : 'Disconnected')}
                mongodbStatus={shellDashboard.data?.mongodb_status ?? shellStatus.data?.mongodb_status ?? 'Unknown'}
                currentUser="Operator"
                onRefresh={() => {
                  void shellDashboard.refetch();
                  void shellStatus.refetch();
                }}
              />
              }
            >
            <Route index element={<DashboardPage />} />
            <Route path="monitoring" element={<MonitoringPage />} />
            <Route path="monitoring/:telegramId" element={<MonitoringPage />} />
            <Route path="messages" element={<MessagesPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="credentials" element={<CredentialsPage />} />
            <Route path="explorer" element={<TelegramExplorerPage />} />
            <Route path="logs" element={<LogsPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="scheduler" element={<SchedulerPage />} />
            <Route path="scraper" element={<ScraperPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="exports" element={<ExportsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
