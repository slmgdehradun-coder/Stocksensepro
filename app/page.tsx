'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Exchange, fetchYahooFinanceData, StockData, TimeFrame } from '@/lib/dataFetcher';
import { calculateIndicators, IndicatorSet } from '@/lib/indicators';
import { detectPatterns } from '@/lib/patterns';
import {
  backtestPattern,
  computeMarketRegime,
  computeRelativeStrength,
  generateAIPrediction,
  BacktestResult,
  PredictionContext,
} from '@/lib/aiPrediction';
import dynamic from 'next/dynamic';
const StockChart = dynamic(() => import('@/components/StockChart'), { ssr: false });
import AIPredictionPanel from '@/components/AIPredictionPanel';
import SearchBar from '@/components/SearchBar';
import Chatbot from '@/components/Chatbot';
import PaperTradingPanel from '@/components/PaperTradingPanel';
import Link from 'next/link';
import { Activity, AlertCircle, Loader2, Home, Crown, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import AppHeader from '@/components/AppHeader';
import LegalDisclaimer from '@/components/LegalDisclaimer';

const POPULAR_STOCKS = [
  'RELIANCE', 'TCS', 'HDFCBANK', 'INFY', 'ICICIBANK', 'HINDUNILVR',
  'SBIN', 'TATAMOTORS', 'ZOMATO', 'ADANIENT', 'ITC', 'LT', 'BAJFINANCE', 'BHARTIARTL'
];

const POPULAR_GLOBAL = [
  { symbol: 'GC=F', name: 'Gold' },
  { symbol: 'SI=F', name: 'Silver' },
  { symbol: 'CL=F', name: 'Crude Oil' },
  { symbol: 'NG=F', name: 'Natural Gas' },
  { symbol: 'BTC-USD', name: 'Bitcoin' },
  { symbol: 'ETH-USD', name: 'Ethereum' },
  { symbol: 'INR=X', name: 'USD/INR' },
  { symbol: '^NSEI', name: 'NIFTY 50' },
];

const POPULAR_US = [
  { symbol: 'AAPL', name: 'Apple' },
  { symbol: 'MSFT', name: 'Microsoft' },
  { symbol: 'NVDA', name: 'NVIDIA' },
  { symbol: 'GOOGL', name: 'Alphabet' },
  { symbol: 'AMZN', name: 'Amazon' },
  { symbol: 'TSLA', name: 'Tesla' },
  { symbol: 'META', name: 'Meta' },
  { symbol: 'SPY', name: 'S&P 500 ETF' },
];

const BENCHMARK_SYMBOLS = new Set(['NIFTY', '^NSEI', 'BANKNIFTY', '^NSEBANK', 'SENSEX', '^BSESN', 'INDIAVIX', '^INDIAVIX']);

// NIFTY + India VIX are the same for every symbol lookup within a short window, so they are
// cached at module scope to avoid re-fetching the whole index on every search.
let regimeInputsCache: { at: number; niftyData: StockData | null; vixData: StockData | null } | null = null;
const REGIME_CACHE_TTL_MS = 2 * 60 * 1000;

async function getRegimeInputs(): Promise<{ niftyData: StockData | null; vixData: StockData | null }> {
  const now = Date.now();
  if (regimeInputsCache && now - regimeInputsCache.at < REGIME_CACHE_TTL_MS) {
    return regimeInputsCache;
  }
  const [niftyResult, vixResult] = await Promise.allSettled([
    fetchYahooFinanceData('NIFTY', 'NSE', '1d'),
    fetchYahooFinanceData('INDIAVIX', 'NSE', '1d'),
  ]);
  const niftyData = niftyResult.status === 'fulfilled' ? niftyResult.value : null;
  const vixData = vixResult.status === 'fulfilled' ? vixResult.value : null;
  regimeInputsCache = { at: now, niftyData, vixData };
  return regimeInputsCache;
}

/** Best-effort market context: NIFTY/VIX regime, weekly trend, and relative strength. Never throws. */
async function buildPredictionContext(querySymbol: string, exchange: Exchange, candles: StockData['candles']): Promise<PredictionContext | undefined> {
  try {
    const isBenchmark = BENCHMARK_SYMBOLS.has(querySymbol.toUpperCase());
    const [regimeInputs, weeklyResult] = await Promise.all([
      isBenchmark ? Promise.resolve({ niftyData: null, vixData: null }) : getRegimeInputs(),
      fetchYahooFinanceData(querySymbol, exchange, '1wk').catch(() => null),
    ]);

    const { niftyData, vixData } = regimeInputs;
    const niftyIndicators = niftyData && niftyData.candles.length >= 50 ? calculateIndicators(niftyData.candles) : null;
    const vixLatest = vixData?.candles?.length ? vixData.candles[vixData.candles.length - 1].close : undefined;
    const weeklyIndicators = weeklyResult && weeklyResult.candles.length >= 30 ? calculateIndicators(weeklyResult.candles) : null;

    const marketRegime = niftyIndicators ? computeMarketRegime(niftyIndicators.trendScore, vixLatest) : undefined;
    const relativeStrength = niftyData && !isBenchmark ? computeRelativeStrength(candles, niftyData.candles, 20) : undefined;
    const higherTimeframeTrend = weeklyIndicators?.trendScore;

    if (!marketRegime && !relativeStrength && !higherTimeframeTrend) return undefined;
    return { marketRegime, relativeStrength, higherTimeframeTrend };
  } catch {
    // Context is a best-effort enhancement; the deterministic engine still works without it.
    return undefined;
  }
}

export default function Dashboard() {
  const { user } = useAuth();
  const [symbol, setSymbol] = useState('');
  const [exchange, setExchange] = useState<Exchange>('NSE');
  const [timeFrame, setTimeFrame] = useState<TimeFrame>('1d');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stockData, setStockData] = useState<StockData | null>(null);
  const [indicators, setIndicators] = useState<IndicatorSet | null>(null);
  const [patterns, setPatterns] = useState<any[]>([]);
  const [backtestResults, setBacktestResults] = useState<BacktestResult[]>([]);
  const [prediction, setPrediction] = useState<any>(null);
  const [currentPattern, setCurrentPattern] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadData = useCallback(async (querySymbol: string, overrideExchange?: Exchange, overrideTimeFrame?: TimeFrame, silent: boolean = false) => {
    if (!silent) setLoading(true);
    if (!silent) setError(null);
    try {
      let data: StockData;
      const tf = overrideTimeFrame || timeFrame;
      const ex = overrideExchange || exchange;
      setSymbol(querySymbol);
      setExchange(ex);
      setTimeFrame(tf);
      data = await fetchYahooFinanceData(querySymbol, ex, tf);

      if (data.candles.length < 50) {
        throw new Error('Not enough historical data for analysis (need at least 50 data points).');
      }

      setStockData(data);
      setLastUpdated(new Date());

      // Calculate Indicators
      const ind = calculateIndicators(data.candles);
      setIndicators(ind);

      // Detect Patterns
      const pats = detectPatterns(data.candles);
      setPatterns(pats);

      // Backtest Patterns
      const uniquePatterns = Array.from(new Set(pats.map(p => p.name)));
      const btResults = uniquePatterns.map(pName => {
        const indices = pats.filter(p => p.name === pName).map(p => p.index);
        return backtestPattern(data.candles, indices, pName);
      });
      setBacktestResults(btResults);

      // Generate Prediction (with best-effort market regime / MTF / relative-strength context)
      const context = await buildPredictionContext(querySymbol, ex, data.candles);
      const pred = generateAIPrediction(data.candles, pats, ind, btResults, context);
      setPrediction(pred);

      if (pred) {
        fetch('/api/ai/prediction', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbol: data.symbol,
            metadata: data.metadata,
            latestCandle: data.candles.at(-1),
            prediction: pred,
            trendScore: ind.trendScore,
            supportResistance: ind.supportResistance,
            recentPatterns: pats.slice(-6),
            backtestResults: btResults,
          }),
        })
          .then(res => res.ok ? res.json() : null)
          .then(ai => {
            if (ai?.text) {
              setPrediction((current: any) => current ? { ...current, aiNarrative: ai.text, aiModel: ai.model } : current);
            }
          })
          .catch(() => {
            // Local technical prediction remains available if Gemini is unavailable.
          });
      }

      // Find current pattern if any (most recent stable pattern)
      const referenceIdx = data.candles.length - 2;
      const stablePatterns = pats.filter(p => p.index <= referenceIdx);
      const latestPattern = stablePatterns.length > 0 ? stablePatterns[stablePatterns.length - 1] : null;
      setCurrentPattern(latestPattern ? latestPattern.name : null);

    } catch (err: any) {
      if (!silent) setError(err.message || 'Failed to load data');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [exchange, timeFrame]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialSymbol = params.get('symbol');
    if (initialSymbol && !stockData && !loading) {
      loadData(initialSymbol, exchange, timeFrame);
    }
  }, [exchange, loadData, loading, stockData, timeFrame]);

  useEffect(() => {
    if (!symbol) return;
    
    // Auto-refresh every 30 seconds for real-time updates
    const intervalId = setInterval(() => {
      loadData(symbol, exchange, timeFrame, true);
    }, 30000);

    return () => clearInterval(intervalId);
  }, [symbol, exchange, timeFrame, loadData]);

  const resetHome = () => {
    setStockData(null);
    setSymbol('');
    setPrediction(null);
    setIndicators(null);
    setPatterns([]);
    setBacktestResults([]);
  };

  return (
    <div className="min-h-screen bg-ink text-fg-muted font-sans selection:bg-accent-soft">
      <AppHeader>
        <div className="flex items-center gap-3">
          <SearchBar 
            symbol={symbol}
            setSymbol={setSymbol}
            exchange={exchange}
            setExchange={setExchange}
            timeFrame={timeFrame}
            setTimeFrame={setTimeFrame}
            onSearch={(s, ex, tf) => {
              if (s) loadData(s, ex, tf);
            }}
          />
          {stockData && (
            <button
              onClick={resetHome}
              className="flex items-center gap-2 rounded-lg border border-border-hair bg-surface px-3 py-2 text-sm font-medium text-fg transition-colors hover:bg-surface-raised"
            >
              <Home className="h-4 w-4" />
              <span className="hidden sm:inline">Home</span>
            </button>
          )}
        </div>
      </AppHeader>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Quick Load Buttons */}
        {!stockData && !loading && (
          <div className="mb-12 space-y-10">
            <div className="border-b border-border-hair pb-8">
              <span className="badge badge-accent mb-4">
                <Sparkles className="w-3 h-3" /> AI-Powered Analysis
              </span>
              <h1 className="font-display text-3xl sm:text-4xl font-bold text-fg tracking-tight mb-3">
                Institutional-grade market analysis,<br className="hidden sm:block" /> for every investor.
              </h1>
              <p className="text-fg-muted max-w-2xl">
                Search any Indian or global symbol for technical signals, AI predictions, and fundamental
                scoring in one terminal - or jump in with a symbol below.
              </p>
            </div>

            <div>
              <h2 className="text-xs font-semibold text-fg-subtle uppercase tracking-wider mb-4 flex items-center gap-2">
                <Activity className="w-3.5 h-3.5" /> Popular Indian Stocks
              </h2>
              <div className="flex flex-wrap gap-2.5">
                {POPULAR_STOCKS.map(s => (
                  <button
                    key={s}
                    onClick={() => { setSymbol(s); setExchange('NSE'); loadData(s, 'NSE', timeFrame); }}
                    className="px-4 py-2 rounded-lg bg-surface border border-border-hair text-sm font-medium text-fg-muted hover:bg-accent-soft hover:border-accent hover:text-accent-strong transition-all"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            
            <div>
              <h2 className="text-xs font-semibold text-fg-subtle uppercase tracking-wider mb-4 flex items-center gap-2">
                <Activity className="w-3.5 h-3.5" /> MCX Commodities (India)
              </h2>
              <div className="flex flex-wrap gap-2.5">
                {['GOLD', 'SILVER', 'CRUDEOIL', 'NATURALGAS', 'COPPER', 'ZINC'].map(s => (
                  <button
                    key={s}
                    onClick={() => { setSymbol(s); setExchange('MCX'); loadData(s, 'MCX', timeFrame); }}
                    className="px-4 py-2 rounded-lg bg-surface border border-border-hair text-sm font-medium text-fg-muted hover:bg-accent-soft hover:border-accent hover:text-accent-strong transition-all"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-xs font-semibold text-fg-subtle uppercase tracking-wider mb-4 flex items-center gap-2">
                <Activity className="w-3.5 h-3.5" /> Popular US Stocks
              </h2>
              <div className="flex flex-wrap gap-2.5">
                {POPULAR_US.map(item => (
                  <button
                    key={item.symbol}
                    onClick={() => { setSymbol(item.symbol); setExchange('US'); loadData(item.symbol, 'US', timeFrame); }}
                    className="px-4 py-2 rounded-lg bg-surface border border-border-hair text-sm font-medium text-fg-muted hover:bg-accent-soft hover:border-accent hover:text-accent-strong transition-all flex items-center gap-2"
                  >
                    <span>{item.name}</span>
                    <span className="text-xs opacity-60 data-mono">({item.symbol})</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-xs font-semibold text-fg-subtle uppercase tracking-wider mb-4 flex items-center gap-2">
                <Activity className="w-3.5 h-3.5" /> Global Commodities & Crypto
              </h2>
              <div className="flex flex-wrap gap-2.5">
                {POPULAR_GLOBAL.map(item => (
                  <button
                    key={item.symbol}
                    onClick={() => { setSymbol(item.symbol); setExchange('GLOBAL'); loadData(item.symbol, 'GLOBAL', timeFrame); }}
                    className="px-4 py-2 rounded-lg bg-surface border border-border-hair text-sm font-medium text-fg-muted hover:bg-accent-soft hover:border-accent hover:text-accent-strong transition-all flex items-center gap-2"
                  >
                    <span>{item.name}</span>
                    <span className="text-xs opacity-60 data-mono">({item.symbol})</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-32 text-fg-muted">
            <Loader2 className="w-8 h-8 animate-spin mb-4 text-accent" />
            <p className="text-lg font-medium">Analyzing market data...</p>
            <p className="text-sm opacity-60 mt-2">Fetching history, detecting patterns, running AI models</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="p-4 rounded-xl bg-bearish-soft border border-bearish/20 flex items-start gap-3 text-bearish mb-8">
            <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
            <div>
              <h3 className="font-medium">Analysis Failed</h3>
              <p className="text-sm opacity-80 mt-1">{error}</p>
            </div>
          </div>
        )}

        {/* Dashboard Content */}
        {stockData && !loading && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Stock Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-3xl font-bold text-fg flex items-center gap-3 font-display">
                  {stockData.symbol}
                  <span className={`badge ${stockData.isLive ? 'badge-bullish' : 'badge-info'} data-mono`}>
                    {stockData.isLive && <span className="w-1.5 h-1.5 rounded-full bg-bullish animate-pulse"></span>}
                    {stockData.isLive ? 'LIVE' : '⬆ MANUAL'}
                  </span>
                </h2>
                <p className="text-fg-muted mt-1 flex items-center gap-2 flex-wrap">
                  Last updated: {typeof stockData.candles[stockData.candles.length - 1].time === 'number' 
                    ? new Date(stockData.candles[stockData.candles.length - 1].time as number * 1000).toLocaleString() 
                    : stockData.candles[stockData.candles.length - 1].time} | 
                  Close: <span className="data-mono text-fg">{stockData.currency === 'USD' ? '$' : '₹'}{stockData.candles[stockData.candles.length - 1].close.toFixed(2)}</span>
                  {lastUpdated && (
                    <span className="text-xs text-fg-subtle flex items-center gap-1 ml-4 bg-surface px-2 py-1 rounded-md border border-border-hair">
                      <span className="w-1.5 h-1.5 rounded-full bg-bullish animate-pulse mr-1"></span>
                      Auto-refreshed at {lastUpdated.toLocaleTimeString()}
                    </span>
                  )}
                </p>
                {stockData.metadata && (
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-md border border-border-hair bg-surface px-2 py-1 text-fg-muted">
                      Source: {stockData.metadata.provider.toUpperCase()} · {stockData.metadata.dataQuality}
                    </span>
                    {stockData.metadata.fallbackChain.length > 1 && (
                      <span className="rounded-md border border-info/20 bg-info-soft px-2 py-1 text-info">
                        Resolved via {stockData.metadata.fallbackChain.join(' > ')}
                      </span>
                    )}
                    {stockData.metadata.warnings.slice(0, 2).map(warning => (
                      <span key={warning} className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-amber-200">
                        {warning}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* AI Prediction Panel */}
            {prediction && (
              user?.isPro ? (
                <AIPredictionPanel 
                  prediction={prediction} 
                  backtest={backtestResults} 
                  currentPattern={currentPattern || 'No clear pattern currently'} 
                  lastCandleTime={stockData.candles[stockData.candles.length - 1]?.time}
                  timeFrame={timeFrame}
                  currency={stockData.currency}
                />
              ) : (
                <div className="p-8 rounded-2xl border border-accent/20 bg-accent-soft backdrop-blur-sm flex flex-col items-center justify-center text-center">
                  <div className="w-12 h-12 rounded-full bg-accent-soft flex items-center justify-center mb-4">
                    <Activity className="w-6 h-6 text-accent" />
                  </div>
                  <h3 className="text-xl font-bold text-fg mb-2 font-display">AI Prediction Engine Locked</h3>
                  <p className="text-fg-muted max-w-md mb-6">
                    Upgrade to Pro to unlock advanced AI predictions, target prices, stop loss calculations, and historical pattern backtesting.
                  </p>
                  <Link
                    href="/upgrade"
                    className="px-6 py-3 bg-accent hover:bg-accent-strong text-ink font-semibold rounded-lg transition-colors"
                  >
                    Upgrade to Pro
                  </Link>
                </div>
              )
            )}

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
              {/* Chart */}
              <div className="lg:col-span-3 surface-card p-4">
                <div className="flex flex-col gap-3 mb-4 px-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-lg font-medium text-fg font-display">Technical Chart</h3>
                    {indicators?.trendScore && (
                      <p className="text-xs text-fg-subtle">
                        Trend score: <span className="data-mono text-accent">{indicators.trendScore.score}</span> ({indicators.trendScore.label})
                      </p>
                    )}
                  </div>
                  {/* Dot colors here are matched to StockChart's actual line colors, not the
                      brand palette - they must stay in sync with what's literally drawn. */}
                  <div className="flex flex-wrap gap-3 text-xs data-mono text-fg-subtle">
                    <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-blue-500"></div> EMA 20</span>
                    <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-yellow-500"></div> EMA 50</span>
                    <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-purple-500"></div> EMA 200</span>
                    <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-orange-500"></div> SMA/VWAP/BB</span>
                  </div>
                </div>
                <StockChart data={stockData.candles} indicators={indicators} patterns={patterns} />
              </div>

              {/* Paper Trading */}
              <div className="lg:col-span-1">
                {user?.isPro ? (
                  <PaperTradingPanel 
                    symbol={stockData.symbol} 
                    currentPrice={stockData.candles[stockData.candles.length - 1].close} 
                    currency={stockData.currency}
                    exchange={stockData.metadata?.exchange}
                  />
                ) : (
                  <div className="rounded-2xl border border-accent/20 bg-accent-soft p-6 text-center">
                    <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft">
                      <Crown className="h-5 w-5 text-accent" />
                    </div>
                    <h3 className="font-bold text-fg font-display">Paper Trading is Pro</h3>
                    <p className="mt-2 text-sm text-fg-muted">Virtual balance, holdings, live P&L, stop-loss and target simulation unlock after admin-approved Pro access.</p>
                    <Link href="/upgrade" className="mt-4 inline-flex rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-ink hover:bg-accent-strong">
                      Upgrade
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
      <footer className="max-w-7xl mx-auto px-4 pb-8">
        <LegalDisclaimer />
      </footer>
      
      <Chatbot stockData={stockData} prediction={prediction} />
    </div>
  );
}
