'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Activity, Loader2, TrendingUp, TrendingDown, Target, ShieldAlert, Filter, Clock } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import AppHeader from '@/components/AppHeader';
import AuthModal from '@/components/AuthModal';
import ProGuard from '@/components/ProGuard';
import LegalDisclaimer from '@/components/LegalDisclaimer';
import { fetchYahooFinanceData, TimeFrame, TIME_FRAME_CONFIGS } from '@/lib/dataFetcher';
import { calculateIndicators } from '@/lib/indicators';
import { detectPatterns } from '@/lib/patterns';
import { backtestPattern, computeMarketRegime, computeRelativeStrength, generateAIPrediction, MarketRegime } from '@/lib/aiPrediction';
import { NSE_SECTOR_MAP as SECTOR_MAP } from '@/lib/sectors';
import dynamic from 'next/dynamic';
const StockChart = dynamic(() => import('@/components/StockChart'), { ssr: false });

const STOCKS_TO_SCAN = [
  // Nifty 50
  'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'SBIN', 'BHARTIARTL', 'ITC', 'LT', 'BAJFINANCE', 
  'AXISBANK', 'KOTAKBANK', 'HINDUNILVR', 'MARUTI', 'SUNPHARMA', 'TATAMOTORS', 'M&M', 'ASIANPAINT', 
  'TITAN', 'ULTRACEMCO', 'NTPC', 'POWERGRID', 'TATASTEEL', 'COALINDIA', 'BAJAJFINSV', 'HCLTECH', 
  'ADANIENT', 'ADANIPORTS', 'ONGC', 'HINDALCO', 'JSWSTEEL', 'GRASIM', 'WIPRO', 'TECHM', 'DRREDDY', 
  'CIPLA', 'APOLLOHOSP', 'DIVISLAB', 'EICHERMOT', 'HEROMOTOCO', 'BAJAJ-AUTO', 'TATACONSUM', 
  'BRITANNIA', 'NESTLEIND', 'INDUSINDBK', 'HDFCLIFE', 'SBILIFE', 'BPCL', 'SHRIRAMFIN', 'TRENT',
  // Popular Mid/Small Caps & New Age
  'ZOMATO', 'JIOFIN', 'SUZLON', 'IREDA', 'RVNL', 'MAZDOCK', 'COCHINSHIP', 'PAYTM', 'NYKAA',
  'BEL', 'HAL', 'PFC', 'RECLTD', 'IRFC', 'JINDALSTEL', 'TVSMOTOR', 'CUMMINSIND',
  'BHEL', 'PNB', 'BANKBARODA', 'TORNTPHARM', 'MAXHEALTH', 'CGPOWER', 'DIXON', 'POLYCAB', 'LUPIN'
];

const SECTORS = ['All', ...Array.from(new Set(Object.values(SECTOR_MAP))).sort(), 'Other'];

const STRATEGY_FILTERS = [
  { id: 'all', name: 'All Setups' },
  { id: 'gainers', name: 'Top Gainers' },
  { id: 'losers', name: 'Top Losers' },
  { id: 'rsi-oversold', name: 'RSI Oversold (< 35)' },
  { id: 'rsi-overbought', name: 'RSI Overbought (> 65)' },
  { id: 'volume-breakout', name: 'Volume Breakout' },
  { id: 'macd-crossover', name: 'MACD Crossover' },
  { id: 'high-win-rate', name: 'High Win Rate (80-90%) 🔒 PRO' },
  { id: 'golden-cross', name: 'Golden Cross (50 SMA > 200 SMA)' },
  { id: 'rsi-divergence', name: 'RSI Extremes (RSI < 35 or > 65)' },
  { id: 'bollinger-squeeze', name: 'Bollinger Squeeze (Narrow Bands)' },
  { id: 'triple-screen', name: 'Triple Screen Trading System' },
  { id: 'vcp', name: 'Volatility Contraction Pattern (VCP)' },
];

