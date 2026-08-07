import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Navbar } from './components/layout/Navbar';
import { Sidebar } from './components/layout/Sidebar';
import { DashboardPage } from './pages/DashboardPage';
import { SettingsPage } from './pages/SettingsPage';
import { ChannelDetailPage } from './pages/ChannelDetailPage';
import { GlobalSearchPage } from './pages/GlobalSearchPage';
import { getScraperStatus } from './services/api';

export function App() {
  const [isScraping, setIsScraping] = useState(false);

  useEffect(() => {
    const eventSource = new EventSource('/api/scraper/stream');
    eventSource.onmessage = (event) => {
      try {
        const st = JSON.parse(event.data);
        setIsScraping(st.is_scraping);
      } catch (e) {
        // quiet fallback
      }
    };
    return () => eventSource.close();
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
                    <Route path="/search" element={<GlobalSearchPage />} />
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
