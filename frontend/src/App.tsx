import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Navbar } from './components/layout/Navbar';
import { Sidebar } from './components/layout/Sidebar';
import { DashboardPage } from './pages/DashboardPage';
import { SettingsPage } from './pages/SettingsPage';
import { ChannelDetailPage } from './pages/ChannelDetailPage';
import { getScraperStatus } from './services/api';

export function App() {
  const [isScraping, setIsScraping] = useState(false);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const st = await getScraperStatus();
        setIsScraping(st.is_scraping);
      } catch (e) {
        // quiet fallback
      }
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Router>
      <Routes>
        {/* Detail page renders standalone in a new tab */}
        <Route path="/channel/:channelId" element={<ChannelDetailPage />} />
        
        {/* Main Application layouts */}
        <Route
          path="/*"
          element={
            <div className="min-h-screen bg-darkBg text-slate-100 flex flex-col font-sans">
              <Navbar isScraping={isScraping} />

              <div className="flex-1 flex overflow-hidden">
                <Sidebar />

                <main className="flex-1 p-5 overflow-y-auto h-[calc(100vh-3.5rem)]">
                  <Routes>
                    <Route path="/" element={<DashboardPage />} />
                    <Route path="/settings" element={<SettingsPage />} />
                  </Routes>
                </main>
              </div>
            </div>
          }
        />
      </Routes>
    </Router>
  );
}

export default App;