function ScreenerContent() {
  const searchParams = useSearchParams();
  const initialStrategy = searchParams.get('strategy') || 'all';

  const { user } = useAuth();
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [timeFrame, setTimeFrame] = useState<TimeFrame>('1d');
  const [strategy, setStrategy] = useState(initialStrategy);
  const [sector, setSector] = useState('All');
  const [isScanning, setIsScanning] = useState(false);
  const [isAutoScan, setIsAutoScan] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: STOCKS_TO_SCAN.length, symbol: '' });
  const [results, setResults] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'bullish' | 'bearish'>('bullish');
  const [marketRegime, setMarketRegime] = useState<MarketRegime | undefined>(undefined);

  const abortScanRef = React.useRef(false);
  const autoScanTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const timeFrameRef = React.useRef(timeFrame);

  useEffect(() => {
    timeFrameRef.current = timeFrame;
  }, [timeFrame]);

  useEffect(() => {
    if (searchParams.get('strategy')) {
      setStrategy(searchParams.get('strategy') || 'all');
    }
  }, [searchParams]);

  useEffect(() => {
    return () => {
      abortScanRef.current = true;
      if (autoScanTimerRef.current) clearTimeout(autoScanTimerRef.current);
    };
  }, []);

  const startScan = async (continuous = false) => {
    if (isScanning) return;
    setIsScanning(true);
    if (continuous) setIsAutoScan(true);
    abortScanRef.current = false;
    
    // Clear results only on first manual scan, not on auto-scan loops
    if (!continuous && results.length === 0) {
      setResults([]);
    }

    const runScan = async () => {
      const newResults = [];

      // Fetch NIFTY + India VIX once per scan cycle (not per stock) to build a market-wide
      // regime read that every stock's prediction can be weighed against.
      let marketRegimeForScan: MarketRegime | undefined;
      let niftyCandlesForScan: any[] | null = null;
      try {
        const [niftyData, vixData] = await Promise.all([
          fetchYahooFinanceData('NIFTY', 'NSE', '1d').catch(() => null),
          fetchYahooFinanceData('INDIAVIX', 'NSE', '1d').catch(() => null),
        ]);
        if (niftyData && niftyData.candles.length >= 50) {
          const niftyIndicators = calculateIndicators(niftyData.candles);
          const vixLatest = vixData?.candles?.length ? vixData.candles[vixData.candles.length - 1].close : undefined;
          marketRegimeForScan = computeMarketRegime(niftyIndicators.trendScore, vixLatest);
          niftyCandlesForScan = niftyData.candles;
        }
      } catch {
        // Market regime is a best-effort enhancement; the scan still works without it.
      }
      setMarketRegime(marketRegimeForScan);

      for (let i = 0; i < STOCKS_TO_SCAN.length; i++) {
        if (abortScanRef.current) break;
        const sym = STOCKS_TO_SCAN[i];
        setProgress({ current: i + 1, total: STOCKS_TO_SCAN.length, symbol: sym });
        
        try {
          const data = await fetchYahooFinanceData(sym, 'NSE', timeFrameRef.current);
          if (data.candles.length >= 50) {
            const ind = calculateIndicators(data.candles);
            const pats = detectPatterns(data.candles);
            
            const uniquePatterns = Array.from(new Set(pats.map(p => p.name)));
            const btResults = uniquePatterns.map(pName => {
              const indices = pats.filter(p => p.name === pName).map(p => p.index);
              return backtestPattern(data.candles, indices, pName);
            });

            const relativeStrength = niftyCandlesForScan
              ? computeRelativeStrength(data.candles, niftyCandlesForScan, 20)
              : undefined;

            const pred = generateAIPrediction(data.candles, pats, ind, btResults, {
              marketRegime: marketRegimeForScan,
              relativeStrength,
            });
            const last = data.candles[data.candles.length - 1];
            const prev = data.candles[data.candles.length - 2];
            const avgVolume = data.candles.slice(-21, -1).reduce((sum, candle) => sum + candle.volume, 0) / 20;
            
            newResults.push({
              symbol: sym,
              sector: SECTOR_MAP[sym] || 'Other',
              data,
              indicators: ind,
              patterns: pats,
              prediction: pred,
              backtestResults: btResults,
              changePct: prev ? ((last.close - prev.close) / prev.close) * 100 : 0,
              volumeRatio: avgVolume > 0 ? last.volume / avgVolume : 0,
            });
          }
        } catch (err) {
          console.error(`Failed to scan ${sym}`, err);
        }
        
        // Small delay to avoid rate limiting
        await new Promise(res => setTimeout(res, 500));
      }

      if (!abortScanRef.current) {
        setResults(newResults);
        setIsScanning(false);
        
        if (continuous) {
          // Wait 60 seconds then scan again
          autoScanTimerRef.current = setTimeout(() => {
            if (!abortScanRef.current) {
              startScan(true);
            }
          }, 60000);
        }
      }
    };

    runScan();
  };

  const stopScan = () => {
    abortScanRef.current = true;
    setIsScanning(false);
    setIsAutoScan(false);
    if (autoScanTimerRef.current) clearTimeout(autoScanTimerRef.current);
  };

  const getWinRatio = (res: any, type: 'bullish' | 'bearish') => {
    if (res.backtestResults && res.backtestResults.length > 0) {
      const rates = res.backtestResults.map((b: any) => type === 'bullish' ? b.bullishPercent : (100 - b.bullishPercent));
      const maxRate = Math.max(...rates);
      if (maxRate > 0) return Math.round(maxRate);
    }
    return res.prediction.confidence; // Fallback
  };

  const getResultBias = (res: any): 'bullish' | 'bearish' | 'neutral' => {
    if (res.prediction?.logicBias) return res.prediction.logicBias;
    if (res.prediction?.signal?.includes('Buy')) return 'bullish';
    if (res.prediction?.signal?.includes('Sell')) return 'bearish';
    if ((res.prediction?.score || 0) > 0) return 'bullish';
    if ((res.prediction?.score || 0) < 0) return 'bearish';
    return 'neutral';
  };

  const getResultReasons = (res: any) => {
    const bias = getResultBias(res);
    if (bias === 'bullish') return res.prediction?.bullishReasons || [];
    if (bias === 'bearish') return res.prediction?.bearishReasons || [];
    return res.prediction?.neutralReasons || [];
  };

  const filteredResults = results.filter(r => {
    if (sector !== 'All' && r.sector !== sector) return false;
    if (strategy === 'all') return true;
    if (strategy === 'gainers') return r.changePct > 1;
    if (strategy === 'losers') return r.changePct < -1;
    if (strategy === 'volume-breakout') return r.volumeRatio >= 1.5;
    
    if (strategy === 'high-win-rate') {
      const isBullish = r.prediction.signal.includes('Buy');
      const winRatio = getWinRatio(r, isBullish ? 'bullish' : 'bearish');
      return winRatio >= 80 && winRatio <= 90;
    }

    const lastInd = r.indicators;
    const macd = lastInd.macd[lastInd.macd.length - 1];
    const prevMacd = lastInd.macd[lastInd.macd.length - 2];
    
    if (strategy === 'golden-cross') {
      const sma50 = lastInd.sma50[lastInd.sma50.length - 1];
      const sma200 = lastInd.sma200[lastInd.sma200.length - 1];
      const prevSma50 = lastInd.sma50[lastInd.sma50.length - 2];
      const prevSma200 = lastInd.sma200[lastInd.sma200.length - 2];
      
      if (!sma50 || !sma200) return false;
      // Golden cross recently or currently above and close
      return (sma50 > sma200 && prevSma50 <= prevSma200) || (sma50 > sma200 && (sma50 - sma200) / sma200 < 0.05);
    }
    
    if (strategy === 'rsi-divergence') {
      const rsi = lastInd.rsi[lastInd.rsi.length - 1];
      if (!rsi) return false;
      return rsi < 35 || rsi > 65;
    }

    if (strategy === 'rsi-oversold') {
      const rsi = lastInd.rsi[lastInd.rsi.length - 1];
      return Boolean(rsi && rsi < 35);
    }

    if (strategy === 'rsi-overbought') {
      const rsi = lastInd.rsi[lastInd.rsi.length - 1];
      return Boolean(rsi && rsi > 65);
    }

    if (strategy === 'macd-crossover') {
      if (!macd || !prevMacd) return false;
      return (prevMacd.histogram <= 0 && macd.histogram > 0) || (prevMacd.histogram >= 0 && macd.histogram < 0);
    }
    
    if (strategy === 'bollinger-squeeze') {
      const bb = lastInd.bb[lastInd.bb.length - 1];
      if (!bb) return false;
      const width = (bb.upper - bb.lower) / bb.middle;
      return width < 0.05; // Less than 5% width
    }
    
    if (strategy === 'triple-screen') {
      const rsi = lastInd.rsi[lastInd.rsi.length - 1];
      if (!macd || !rsi) return false;
      // MACD histogram positive (trend up) and RSI oversold/pullback (e.g. < 45)
      return macd.histogram > 0 && rsi < 45;
    }
    
    if (strategy === 'vcp') {
      const sma200 = lastInd.sma200[lastInd.sma200.length - 1];
      const close = r.data.candles[r.data.candles.length - 1].close;
      if (!sma200 || close < sma200) return false; // Must be in long term uptrend
      
      // Check if volume is contracting over last 5 days
      const vols = r.data.candles.slice(-5).map((c: any) => c.volume);
      if (vols.length < 5) return false;
      const avgVolFirst2 = (vols[0] + vols[1]) / 2;
      const avgVolLast2 = (vols[3] + vols[4]) / 2;
      return avgVolLast2 < avgVolFirst2 * 0.8; // Volume dried up by at least 20%
    }
    
    return true;
  });

  const rankScore = (res: any) => res.prediction?.confluenceScore ?? res.prediction?.confidence ?? 0;
  const bullishResults = filteredResults.filter(r => getResultBias(r) === 'bullish').sort((a, b) => rankScore(b) - rankScore(a));
  const bearishResults = filteredResults.filter(r => getResultBias(r) === 'bearish').sort((a, b) => rankScore(b) - rankScore(a));

  const displayResults = activeTab === 'bullish' ? bullishResults : bearishResults;

  return (
    <div className="min-h-screen bg-ink text-fg-muted font-sans selection:bg-accent-soft">
      <AppHeader />

      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h2 className="text-3xl font-bold text-white mb-2">All India Stocks Screener</h2>
          <p className="text-slate-400">Scan all major Indian stocks for high-probability bullish and bearish setups across any timeframe.</p>
          {marketRegime && (
            <div
              className={`mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold uppercase tracking-wider ${
                marketRegime.label === 'Risk-On'
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : marketRegime.label === 'Risk-Off'
                    ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                    : marketRegime.label === 'Choppy'
                      ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                      : 'bg-slate-800/50 border-slate-700/50 text-slate-400'
              }`}
              title={marketRegime.notes.join(' ')}
            >
              <Activity className="w-3.5 h-3.5" />
              Market Regime: {marketRegime.label}
              {marketRegime.vixZone && <span className="opacity-70">· VIX {marketRegime.vixZone}</span>}
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 mb-8 p-4 bg-slate-900/50 border border-slate-800 rounded-xl backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-slate-400">Timeframe:</span>
            <select
              value={timeFrame}
              onChange={(e) => setTimeFrame(e.target.value as TimeFrame)}
              disabled={isScanning}
              className="bg-slate-800 text-sm font-medium text-white px-3 py-2 rounded-lg outline-none border border-slate-700 cursor-pointer hover:border-slate-600 disabled:opacity-50"
            >
              {Object.entries(TIME_FRAME_CONFIGS).map(([key, config]) => (
                <option key={key} value={key}>{config.label}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-slate-400 flex items-center gap-1"><Filter className="w-4 h-4" /> Strategy:</span>
            <select
              value={strategy}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'high-win-rate' && !user?.isPro) {
                  setIsAuthModalOpen(true);
                  return;
                }
                setStrategy(val);
              }}
              disabled={isScanning && !isAutoScan}
              className="bg-slate-800 text-sm font-medium text-white px-3 py-2 rounded-lg outline-none border border-slate-700 cursor-pointer hover:border-slate-600 disabled:opacity-50"
            >
              {STRATEGY_FILTERS.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-slate-400">Sector:</span>
            <select
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              disabled={isScanning && !isAutoScan}
              className="bg-slate-800 text-sm font-medium text-white px-3 py-2 rounded-lg outline-none border border-slate-700 cursor-pointer hover:border-slate-600 disabled:opacity-50"
            >
              {SECTORS.map(item => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
          </div>
          
          <div className="flex items-center gap-3 ml-auto">
            {isAutoScan ? (
              <button
                onClick={stopScan}
                className="px-6 py-2 bg-rose-600/20 hover:bg-rose-600/30 text-rose-400 border border-rose-500/30 font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></div>
                Stop Auto-Scan
              </button>
            ) : (
              <button
                onClick={() => startScan(true)}
                disabled={isScanning}
                className="px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 disabled:opacity-50 font-medium rounded-lg transition-colors flex items-center gap-2"
              >
                <Activity className="w-4 h-4" />
                Live Auto-Scan
              </button>
            )}

            <button
              onClick={() => startScan(false)}
              disabled={isScanning}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-800 disabled:text-slate-500 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
            >
              {isScanning && !isAutoScan ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Scanning {progress.symbol} ({progress.current}/{progress.total})
                </>
              ) : (
                <>
                  <Activity className="w-4 h-4" />
                  Scan Once
                </>
              )}
            </button>
          </div>
        </div>

        {/* Results Area */}
        {results.length > 0 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {isAutoScan && isScanning && (
              <div className="flex items-center justify-center gap-2 text-sm text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 mb-4">
                <Loader2 className="w-4 h-4 animate-spin" />
                Live Auto-Scan in progress: Scanning {progress.symbol} ({progress.current}/{progress.total})
              </div>
            )}
            {/* Tabs */}
            <div className="flex items-center gap-4 border-b border-slate-800 pb-px">
              <button
                onClick={() => setActiveTab('bullish')}
                className={`flex items-center gap-2 px-4 py-3 font-medium text-sm border-b-2 transition-colors ${activeTab === 'bullish' ? 'border-emerald-500 text-emerald-400' : 'border-transparent text-slate-400 hover:text-slate-300'}`}
              >
                <TrendingUp className="w-4 h-4" />
                Bullish Opportunities ({bullishResults.length})
              </button>
              <button
                onClick={() => setActiveTab('bearish')}
                className={`flex items-center gap-2 px-4 py-3 font-medium text-sm border-b-2 transition-colors ${activeTab === 'bearish' ? 'border-rose-500 text-rose-400' : 'border-transparent text-slate-400 hover:text-slate-300'}`}
              >
                <TrendingDown className="w-4 h-4" />
                Bearish Opportunities ({bearishResults.length})
              </button>
            </div>

            {/* Grid */}
            {displayResults.length === 0 ? (
              <div className="py-12 text-center text-slate-500">
                No high-probability {activeTab} setups found in the current timeframe.
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {displayResults.map((res, idx) => (
                  <div key={idx} className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden flex flex-col">
                    {/* Card Header */}
                    <div className="p-4 border-b border-slate-800/50 flex items-start justify-between bg-slate-800/20">
                      <div>
                        <h3 className="text-xl font-bold text-white flex items-center gap-2 flex-wrap">
                          {res.symbol}
                          <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${activeTab === 'bullish' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                            {res.prediction.confidence}% CONFIDENCE
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                            {res.prediction.confluenceScore ?? Math.abs(res.prediction.score)}% CONFLUENCE
                          </span>
                          <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                            {getWinRatio(res, activeTab)}% WIN RATE
                          </span>
                          {res.prediction.falseBreakoutRisk && (
                            <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30" title="Breakout lacks volume confirmation or shows a rejection wick">
                              ⚠ BREAKOUT RISK
                            </span>
                          )}
                        </h3>
                        <p className="text-sm text-slate-400 mt-1">
                          Current Price: <span className="font-mono text-white">{res.data.currency === 'USD' ? '$' : '₹'}{res.data.candles[res.data.candles.length - 1].close.toFixed(2)}</span>
                          <span className={`ml-3 font-mono ${res.changePct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {res.changePct >= 0 ? '+' : ''}{res.changePct.toFixed(2)}%
                          </span>
                          <span className="ml-3 text-xs text-slate-500">{res.sector}</span>
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <div className="flex items-center gap-1 text-sm text-emerald-400">
                          <Target className="w-4 h-4" />
                          <span className="font-mono">{res.data.currency === 'USD' ? '$' : '₹'}{res.prediction.targetPrice.toFixed(2)}</span>
                          {res.prediction.tradePlan && (
                            <span className="text-[10px] text-emerald-300/70 font-mono">({res.prediction.tradePlan.target2.rMultiple.toFixed(1)}R)</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 text-sm text-rose-400">
                          <ShieldAlert className="w-4 h-4" />
                          <span className="font-mono">{res.data.currency === 'USD' ? '$' : '₹'}{res.prediction.stopLoss.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                    
                    {/* Card Body - Chart */}
                    <div className="p-4 flex-1">
                      <div className="flex flex-col gap-3 mb-4">
                        <div className="flex items-center justify-between">
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] text-slate-500 uppercase font-bold">Trend Momentum</span>
                            <p className="text-xs text-slate-200">{res.prediction.trendAnalysis}</p>
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] font-medium text-slate-500 bg-slate-800/50 px-2 py-1 rounded border border-slate-700/50 whitespace-nowrap">
                            <Clock className="w-3 h-3 text-blue-400" />
                            {typeof res.data.candles[res.data.candles.length - 1].time === 'number' 
                              ? new Date(res.data.candles[res.data.candles.length - 1].time * 1000).toLocaleTimeString('en-US', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: true }) + ' (IST)'
                              : res.data.candles[res.data.candles.length - 1].time}
                          </div>
                        </div>
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] text-slate-500 uppercase font-bold">Volume Analysis</span>
                          <p className="text-xs text-slate-400 line-clamp-2">{res.prediction.volumeAnalysis}</p>
                        </div>
                        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <div>
                              <span className="text-[10px] text-slate-500 uppercase font-bold">
                                {getResultBias(res) === 'bullish' ? 'Why Bullish' : 'Why Bearish'}
                              </span>
                              <p className="mt-1 text-xs text-slate-300">{res.prediction.logicSummary}</p>
                            </div>
                            <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-bold ${getResultBias(res) === 'bullish' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>
                              Score {res.prediction.score}
                            </span>
                          </div>
                          <div className="space-y-1.5">
                            {getResultReasons(res).slice(0, 3).map((reason: string) => (
                              <div key={reason} className="flex gap-2 text-[11px] text-slate-300">
                                <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${getResultBias(res) === 'bullish' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                                <span>{reason}</span>
                              </div>
                            ))}
                            {getResultReasons(res).length === 0 && (
                              <p className="text-[11px] text-slate-500">Mixed indicators; no strong single reason dominates.</p>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="h-[300px] w-full relative rounded-lg overflow-hidden border border-slate-800/50">
                        <StockChart 
                          data={res.data.candles} 
                          indicators={res.indicators} 
                          patterns={res.patterns} 
                          height={300} 
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <LegalDisclaimer className="mt-8" />
      </main>
    </div>
  );
}

export default function ScreenerPage() {
  return (
    <ProGuard featureName="AI Screener">
      <Suspense fallback={<div className="min-h-screen bg-ink flex items-center justify-center"><Loader2 className="w-8 h-8 text-accent animate-spin" /></div>}>
        <ScreenerContent />
      </Suspense>
    </ProGuard>
  );
}
