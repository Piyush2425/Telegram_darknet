import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { 
  LineChart, Calendar, TrendingUp, Sparkles, Clock, ShieldAlert, 
  Search, Filter, RefreshCw, Eye, MessageSquare, 
  Radio, CheckCircle2, ChevronRight, X, ExternalLink, Globe, AlertTriangle,
  Activity, ZoomIn, ZoomOut, RotateCcw, MoveHorizontal, ChevronLeft,
  Layers, ArrowLeft, ArrowRight, Zap, Sliders, CalendarDays
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
  const [threatFilter, setThreatFilter] = useState<string>('ALL');

  // Chart settings
  const [showTrendline, setShowTrendline] = useState(true);
  const [showForecast, setShowForecast] = useState(true);

  // Zoom and Pan Viewport State (indices [startIndex, endIndex] in chronological array)
  const [viewport, setViewport] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Drag & Pan state for main chart
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ startX: number; initialStart: number; initialEnd: number } | null>(null);

  // Mini-map Brush Dragging state
  const [isDraggingBrush, setIsDraggingBrush] = useState<'move' | 'start' | 'end' | null>(null);
  const brushDragRef = useRef<{ startX: number; initialStart: number; initialEnd: number } | null>(null);

  const mainSvgRef = useRef<SVGSVGElement | null>(null);
  const minimapRef = useRef<SVGSVGElement | null>(null);

  const fetchStats = async (channelId?: string) => {
    setLoading(true);
    try {
      // Fetch extensive history (up to 365 days)
      const [statsData, chData] = await Promise.all([
        getDailyMessageStats(channelId || undefined, 365),
        getChannels(),
      ]);
      setDailyStats(statsData);
      setChannels(chData);

      // Initialize viewport to default last 30 days (or all if fewer)
      const totalPoints = statsData?.daily_stats?.length || 0;
      if (totalPoints > 0) {
        const defaultWindow = Math.min(30, totalPoints);
        setViewport({
          start: Math.max(0, totalPoints - defaultWindow),
          end: totalPoints - 1
        });
      }
    } catch (e) {
      console.error("Error fetching daily stats:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats(selectedChannelId);
  }, [selectedChannelId]);

  // Full Chronological array (Oldest to Newest, Left to Right)
  const fullChronologicalData = useMemo(() => {
    if (!dailyStats || !dailyStats.daily_stats) return [];
    return [...dailyStats.daily_stats].reverse();
  }, [dailyStats]);

  // Calculate 7-day Simple Moving Average (SMA) across entire dataset
  const fullDataWithSMA = useMemo(() => {
    if (fullChronologicalData.length === 0) return [];
    
    return fullChronologicalData.map((item, idx, arr) => {
      const windowStart = Math.max(0, idx - 6);
      const windowItems = arr.slice(windowStart, idx + 1);
      const sma = Math.round(
        windowItems.reduce((acc, curr) => acc + curr.count, 0) / windowItems.length
      );
      return {
        ...item,
        sma,
        origIndex: idx
      };
    });
  }, [fullChronologicalData]);

  // Sync viewport when dataset changes
  useEffect(() => {
    if (fullDataWithSMA.length > 0) {
      const total = fullDataWithSMA.length;
      const windowSize = Math.min(30, total);
      setViewport({
        start: Math.max(0, total - windowSize),
        end: total - 1
      });
    }
  }, [fullDataWithSMA.length]);

  // Visible Window Slice based on Zoom / Pan Viewport
  const visibleData = useMemo(() => {
    if (fullDataWithSMA.length === 0) return [];
    const s = Math.max(0, Math.min(viewport.start, fullDataWithSMA.length - 1));
    const e = Math.max(s, Math.min(viewport.end, fullDataWithSMA.length - 1));
    return fullDataWithSMA.slice(s, e + 1);
  }, [fullDataWithSMA, viewport]);

  // 3-Day Forecast calculation
  const forecastData = useMemo(() => {
    if (fullDataWithSMA.length < 2) return [];
    const lastItem = fullDataWithSMA[fullDataWithSMA.length - 1];
    const prevItem = fullDataWithSMA[Math.max(0, fullDataWithSMA.length - 4)];
    const velocity = (lastItem.sma - prevItem.sma) / Math.max(1, fullDataWithSMA.length - 1 - (fullDataWithSMA.length - 4));
    
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
        formatted_date: `${formatted} (Forecast)`,
        count: projectedCount,
        isForecast: true
      });
    }
    return forecasts;
  }, [fullDataWithSMA]);

  // Max volume in current visible window (dynamic Y-axis auto-scaling)
  const maxVolume = useMemo(() => {
    const visibleMax = visibleData.reduce((max, p) => Math.max(max, p.count, p.sma), 0);
    const isAtEnd = viewport.end >= fullDataWithSMA.length - 1;
    const forecastMax = (showForecast && isAtEnd) ? forecastData.reduce((max, p) => Math.max(max, p.count), 0) : 0;
    const maxVal = Math.max(visibleMax, forecastMax, 10);
    return Math.ceil(maxVal * 1.18); // 18% headroom
  }, [visibleData, forecastData, showForecast, viewport.end, fullDataWithSMA.length]);

  // Overall Max for Minimap
  const minimapMaxVolume = useMemo(() => {
    return Math.max(...fullDataWithSMA.map(p => p.count), 10);
  }, [fullDataWithSMA]);

  // Handle Day selection to view messages
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

  // Preset Timeframe Jumper (7D, 14D, 30D, 90D, ALL)
  const applyPreset = (days: number | 'ALL') => {
    const total = fullDataWithSMA.length;
    if (total === 0) return;

    if (days === 'ALL') {
      setViewport({ start: 0, end: total - 1 });
    } else {
      const windowSize = Math.min(days, total);
      setViewport({
        start: Math.max(0, total - windowSize),
        end: total - 1
      });
    }
  };

  // Zoom In / Zoom Out actions (+/- buttons)
  const handleZoom = (direction: 'in' | 'out') => {
    const currentSpan = viewport.end - viewport.start + 1;
    const total = fullDataWithSMA.length;
    if (total === 0) return;

    let newSpan = direction === 'in' 
      ? Math.max(4, Math.round(currentSpan * 0.7)) 
      : Math.min(total, Math.round(currentSpan * 1.4));

    if (newSpan === currentSpan) return;

    const mid = Math.round((viewport.start + viewport.end) / 2);
    let newStart = Math.max(0, mid - Math.floor(newSpan / 2));
    let newEnd = newStart + newSpan - 1;

    if (newEnd >= total) {
      newEnd = total - 1;
      newStart = Math.max(0, newEnd - newSpan + 1);
    }

    setViewport({ start: newStart, end: newEnd });
  };

  // Mouse Wheel Zoom Handler on Main Graph
  const handleWheelZoom = (e: React.WheelEvent) => {
    e.preventDefault();
    if (fullDataWithSMA.length === 0) return;

    const zoomDirection = e.deltaY < 0 ? 'in' : 'out';
    handleZoom(zoomDirection);
  };

  // Panning drag handlers on Main Graph
  const handleMouseDownMain = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Left click only
    setIsPanning(true);
    panStartRef.current = {
      startX: e.clientX,
      initialStart: viewport.start,
      initialEnd: viewport.end
    };
  };

  const handleMouseMoveMain = useCallback((e: MouseEvent) => {
    if (!isPanning || !panStartRef.current || fullDataWithSMA.length === 0) return;

    const deltaX = e.clientX - panStartRef.current.startX;
    const span = panStartRef.current.initialEnd - panStartRef.current.initialStart;
    const total = fullDataWithSMA.length;
    
    // Sensitivity ratio
    const sensitivity = 0.08;
    const shift = Math.round(-deltaX * sensitivity);

    let newStart = panStartRef.current.initialStart + shift;
    let newEnd = panStartRef.current.initialEnd + shift;

    if (newStart < 0) {
      newStart = 0;
      newEnd = newStart + span;
    }
    if (newEnd >= total) {
      newEnd = total - 1;
      newStart = Math.max(0, newEnd - span);
    }

    setViewport({ start: newStart, end: newEnd });
  }, [isPanning, fullDataWithSMA.length]);

  const handleMouseUpMain = useCallback(() => {
    setIsPanning(false);
    panStartRef.current = null;
  }, []);

  // Brush Minimap Drag Handlers
  const handleBrushMouseDown = (type: 'move' | 'start' | 'end', e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDraggingBrush(type);
    brushDragRef.current = {
      startX: e.clientX,
      initialStart: viewport.start,
      initialEnd: viewport.end
    };
  };

  const handleBrushMouseMove = useCallback((e: MouseEvent) => {
    if (!isDraggingBrush || !brushDragRef.current || !minimapRef.current || fullDataWithSMA.length === 0) return;

    const rect = minimapRef.current.getBoundingClientRect();
    const total = fullDataWithSMA.length;
    const pxPerItem = rect.width / Math.max(1, total - 1);
    const deltaItems = Math.round((e.clientX - brushDragRef.current.startX) / pxPerItem);

    if (isDraggingBrush === 'move') {
      const span = brushDragRef.current.initialEnd - brushDragRef.current.initialStart;
      let newStart = brushDragRef.current.initialStart + deltaItems;
      let newEnd = brushDragRef.current.initialEnd + deltaItems;

      if (newStart < 0) {
        newStart = 0;
        newEnd = span;
      }
      if (newEnd >= total) {
        newEnd = total - 1;
        newStart = Math.max(0, newEnd - span);
      }
      setViewport({ start: newStart, end: newEnd });
    } else if (isDraggingBrush === 'start') {
      let newStart = Math.max(0, Math.min(brushDragRef.current.initialStart + deltaItems, viewport.end - 3));
      setViewport(prev => ({ ...prev, start: newStart }));
    } else if (isDraggingBrush === 'end') {
      let newEnd = Math.min(total - 1, Math.max(brushDragRef.current.initialEnd + deltaItems, viewport.start + 3));
      setViewport(prev => ({ ...prev, end: newEnd }));
    }
  }, [isDraggingBrush, fullDataWithSMA.length, viewport.end, viewport.start]);

  const handleBrushMouseUp = useCallback(() => {
    setIsDraggingBrush(null);
    brushDragRef.current = null;
  }, []);

  // Global mouse event listeners for smooth drag & release
  useEffect(() => {
    if (isPanning) {
      window.addEventListener('mousemove', handleMouseMoveMain);
      window.addEventListener('mouseup', handleMouseUpMain);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMoveMain);
      window.removeEventListener('mouseup', handleMouseUpMain);
    };
  }, [isPanning, handleMouseMoveMain, handleMouseUpMain]);

  useEffect(() => {
    if (isDraggingBrush) {
      window.addEventListener('mousemove', handleBrushMouseMove);
      window.addEventListener('mouseup', handleBrushMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleBrushMouseMove);
      window.removeEventListener('mouseup', handleBrushMouseUp);
    };
  }, [isDraggingBrush, handleBrushMouseMove, handleBrushMouseUp]);

  // Main Chart SVG Dimensions & Coordinates
  const chartWidth = 960;
  const chartHeight = 340;
  const isAtDatasetEnd = viewport.end >= fullDataWithSMA.length - 1;
  const hasForecast = showForecast && isAtDatasetEnd;
  const padding = { top: 25, right: hasForecast ? 85 : 35, bottom: 45, left: 50 };
  const graphWidth = chartWidth - padding.left - padding.right;
  const graphHeight = chartHeight - padding.top - padding.bottom;

  // Calculate coordinates for visible points
  const points = useMemo(() => {
    if (visibleData.length === 0) return [];
    const totalSlots = visibleData.length + (hasForecast ? forecastData.length : 0);
    const step = totalSlots > 1 ? graphWidth / (totalSlots - 1) : graphWidth;

    return visibleData.map((p, i) => {
      const x = padding.left + i * step;
      const y = padding.top + graphHeight - (p.count / maxVolume) * graphHeight;
      const smaY = padding.top + graphHeight - (p.sma / maxVolume) * graphHeight;
      return { ...p, x, y, smaY, localIndex: i };
    });
  }, [visibleData, hasForecast, forecastData.length, graphWidth, graphHeight, maxVolume, padding]);

  // Forecast Points Coordinates
  const forecastPoints = useMemo(() => {
    if (!hasForecast || forecastData.length === 0 || points.length === 0) return [];
    const totalSlots = visibleData.length + forecastData.length;
    const step = graphWidth / (totalSlots - 1);
    const startIndex = points.length;
    const lastHistorical = points[points.length - 1];

    const fPoints = forecastData.map((f, idx) => {
      const x = padding.left + (startIndex + idx) * step;
      const y = padding.top + graphHeight - (f.count / maxVolume) * graphHeight;
      return { ...f, x, y };
    });

    return [lastHistorical, ...fPoints];
  }, [hasForecast, forecastData, points, visibleData.length, graphWidth, graphHeight, maxVolume, padding]);

  // Smooth Bezier Curve Path Generator
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

  // Area Fill Path
  const areaPath = useMemo(() => {
    if (points.length === 0) return '';
    const lineP = createSmoothPath(points);
    const firstX = points[0].x;
    const lastX = points[points.length - 1].x;
    const bottomY = padding.top + graphHeight;
    return `${lineP} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  }, [points, graphHeight, padding]);

  // SMA Trendline Path
  const trendlinePath = useMemo(() => {
    if (points.length === 0) return '';
    return createSmoothPath(points.map(p => ({ x: p.x, y: p.smaY })));
  }, [points]);

  // Forecast Line Path
  const forecastPath = useMemo(() => {
    if (forecastPoints.length === 0) return '';
    return createSmoothPath(forecastPoints);
  }, [forecastPoints]);

  const activeHoverPoint = hoveredIndex !== null && points[hoveredIndex] ? points[hoveredIndex] : null;

  const selectedDayItem = dailyStats?.daily_stats.find(d => d.date === selectedDate);
  const filteredDayMessages = dayMessages.filter(m => {
    if (threatFilter === 'ALL') return true;
    return m.threat_level === threatFilter;
  });

  // Calculate Minimap Brush Window Positions
  const totalItems = fullDataWithSMA.length;
  const brushLeftPercent = totalItems > 1 ? (viewport.start / (totalItems - 1)) * 100 : 0;
  const brushRightPercent = totalItems > 1 ? (viewport.end / (totalItems - 1)) * 100 : 100;
  const brushWidthPercent = Math.max(2, brushRightPercent - brushLeftPercent);

  return (
    <div className="space-y-6 w-full relative pb-12">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <LineChart className="w-5 h-5 text-blue-600" />
            Interactive Scraping Telemetry & Forecast
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-600 border border-blue-500/20">
              Enterprise Zoom & Pan
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Scroll, pan, and zoom across all scraping dates with moving average trendlines and predictive forecasting
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

      {/* 4 Executive KPI Cards */}
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

        {/* Card 2 — 7-Day Moving Avg Velocity */}
        <div className="glass-card p-5 rounded-xl flex items-center justify-between border border-darkBorder bg-darkCard shadow-sm hover:border-slate-300 transition-all">
          <div className="space-y-1">
            <div className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">7-Day Moving Avg</div>
            <div className="text-2xl font-bold text-amber-600">
              {fullDataWithSMA.length > 0
                ? `${fullDataWithSMA[fullDataWithSMA.length - 1].sma} msgs/day`
                : '0'}
            </div>
            <div className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
              <Activity className="w-3 h-3 text-amber-500" />
              <span>Baseline Scrape Momentum</span>
            </div>
          </div>
          <div className="w-11 h-11 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center border border-amber-500/20 shadow-sm">
            <Activity className="w-5 h-5" />
          </div>
        </div>

        {/* Card 3 — Peak Day Volume */}
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

        {/* Card 4 — Total Scraped Messages */}
        <div className="glass-card p-5 rounded-xl flex items-center justify-between border border-darkBorder bg-darkCard shadow-sm hover:border-slate-300 transition-all">
          <div className="space-y-1">
            <div className="text-[11px] text-slate-500 font-bold uppercase tracking-wider">Total Scraped Volume</div>
            <div className="text-2xl font-bold text-blue-700">
              {dailyStats ? dailyStats.total_messages.toLocaleString() : '0'}
            </div>
            <div className="text-[10px] text-slate-400 font-medium">
              Across {dailyStats?.days_recorded || 0} active partition dates
            </div>
          </div>
          <div className="w-11 h-11 rounded-lg bg-blue-500/10 text-blue-600 flex items-center justify-center border border-blue-500/20 shadow-sm">
            <MessageSquare className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 🚀 PRODUCTION INTERACTIVE ZOOMABLE & SCROLLABLE GRAPH CONTAINER */}
      <div className="bg-darkCard rounded-2xl border border-darkBorder p-6 space-y-4 shadow-sm select-none">
        
        {/* Graph Header with Zoom Toolbar, Range Presets & Series Toggles */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-darkBorder/60 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                Chronological Scraping Area & Forecast Curve
              </h3>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                Showing {visibleData.length} of {fullDataWithSMA.length} Days
              </span>
            </div>
            <div className="text-xs text-slate-500 flex items-center gap-3">
              <span>🖱️ <strong>Scroll wheel</strong> to zoom in/out</span>
              <span>•</span>
              <span>✋ <strong>Click & drag</strong> graph to scroll across dates</span>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Zoom Controls Buttons */}
            <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200 shadow-inner">
              <button
                onClick={() => handleZoom('in')}
                className="p-1.5 hover:bg-white text-slate-700 rounded-md transition-all"
                title="Zoom In (+)"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleZoom('out')}
                className="p-1.5 hover:bg-white text-slate-700 rounded-md transition-all"
                title="Zoom Out (-)"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                onClick={() => applyPreset('ALL')}
                className="p-1.5 hover:bg-white text-slate-700 rounded-md transition-all"
                title="Reset Zoom (Show All)"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Range Presets (7D, 14D, 30D, 90D, ALL) */}
            <div className="flex bg-darkBg rounded-lg p-0.5 border border-darkBorder shadow-inner text-xs font-bold">
              {[
                { label: '7D', val: 7 },
                { label: '14D', val: 14 },
                { label: '30D', val: 30 },
                { label: '90D', val: 90 },
                { label: 'ALL', val: 'ALL' as const }
              ].map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => applyPreset(preset.val)}
                  className="px-2.5 py-1 rounded-md text-slate-600 hover:text-slate-900 hover:bg-white transition-all"
                >
                  {preset.label}
                </button>
              ))}
            </div>

            {/* Series Toggles */}
            <div className="flex items-center gap-3 border-l border-darkBorder/60 pl-3 text-xs font-semibold">
              <label 
                onClick={() => setShowTrendline(!showTrendline)}
                className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity"
              >
                <span className={`w-3.5 h-1 rounded ${showTrendline ? 'bg-amber-500' : 'bg-slate-300'}`} />
                <span className={`text-[11px] ${showTrendline ? 'text-amber-700 font-bold' : 'text-slate-400'}`}>
                  7D Moving Avg
                </span>
              </label>

              <label 
                onClick={() => setShowForecast(!showForecast)}
                className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 transition-opacity"
              >
                <span className={`w-3.5 h-1 border-t-2 border-dotted ${showForecast ? 'border-purple-600' : 'border-slate-300'}`} />
                <span className={`text-[11px] ${showForecast ? 'text-purple-700 font-bold' : 'text-slate-400'}`}>
                  3D Forecast
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* MAIN INTERACTIVE SVG GRAPH (Zoomable via wheel & draggable to pan) */}
        {points.length === 0 ? (
          <div className="py-20 text-center bg-slate-50/50 rounded-xl border border-dashed border-slate-200 text-xs text-slate-500">
            <LineChart className="w-8 h-8 text-slate-400 mx-auto mb-2 opacity-50" />
            No chronological scrape data recorded yet.
          </div>
        ) : (
          <div 
            className={`relative w-full overflow-hidden select-none cursor-grab ${isPanning ? 'cursor-grabbing' : ''}`}
            onWheel={handleWheelZoom}
            onMouseDown={handleMouseDownMain}
          >
            <svg
              ref={mainSvgRef}
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              className="w-full h-auto max-h-[360px] overflow-visible"
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <defs>
                {/* Gradient Fill for Area Curve */}
                <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2563eb" stopOpacity="0.35" />
                  <stop offset="60%" stopColor="#4f46e5" stopOpacity="0.08" />
                  <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.0" />
                </linearGradient>

                {/* Glow Filter for Active Nodes */}
                <filter id="nodeGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>

              {/* Horizontal Gridlines & Dynamic Y-Axis Labels */}
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
                      stroke="#f1f5f9"
                      strokeWidth="1.5"
                    />
                    <text
                      x={padding.left - 10}
                      y={yPos + 3}
                      textAnchor="end"
                      className="text-[10px] font-mono fill-slate-400 font-semibold"
                    >
                      {valueLabel}
                    </text>
                  </g>
                );
              })}

              {/* Forecast Zone Background Shading (if at the end of dataset) */}
              {hasForecast && forecastPoints.length > 1 && (
                <rect
                  x={points[points.length - 1].x}
                  y={padding.top}
                  width={chartWidth - padding.right - points[points.length - 1].x}
                  height={graphHeight}
                  fill="#faf5ff"
                  opacity="0.9"
                />
              )}

              {/* Shaded Area Fill under Curve */}
              <path d={areaPath} fill="url(#areaGradient)" />

              {/* Main Daily Scraped Volume Line Curve */}
              <path
                d={createSmoothPath(points)}
                fill="none"
                stroke="#2563eb"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* 7-Day SMA Moving Trendline Curve */}
              {showTrendline && (
                <path
                  d={trendlinePath}
                  fill="none"
                  stroke="#d97706"
                  strokeWidth="2.5"
                  strokeDasharray="5 4"
                  strokeLinecap="round"
                />
              )}

              {/* 3-Day Forecast Projected Line */}
              {hasForecast && forecastPoints.length > 1 && (
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

              {/* Data Point Circles on Curve */}
              {points.map((p) => {
                const isHovered = hoveredIndex === p.localIndex;
                const isSelected = selectedDate === p.date;

                return (
                  <g key={`dot-${p.date}`}>
                    {(isHovered || isSelected) && (
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r="8"
                        fill="#3b82f6"
                        opacity="0.3"
                        filter="url(#nodeGlow)"
                      />
                    )}
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={isSelected ? "5.5" : isHovered ? "5" : points.length > 40 ? "2.5" : "3.5"}
                      fill={isSelected ? "#2563eb" : isHovered ? "#3b82f6" : "#ffffff"}
                      stroke={isSelected ? "#ffffff" : "#2563eb"}
                      strokeWidth={isSelected ? "2.5" : "2"}
                      className="transition-all duration-100"
                    />

                    {/* Hit Target for Hover/Click */}
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={Math.max(12, graphWidth / points.length / 2)}
                      fill="transparent"
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredIndex(p.localIndex)}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectDay(p.date);
                      }}
                    />
                  </g>
                );
              })}

              {/* Forecast Point Nodes */}
              {hasForecast && forecastPoints.slice(1).map((f) => (
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
                const stepCount = points.length;
                const interval = stepCount > 40 ? 6 : stepCount > 20 ? 4 : stepCount > 10 ? 2 : 1;
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

              {/* Forecast Label Banner */}
              {hasForecast && (
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
                className="absolute z-30 pointer-events-none bg-slate-900/95 text-white p-3.5 rounded-xl shadow-2xl border border-slate-700 backdrop-blur-md transition-all text-xs"
                style={{
                  left: Math.min(Math.max(activeHoverPoint.x - 90, 10), chartWidth - 220),
                  top: Math.max(activeHoverPoint.y - 130, 10),
                }}
              >
                <div className="flex items-center justify-between gap-3 border-b border-slate-700 pb-1.5 mb-1.5">
                  <span className="font-bold text-slate-100">{activeHoverPoint.formatted_date}</span>
                  <span className="font-mono text-[10px] text-cyan-400 bg-slate-800 px-1.5 py-0.5 rounded">
                    {activeHoverPoint.date}
                  </span>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-slate-400">Scraped Volume:</span>
                    <strong className="text-white font-bold">{activeHoverPoint.count} messages</strong>
                  </div>
                  {showTrendline && (
                    <div className="flex items-center justify-between gap-4 text-amber-400 font-medium">
                      <span>7-Day SMA Trend:</span>
                      <strong>{activeHoverPoint.sma} msgs</strong>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-4 text-slate-400">
                    <span>Active Channels:</span>
                    <strong className="text-slate-200">{activeHoverPoint.channel_count} channels</strong>
                  </div>

                  {/* Threat Badges Breakdown */}
                  <div className="flex items-center gap-1 pt-1.5 flex-wrap">
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

                <div className="mt-2 text-[9px] text-cyan-400 font-bold flex items-center gap-1 border-t border-slate-800 pt-1.5">
                  <span>Click node to view day messages ↓</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 🧭 ENTERPRISE TIMELINE BRUSH / MINIMAP SLIDER (Scroll to any date) */}
        {fullDataWithSMA.length > 0 && (
          <div className="space-y-1.5 pt-2 border-t border-darkBorder/40">
            <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
              <span className="flex items-center gap-1.5">
                <Sliders className="w-3.5 h-3.5 text-blue-600" />
                <span>Timeline Navigator (Drag window or handles to scroll across all dates):</span>
              </span>
              <span className="font-mono text-slate-700 font-bold">
                {fullDataWithSMA[viewport.start]?.formatted_date || ''} — {fullDataWithSMA[viewport.end]?.formatted_date || ''}
              </span>
            </div>

            {/* Minimap SVG Track with Brush Selection Overlay */}
            <div className="relative w-full h-10 bg-slate-100/90 rounded-lg overflow-hidden border border-slate-200">
              <svg
                ref={minimapRef}
                className="w-full h-full"
                preserveAspectRatio="none"
                viewBox={`0 0 ${chartWidth} 40`}
              >
                {/* Full dataset mini-bars */}
                {fullDataWithSMA.map((item, idx) => {
                  const x = (idx / Math.max(1, fullDataWithSMA.length - 1)) * chartWidth;
                  const barH = (item.count / minimapMaxVolume) * 32;
                  return (
                    <rect
                      key={`mini-${item.date}`}
                      x={x}
                      y={40 - barH}
                      width={Math.max(2, chartWidth / fullDataWithSMA.length - 1)}
                      height={barH}
                      fill="#94a3b8"
                      opacity="0.6"
                    />
                  );
                })}
              </svg>

              {/* Highlighted Draggable Viewport Brush Box */}
              <div
                className="absolute top-0 bottom-0 bg-blue-500/20 border-y-2 border-blue-500 cursor-grab active:cursor-grabbing flex items-center justify-between"
                style={{
                  left: `${brushLeftPercent}%`,
                  width: `${brushWidthPercent}%`,
                }}
                onMouseDown={(e) => handleBrushMouseDown('move', e)}
              >
                {/* Left Resize Handle */}
                <div
                  className="w-2.5 h-full bg-blue-600 hover:bg-blue-700 cursor-ew-resize flex items-center justify-center shadow-sm"
                  onMouseDown={(e) => handleBrushMouseDown('start', e)}
                >
                  <div className="w-0.5 h-4 bg-white rounded-full" />
                </div>

                {/* Right Resize Handle */}
                <div
                  className="w-2.5 h-full bg-blue-600 hover:bg-blue-700 cursor-ew-resize flex items-center justify-center shadow-sm"
                  onMouseDown={(e) => handleBrushMouseDown('end', e)}
                >
                  <div className="w-0.5 h-4 bg-white rounded-full" />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Selected Day Message Inspector Drawer (Appears when clicking a day on the graph) */}
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
    </div>
  );
};
