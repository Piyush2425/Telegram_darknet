import { useMemo, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from '@/components/sidebar/Sidebar';
import { Navbar } from '@/components/navbar/Navbar';

interface AppShellProps {
  telegramStatus?: string;
  mongodbStatus?: string;
  currentUser?: string;
  onRefresh: () => void;
}

export function AppShell({ telegramStatus, mongodbStatus, currentUser, onRefresh }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);

  const shellClasses = useMemo(
    () => ['min-h-screen text-slate-100', collapsed ? 'grid grid-cols-[92px_minmax(0,1fr)]' : 'grid grid-cols-[280px_minmax(0,1fr)]'].join(' '),
    [collapsed],
  );

  return (
    <div className={shellClasses}>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((value) => !value)} />

      <div className="min-w-0">
        <Navbar
          telegramStatus={telegramStatus}
          mongodbStatus={mongodbStatus}
          currentUser={currentUser}
          onRefresh={onRefresh}
        />

        <main className="px-4 py-6 lg:px-6">
          <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
