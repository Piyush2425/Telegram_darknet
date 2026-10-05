import React, { useEffect, useState, useMemo, useRef } from 'react';
import { 
  BarChart3, Calendar, TrendingUp, Sparkles, Clock, ShieldAlert, 
  Layers, Search, Filter, ArrowRight, RefreshCw, Eye, MessageSquare, 
  Radio, CheckCircle2, ChevronRight, X, ExternalLink, Globe, AlertTriangle,
  TrendingDown, Activity, Zap, Compass, LineChart
} from 'lucide-react';
import { getDailyMessageStats, getChannels, getMessages } from '../services/api';
import { DailyStatsResponse, DailyStatItem, Channel, Message } from '../types';

export const AnalysisPage: React.FC = () => {
  const [dailyStats, setDailyStats] = useState<DailyStatsResponse | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dayMessages, setDayMessages] = useState<Message[]>([]);
  const [dayMessagesLoading, setDayMessagesLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [threatFilter, setThreatFilter] = useState<string>('ALL');

  // Timeframe filter state for chronological chart
  const [timeframe, setTimeframe] = useState<'7D' | '14D' | '30D' | 'ALL'>('30D');
  const [showTrendline, setShowTrendline] = useState(true);
  const [showForecast, setShowForecast] = useState(true);

  // Hover state for interactive SVG chart
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const svgContainerRef = useRef<SVGSVGElement | null>(null);

  const fetchStats = async (channelId?: string) => {
    setLoading(true);
    try {
      const [statsData, chData] = await Promise.all([
        getDailyMessageStats(channelId || undefined, 90),
        getChannels(),
      ]);
      setDailyStats(statsData);
      setChannels(chData);
    } catch (e) {
      console.error("Error fetching daily stats:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats(selectedChannelId);
  }, [selectedChannelId]);

  // When a day is clicked, fetch that day's messages to inspect
  const handleSelectDay = async (dateStr: string) => {
    if (selectedDate === dateStr) {
      setSelectedDate(null);
      setDayMessages([]);
      return;
    }
    setSelectedDate(dateStr);
    setDayMessagesLoading(true);
    try {
      const msgs = await getMessages({
        channel_id: selectedChannelId || undefined,
        date: dateStr,
      });
      setDayMessages(msgs);
    } catch (e) {
      console.error("Error loading day messages:", e);
    } finally {
      setDayMessagesLoading(false);
    }
  };

  // Chronological data for chart: sorted oldest -> newest (left -> right)
  const chronologicalData = useMemo(() => {
    if (!dailyStats || !dailyStats.daily_stats) return [];
    
    // Reverse because daily_stats comes sorted newest-first
    let list = [...dailyStats.daily_stats].reverse();

    if (timeframe === '7D') {
      list = list.slice(-7);
    } else if (timeframe === '14D') {
      list = list.slice(-14);
    } else if (timeframe === '30D') {
      list = list.slice(-30);
    }

    return list;
  }, [dailyStats, timeframe]);

  // Calculate 7-day Simple Moving Average (SMA) trendline for each point
  const chartPointsWithTrend = useMemo(() => {
    if (chronologicalData.length === 0) return [];
    
    return chronologicalData.map((item, idx, arr) => {
      // Calculate 7-day window average
      const windowStart = Math.max(0, idx - 6);
      const windowItems = arr.slice(windowStart, idx + 1);
      const sma = Math.round(
        windowItems.reduce((acc, curr) => acc + curr.count, 0) / windowItems.length
      );
      return {
        ...item,
        sma,
      };
    });
  }, [chronologicalData]);

  // Forecast future 3 days projection
  const forecastData = useMemo(() => {
    if (chartPointsWithTrend.length < 2) return [];
    const lastItem = chartPointsWithTrend[chartPointsWithTrend.length - 1];
    const prevItem = chartPointsWithTrend[Math.max(0, chartPointsWithTrend.length - 4)];
    
    const velocity = (lastItem.sma - prevItem.sma) / Math.max(1, chartPointsWithTrend.length - 1 - (chartPointsWithTrend.length - 4));
    
    const lastDate = new Date(lastItem.date);
    const forecasts = [];
    
    for (let i = 1; i <= 3; i++) {
      const nextDate = new Date(lastDate);
      nextDate.setDate(lastDate.getDate() + i);
      const projectedCount = Math.max(0, Math.round(lastItem.sma + velocity * i));
      
      const day = nextDate.getDate();
      const suffix = (day % 10 === 1 && day !== 11) ? 'st' :
                     (day % 10 === 2 && day !== 12) ? 'nd' :
                     (day % 10 === 3 && day !== 13) ? 'rd' : 'th';
      const formatted = `${day}${suffix} ${nextDate.toLocaleString('default', { month: 'short' })}`;
      
      forecasts.push({
        date: nextDate.toISOString().slice(0, 10),
        display_day: formatted,
        formatted_date: `${formatted} (Projected)`,
        count: projectedCount,
        isForecast: true
      });
    }
    return forecasts;
  }, [chartPointsWithTrend]);

  // Max value calculation for chart scaling
  const maxVolume = useMemo(() => {
    const historicalMax = chartPointsWithTrend.reduce((max, p) => Math.max(max, p.count, p.sma), 0);
    const forecastMax = forecastData.reduce((max, p) => Math.max(max, p.count), 0);
    const maxVal = Math.max(historicalMax, forecastMax, 10);
    return Math.ceil(maxVal * 1.15); // Add 15% headroom
  }, [chartPointsWithTrend, forecastData]);

  // SVG Chart Dimensions
  const chartWidth = 900;
  const chartHeight = 320;
  const padding = { top: 25, right: showForecast ? 90 : 35, bottom: 45, left: 45 };
  const graphWidth = chartWidth - padding.left - padding.right;
  const graphHeight = chartHeight - padding.top - padding.bottom;

  // Calculate coordinates for historical points
  const points = useMemo(() => {
    if (chartPointsWithTrend.length === 0) return [];
    const totalSlots = chartPointsWithTrend.length + (showForecast ? forecastData.length : 0);
    const step = totalSlots > 1 ? graphWidth / (totalSlots - 1) : graphWidth;

    return chartPointsWithTrend.map((p, i) => {
      const x = padding.left + i * step;
      const y = padding.top + graphHeight - (p.count / maxVolume) * graphHeight;
      const smaY = padding.top + graphHeight - (p.sma / maxVolume) * graphHeight;
      return { ...p, x, y, smaY, index: i };
    });
  }, [chartPointsWithTrend, forecastData, maxVolume, graphWidth, graphHeight, padding, showForecast]);

  // Calculate forecast coordinates
  const forecastPoints = useMemo(() => {
    if (!showForecast || forecastData.length === 0 || points.length === 0) return [];
    const totalSlots = chartPointsWithTrend.length + forecastData.length;
    const step = graphWidth / (totalSlots - 1);
    const startIndex = points.length;
    const lastHistorical = points[points.length - 1];

    const fPoints = forecastData.map((f, idx) => {
      const x = padding.left + (startIndex + idx) * step;
      const y = padding.top + graphHeight - (f.count / maxVolume) * graphHeight;
      return { ...f, x, y, index: startIndex + idx };
    });

    return [lastHistorical, ...fPoints];
  }, [forecastData, points, showForecast, chartPointsWithTrend.length, graphWidth, graphHeight, maxVolume, padding]);

  // Smooth Bezier curve generator
  const createSmoothPath = (pts: { x: number; y: number }[]) => {
    if (pts.length === 0) return '';
    if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
    
    let path = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[Math.min(pts.length - 1, i + 2)];

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }
    return path;
  };

  // Area Path generator
  const areaPath = useMemo(() => {
    if (points.length === 0) return '';
    const lineP = createSmoothPath(points);
    const firstX = points[0].x;
    const lastX = points[points.length - 1].x;
    const bottomY = padding.top + graphHeight;
    return `${lineP} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  }, [points, graphHeight, padding]);

  // Trendline Path generator
  const trendlinePath = useMemo(() => {
    if (points.length === 0) return '';
    const trendPts = points.map(p => ({ x: p.x, y: p.smaY }));
    return createSmoothPath(trendPts);
  }, [points]);

  // Forecast Line Path
  const forecastPath = useMemo(() => {
    if (forecastPoints.length === 0) return '';
    return createSmoothPath(forecastPoints);
  }, [forecastPoints]);

  // Filtered daily items for the ledger table below
  const filteredDailyStats = dailyStats?.daily_stats.filter(item => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return item.formatted_date.toLowerCase().includes(q) || 
           item.date.includes(q) ||
           item.display_day.toLowerCase().includes(q) ||
           item.top_channels.some(c => c.title.toLowerCase().includes(q));
  }) || [];

  const selectedDayItem = dailyStats?.daily_stats.find(d => d.date === selectedDate);

  const filteredDayMessages = dayMessages.filter(m => {
    if (threatFilter === 'ALL') return true;
    return m.threat_level === threatFilter;
  });

  const activeHoverPoint = hoveredIndex !== null && points[hoveredIndex] ? points[hoveredIndex] : null;

  return (
    <div className="space-y-6 w-full relative pb-10">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <LineChart className="w-5 h-5 text-blue-600" />
            Chronological Scraping Trend & Threat Intelligence
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-600 border border-blue-500/20">
              Interactive Analytics
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time daily scraping area curve, 7-day moving averages, forecasting, and message history
          </p>
        </div>

        {/* Channel Filter & Refresh */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-darkCard px-3 py-1.5 rounded-xl border border-darkBorder shadow-sm">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs text-slate-500 font-medium">Channel:</span>
            <select
              value={selectedChannelId}
              onChange={(e) => setSelectedChannelId(e.target.value)}
              className="bg-darkBg text-xs text-slate-800 font-bold px-2 py-1 rounded-lg border border-darkBorder focus:outline-none cursor-pointer"
            >
              <option value="">All Monitored Channels</option>
              {channels.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {ch.title} ({ch.username})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => fetchStats(selectedChannelId)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 bg-darkCard hover:bg-slate-50 border border-darkBorder text-slate-700 text-xs font-bold rounded-xl transition-all shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Top 4 KPI Metrics Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1 — Today's Scraped Volume */}
        <div className="glass-card p-5 rounded-xl flex items-center justify-between border border-darkBorder bg-darkCard shadow-sm hover:border-slate-300 transition-all">
          <div className="space-y-1">
            <div className="text-[11px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5">
              <span>Today's Scraped</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
            </div>
            <div className="text-2xl font-bold text-emerald-600">
              {dailyStats ? dailyStats.today_count.toLocaleString() : '0'}
            </div>
            <div className="text-[10px] text-slate-500 font-medium flex items-center gap-1">
              <Clock className="w-3 h-3 text-slate-400" />
              <span>Yesterday: <strong className="text-slate-700">{dailyStats?.yesterday_count ?? 0}</strong></span>
            </div>
          </div>
          <div className="w-11 h-11 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center border border-emerald-500/20 shadow-sm">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        {/* Card 2 — 7-Day Velocity SMA */}
        <div className="glass-card p-5 rounded-xl flex items-center justify-between border border-darkBorder bg-darkCard shadow-sm hover:border-slate-300 transition-all">
          <div className="space-y-1">
            <div className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">7-Day Moving Avg</div>
            <div className="text-2xl font-bold text-amber-600">
              {chartPointsWithTrend.length > 0
                ? `${chartPointsWithTrend[chartPointsWithTrend.length - 1].sma} msgs/day`
                : '0'}
            </div>
            <div className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
              <Activity className="w-3 h-3 text-amber-500" />
              <span>Scrape Velocity Baseline</span>
            </div>
          </div>
          <div className="w-11 h-11 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center border border-amber-500/20 shadow-sm">
            <Activity className="w-5 h-5" />
          </div>
        </div>

        {/* Card 3 — Peak Scraping Day */}
        <div className="glass-card p-5 rounded-xl flex items-center justify-between border border-darkBorder bg-darkCard shadow-sm hover:border-slate-300 transition-all">
          <div className="space-y-1">
            <div className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Historical Peak Day</div>
            <div className="text-2xl font-bold text-purple-700">
              {dailyStats?.peak_day ? `${dailyStats.peak_day.count} msgs` : '0'}
            </div>
            <div className="text-[10px] text-slate-500 font-medium truncate max-w-[150px]">
              {dailyStats?.peak_day?.formatted_date || 'No history recorded'}
            </div>
          </div>
          <div className="w-11 h-11 rounded-lg bg-purple-500/10 text-purple-600 flex items-center justify-center border border-purple-500/20 shadow-sm">
            <Sparkles className="w-5 h-5" />
          </div>
        </div>

        {/* Card 4 — Total Scraped Volume */}
        <div className="glass-card p-5 rounded-xl flex items-center justify-between border border-darkBorder bg-darkCard shadow-sm hover:border-slate-300 transition-all">
          <div className="space-y-1">
            <div className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Total Scraped Volume</div>
            <div className="text-2xl font-bold text-blue-700">
              {dailyStats ? dailyStats.total_messages.toLocaleString() : '0'}
            </div>
            <div className="text-[10px] text-slate-400 font-medium">
              Across {dailyStats?.days_recorded || 0} active partition days
            </div>
          </div>
          <div className="w-11 h-11 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center border border-blue-500/20 shadow-sm">
            <MessageSquare className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 📈 INTERACTIVE CHRONOLOGICAL AREA & TRENDLINE CHART */}
      <div className="bg-darkCard rounded-2xl border border-darkBorder p-6 space-y-4 shadow-sm">
        {/* Chart Header, Legend & Period Switcher */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-darkBorder/60 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                Chronological Scraping Area & Trendline
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                {points.length} Days Displayed
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Hover over points to inspect specific day counts, threat classifications, and moving average trajectory
            </p>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            {/* Chart Series Toggles */}
            <div className="flex items-center gap-3 text-xs font-semibold select-none">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <span className="w-3 h-3 rounded-full bg-blue-600 inline-block shadow-sm" />
                <span className="text-slate-700 text-[11px]">Daily Volume</span>
              </label>

              <label 
                onClick={() => setShowTrendline(!showTrendline)}
                className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity"
              >
                <input type="checkbox" checked={showTrendline} onChange={() => {}} className="hidden" />
                <span className={`w-3.5 h-1 rounded ${showTrendline ? 'bg-amber-500' : 'bg-slate-300'}`} />
                <span className={`text-[11px] ${showTrendline ? 'text-amber-700 font-bold' : 'text-slate-400'}`}>
                  7D Moving Avg
                </span>
              </label>

              <label 
                onClick={() => setShowForecast(!showForecast)}
                className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity"
              >
                <input type="checkbox" checked={showForecast} onChange={() => {}} className="hidden" />
                <span className={`w-3.5 h-1 border-t-2 border-dotted ${showForecast ? 'border-purple-600' : 'border-slate-300'}`} />
                <span className={`text-[11px] ${showForecast ? 'text-purple-700 font-bold' : 'text-slate-400'}`}>
                  3D Forecast
                </span>
              </label>
            </div>

            {/* Timeframe selector (7D, 14D, 30D, ALL) */}
            <div className="flex bg-darkBg rounded-lg p-0.5 border border-darkBorder shadow-inner text-xs font-bold">
              {(['7D', '14D', '30D', 'ALL'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTimeframe(t)}
                  className={`px-3 py-1 rounded-md transition-all ${
                    timeframe === t 
                      ? 'bg-blue-600 text-white shadow-sm' 
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* SVG Area Chart Container */}
        {points.length === 0 ? (
          <div className="py-20 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200 text-xs text-slate-500">
            <LineChart className="w-8 h-8 text-slate-400 mx-auto mb-2 opacity-50" />
            No chronological scrape data available for the selected timeframe.
          </div>
        ) : (
          <div className="relative w-full overflow-x-auto select-none pt-2">
            <svg
              ref={svgContainerRef}
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              className="w-full h-auto max-h-[360px] overflow-visible"
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <defs>
                {/* Gradient Fill for Area */}
                <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.38" />
                  <stop offset="60%" stopColor="#6366f1" stopOpacity="0.12" />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
                </linearGradient>

                {/* Glow Filter for Active Nodes */}
                <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>

              {/* Horizontal Gridlines & Y-Axis Labels */}
              {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                const yPos = padding.top + graphHeight - ratio * graphHeight;
                const valueLabel = Math.round(ratio * maxVolume);
                return (
                  <g key={`grid-${idx}`}>
                    <line
                      x1={padding.left}
                      y1={yPos}
                      x2={chartWidth - padding.right}
                      y2={yPos}
                      stroke="#e2e8f0"
                      strokeDasharray="4 4"
                      strokeWidth="1"
                    />
                    <text
                      x={padding.left - 8}
                      y={yPos + 3}
                      textAnchor="end"
                      className="text-[10px] font-mono fill-slate-400 font-semibold"
                    >
                      {valueLabel}
                    </text>
                  </g>
                );
              })}

              {/* Forecast Shaded Future Zone Background */}
              {showForecast && forecastPoints.length > 1 && (
                <rect
                  x={points[points.length - 1].x}
                  y={padding.top}
                  width={chartWidth - padding.right - points[points.length - 1].x}
                  height={graphHeight}
                  fill="#f8fafc"
                  opacity="0.8"
                />
              )}

              {/* Shaded Area Fill under Curve */}
              <path d={areaPath} fill="url(#areaGradient)" />

              {/* Main Daily Volume Line Curve */}
              <path
                d={createSmoothPath(points)}
                fill="none"
                stroke="#2563eb"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* 7-Day SMA Moving Trendline */}
              {showTrendline && (
                <path
                  d={trendlinePath}
                  fill="none"
                  stroke="#d97706"
                  strokeWidth="2.5"
                  strokeDasharray="5 4"
                  strokeLinecap="round"
                  className="transition-all duration-300"
                />
              )}

              {/* 3-Day Forecast Projected Line */}
              {showForecast && forecastPoints.length > 1 && (
                <path
                  d={forecastPath}
                  fill="none"
                  stroke="#9333ea"
                  strokeWidth="2.5"
                  strokeDasharray="3 4"
                  strokeLinecap="round"
                />
              )}

              {/* Interactive Vertical Crosshair Line on Hover */}
              {activeHoverPoint && (
                <line
                  x1={activeHoverPoint.x}
                  y1={padding.top}
                  x2={activeHoverPoint.x}
                  y2={padding.top + graphHeight}
                  stroke="#3b82f6"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                />
              )}

              {/* Data Point Circles on Historical Curve */}
              {points.map((p) => {
                const isHovered = hoveredIndex === p.index;
                const isSelected = selectedDate === p.date;

                return (
                  <g key={`dot-${p.date}`}>
                    {/* Outer glow ring when hovered or selected */}
                    {(isHovered || isSelected) && (
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r="9"
                        fill="#3b82f6"
                        opacity="0.25"
                        filter="url(#glow)"
                      />
                    )}
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={isSelected ? "6" : isHovered ? "5.5" : "3.5"}
                      fill={isSelected ? "#2563eb" : isHovered ? "#3b82f6" : "#ffffff"}
                      stroke={isSelected ? "#ffffff" : "#2563eb"}
                      strokeWidth={isSelected ? "2.5" : "2"}
                      className="transition-all duration-150 cursor-pointer"
                    />

                    {/* Invisible larger hover hit target */}
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r="16"
                      fill="transparent"
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredIndex(p.index)}
                      onClick={() => handleSelectDay(p.date)}
                    />
                  </g>
                );
              })}

              {/* Forecast Dotted Point Circles */}
              {showForecast && forecastPoints.slice(1).map((f) => (
                <g key={`forecast-${f.date}`}>
                  <circle
                    cx={f.x}
                    cy={f.y}
                    r="4"
                    fill="#ffffff"
                    stroke="#9333ea"
                    strokeWidth="2"
                    strokeDasharray="2 2"
                  />
                  <text
                    x={f.x}
                    y={f.y - 10}
                    textAnchor="middle"
                    className="text-[9px] font-bold fill-purple-700 font-mono"
                  >
                    {f.count}
                  </text>
                </g>
              ))}

              {/* X-Axis Date Labels at Bottom */}
              {points.map((p, idx) => {
                // Show label only on intervals to avoid crowding
                const interval = points.length > 20 ? 4 : points.length > 10 ? 2 : 1;
                const isLast = idx === points.length - 1;
                const showLabel = idx % interval === 0 || isLast;

                if (!showLabel) return null;

                return (
                  <text
                    key={`lbl-${p.date}`}
                    x={p.x}
                    y={padding.top + graphHeight + 18}
                    textAnchor="middle"
                    className={`text-[10px] font-bold ${
                      p.date === selectedDate ? 'fill-blue-600 font-extrabold' : 'fill-slate-500'
                    }`}
                  >
                    {p.display_day || p.formatted_date.slice(0, 6)}
                  </text>
                );
              })}

              {/* Future Forecast Zone Label */}
              {showForecast && (
                <text
                  x={chartWidth - padding.right / 2}
                  y={padding.top + 14}
                  textAnchor="middle"
                  className="text-[9px] font-bold uppercase fill-purple-600 tracking-wider"
                >
                  3D Projection
                </text>
              )}
            </svg>

            {/* Hover Floating Card Tooltip */}
            {activeHoverPoint && (
              <div
                className="absolute z-30 pointer-events-none bg-slate-900/95 text-white p-3 rounded-xl shadow-xl border border-slate-700/80 backdrop-blur-sm transition-all text-xs"
                style={{
                  left: Math.min(Math.max(activeHoverPoint.x - 90, 10), chartWidth - 200),
                  top: Math.max(activeHoverPoint.y - 120, 10),
                }}
              >
                <div className="flex items-center justify-between gap-3 border-b border-slate-700 pb-1.5 mb-1.5">
                  <span className="font-bold text-slate-200">{activeHoverPoint.formatted_date}</span>
                  <span className="font-mono text-[10px] text-cyan-400 bg-slate-800 px-1.5 py-0.5 rounded">
                    {activeHoverPoint.date}
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-400 font-medium">Scraped Volume:</span>
                    <strong className="text-white font-bold">{activeHoverPoint.count} msgs</strong>
                  </div>
                  {showTrendline && (
                    <div className="flex items-center justify-between gap-4 text-amber-400 font-medium">
                      <span>7-Day Trend SMA:</span>
                      <strong>{activeHoverPoint.sma} msgs</strong>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-4 text-slate-400">
                    <span>Active Channels:</span>
                    <strong className="text-slate-200">{activeHoverPoint.channel_count} channels</strong>
                  </div>

                  {/* Threat Badges Breakdown */}
                  <div className="flex items-center gap-1 pt-1 flex-wrap">
                    {activeHoverPoint.threat_levels.CRITICAL > 0 && (
                      <span className="px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-400 font-bold text-[9px]">
                        {activeHoverPoint.threat_levels.CRITICAL} Crit
                      </span>
                    )}
                    {activeHoverPoint.threat_levels.HIGH > 0 && (
                      <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-400 font-bold text-[9px]">
                        {activeHoverPoint.threat_levels.HIGH} High
                      </span>
                    )}
                    {activeHoverPoint.threat_levels.MEDIUM > 0 && (
                      <span className="px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-400 font-bold text-[9px]">
                        {activeHoverPoint.threat_levels.MEDIUM} Med
                      </span>
                    )}
                    {activeHoverPoint.threat_levels.LOW > 0 && (
                      <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 text-[9px]">
                        {activeHoverPoint.threat_levels.LOW} Low
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-2 text-[9px] text-cyan-400 font-bold flex items-center gap-1">
                  <span>Click node to inspect day logs ↓</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Selected Day Message Inspector Drawer */}
      {selectedDate && selectedDayItem && (
        <div className="bg-darkCard rounded-2xl border border-blue-300 p-5 space-y-4 shadow-md transition-all">
          <div className="flex items-center justify-between border-b border-darkBorder/60 pb-3">
            <div className="space-y-0.5">
              <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <Eye className="w-4 h-4 text-blue-600" />
                Messages Scraped on {selectedDayItem.formatted_date}
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                  {selectedDate}
                </span>
              </h3>
              <p className="text-xs text-slate-500">
                {dayMessages.length} messages collected and indexed on this day
              </p>
            </div>

            <div className="flex items-center gap-2">
              {/* Threat Filter */}
              <div className="flex bg-darkBg rounded-lg p-0.5 border border-darkBorder text-xs font-bold">
                {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((lvl) => (
                  <button
                    key={lvl}
                    onClick={() => setThreatFilter(lvl)}
                    className={`px-2 py-1 rounded-md transition-all ${
                      threatFilter === lvl 
                        ? 'bg-blue-600 text-white shadow-sm' 
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {lvl}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setSelectedDate(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages table for the selected day */}
          <div className="border border-darkBorder rounded-xl overflow-hidden shadow-inner bg-white max-h-96 overflow-y-auto">
            {dayMessagesLoading ? (
              <div className="py-12 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                Loading messages from date partition...
              </div>
            ) : filteredDayMessages.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-500">
                No messages found matching the threat filter for this day.
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/90 border-b border-darkBorder text-[10px] font-bold text-slate-600 uppercase tracking-wider sticky top-0">
                    <th className="py-2.5 px-3 w-16">ID</th>
                    <th className="py-2.5 px-3 w-32">Channel</th>
                    <th className="py-2.5 px-3 w-28">Sender</th>
                    <th className="py-2.5 px-3">Message Content</th>
                    <th className="py-2.5 px-3 w-24 text-center">Threat</th>
                    <th className="py-2.5 px-3 w-28 text-right pr-4">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-darkBorder/40 text-slate-700">
                  {filteredDayMessages.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2 px-3 font-mono text-[10px] text-slate-400">{m.id}</td>
                      <td className="py-2 px-3 font-bold text-slate-800 truncate max-w-[120px]">{m.channel_username}</td>
                      <td className="py-2 px-3 font-mono text-[11px] text-blue-600 truncate max-w-[100px]">{m.sender || 'Anonymous'}</td>
                      <td className="py-2 px-3 break-words text-[11px] select-all">{m.text}</td>
                      <td className="py-2 px-3 text-center">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          m.threat_level === 'CRITICAL' ? 'bg-rose-100 text-rose-700 border border-rose-200' :
                          m.threat_level === 'HIGH' ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                          m.threat_level === 'MEDIUM' ? 'bg-blue-100 text-blue-700 border border-blue-200' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {m.threat_level}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right pr-4 font-mono text-[10px] text-slate-400">
                        {m.date ? new Date(m.date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Complete Historical Date Ledger Table */}
      <div className="bg-darkCard rounded-2xl border border-darkBorder p-5 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-darkBorder/60 pb-3">
          <div>
            <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-600" />
              Complete Date History Ledger
            </h4>
            <p className="text-xs text-slate-500">
              Audit log of daily scrape partitions and threat breakdown
            </p>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search date (e.g. 20th Aug, 19th Aug)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-darkBg text-xs text-slate-800 pl-9 pr-3 py-1.5 rounded-lg border border-darkBorder focus:outline-none focus:border-blue-500 font-medium"
            />
          </div>
        </div>

        <div className="border border-darkBorder rounded-xl overflow-hidden shadow-inner bg-white">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/90 border-b border-darkBorder text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-4">Date / Day</th>
                <th className="py-3 px-4 text-center">Messages Scraped</th>
                <th className="py-3 px-4">Threat Classification</th>
                <th className="py-3 px-4">Active Channels</th>
                <th className="py-3 px-4 text-right pr-6">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-darkBorder/60 text-slate-700">
              {filteredDailyStats.map((item) => (
                <tr key={item.date} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3 px-4">
                    <div className="font-bold text-slate-800">{item.formatted_date}</div>
                    <div className="text-[10px] font-mono text-slate-400">{item.date}</div>
                  </td>
                  <td className="py-3 px-4 text-center font-bold text-blue-600 text-sm">
                    {item.count.toLocaleString()}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {item.threat_levels.CRITICAL > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-600 border border-rose-500/20 font-bold text-[10px]">
                          {item.threat_levels.CRITICAL} CRITICAL
                        </span>
                      )}
                      {item.threat_levels.HIGH > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 border border-amber-500/20 font-bold text-[10px]">
                          {item.threat_levels.HIGH} HIGH
                        </span>
                      )}
                      {item.threat_levels.MEDIUM > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 border border-blue-500/20 font-bold text-[10px]">
                          {item.threat_levels.MEDIUM} MED
                        </span>
                      )}
                      {item.threat_levels.LOW > 0 && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 text-[10px]">
                          {item.threat_levels.LOW} LOW
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1 flex-wrap">
                      {item.top_channels.slice(0, 2).map(c => (
                        <span key={c.id} className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-medium border border-slate-200">
                          {c.title}: <strong className="text-slate-900">{c.count}</strong>
                        </span>
                      ))}
                      {item.top_channels.length > 2 && (
                        <span className="text-[10px] text-slate-400 font-bold">
                          +{item.top_channels.length - 2} more
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right pr-6">
                    <button
                      onClick={() => handleSelectDay(item.date)}
                      className={`inline-flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                        selectedDate === item.date
                          ? 'bg-blue-600 text-white'
                          : 'bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200'
                      }`}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      {selectedDate === item.date ? 'Viewing' : 'Inspect'}
                    </button>
                  </td>
                </tr>
              ))}
              {filteredDailyStats.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400 text-xs">
                    No daily scrape records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
