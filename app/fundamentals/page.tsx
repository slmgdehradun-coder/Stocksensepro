'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  HelpCircle,
  Loader2,
  Search,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
  XCircle,
} from 'lucide-react';
import { fetchYahooFinanceData } from '@/lib/dataFetcher';
import { calculateIndicators } from '@/lib/indicators';
import { calculateMonthlySeasonality, MonthlySeasonalityStats } from '@/lib/seasonality';
import { SectorFundamentalAnalysis, SectorTechnicalAnalysis } from '@/lib/sectorAnalysis';
import { FundamentalAnalysis, FundamentalVerdict } from '@/lib/types';
import AppHeader from '@/components/AppHeader';
import ProGuard from '@/components/ProGuard';
import LegalDisclaimer from '@/components/LegalDisclaimer';

/**
 * DESIGN SYSTEM - "Institutional Research Terminal"
 * ---------------------------------------------------------------------------
 * This page intentionally diverges from the rest of the app's generic
 * slate/blue dashboard look toward something closer to a real research
 * terminal (Bloomberg / TradingView register): denser, quieter, and built
 * around one non-negotiable rule - every number on this page renders in a
 * tabular monospace face so columns of figures actually align, exactly like
 * a real trading terminal. That's the signature, not a decoration.
 *
 * Palette (6 named tokens, used as Tailwind arbitrary values throughout):
 *   ink       #0A0E13  page background
 *   surface   #12181F  card background
 *   border    #1F2730  hairline dividers
 *   accent    #24C0AC  terminal teal - the one accent color, used sparingly
 *   bull      #34B378  positive / bullish
 *   bear      #E0525C  negative / bearish
 * Type: Space Grotesk (font-display) for headings, IBM Plex Mono (font-data)
 * for every figure, default system stack for body copy/labels (unchanged
 * from the rest of the app, so the chrome still feels of a piece with it).
 */

interface SectorPeerEntry {
  symbol: string;
  analysis: FundamentalAnalysis | null;
  error?: string;
}

interface SectorAnalysisResponse {
  sectorName: string;
  technical: SectorTechnicalAnalysis | null;
  technicalUnavailableReason?: string;
  fundamental: SectorFundamentalAnalysis;
  peers: SectorPeerEntry[];
  error?: string;
}

const POPULAR_SYMBOLS = [
  { symbol: 'RELIANCE', exchange: 'NSE' as const, name: 'RELIANCE' },
  { symbol: 'TCS', exchange: 'NSE' as const, name: 'TCS' },
  { symbol: 'HDFCBANK', exchange: 'NSE' as const, name: 'HDFCBANK' },
  { symbol: 'INFY', exchange: 'NSE' as const, name: 'INFY' },
  { symbol: 'AAPL', exchange: 'US' as const, name: 'Apple' },
  { symbol: 'MSFT', exchange: 'US' as const, name: 'Microsoft' },
  { symbol: 'NVDA', exchange: 'US' as const, name: 'NVIDIA' },
];

const VERDICT_STYLES: Record<FundamentalVerdict, { badge: string; ring: string }> = {
  'Strong Buy': { badge: 'bg-[#34B378]/15 border-[#34B378]/40 text-[#34B378]', ring: '#34B378' },
  Buy: { badge: 'bg-[#34B378]/10 border-[#34B378]/30 text-[#34B378]', ring: '#34B378' },
  Accumulate: { badge: 'bg-[#24C0AC]/10 border-[#24C0AC]/30 text-[#24C0AC]', ring: '#24C0AC' },
  Hold: { badge: 'bg-white/[0.06] border-white/15 text-[#8D97A5]', ring: '#8D97A5' },
  Reduce: { badge: 'bg-[#D6A44E]/10 border-[#D6A44E]/30 text-[#D6A44E]', ring: '#D6A44E' },
  Sell: { badge: 'bg-[#E0525C]/10 border-[#E0525C]/30 text-[#E0525C]', ring: '#E0525C' },
  'Strong Sell': { badge: 'bg-[#E0525C]/15 border-[#E0525C]/40 text-[#E0525C]', ring: '#E0525C' },
};

function formatCompactCurrency(value: number | undefined, currency?: string): string {
  if (value === undefined || !Number.isFinite(value)) return 'N/A';
  const symbol = currency === 'INR' ? '₹' : currency === 'USD' ? '$' : currency ? `${currency} ` : '';
  return `${symbol}${new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 }).format(value)}`;
}

function formatPct(value: number | undefined, digits = 1): string {
  return value === undefined || !Number.isFinite(value) ? 'N/A' : `${value.toFixed(digits)}%`;
}

function formatNum(value: number | undefined, digits = 2): string {
  return value === undefined || !Number.isFinite(value) ? 'N/A' : value.toFixed(digits);
}

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/** Small-caps section marker. These label distinct data domains (Valuation, Growth,
 * etc.) - a functional wayfinding device on a dense page, not decoration. */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#5A6472] mb-3">
      {children}
    </p>
  );
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-[#12181F] border border-[#1F2730] rounded-2xl p-5 sm:p-6 ${className}`}>
      {children}
    </div>
  );
}

/** The signature element: a radial progress ring for a 0-100 score, replacing a plain
 * number so the page's single most important figure (Overall Score) reads at a glance. */
function ConfluenceGauge({ score, size = 104 }: { score: number; size?: number }) {
  const strokeWidth = 9;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, score));
  const offset = circumference * (1 - clamped / 100);
  const color = clamped >= 65 ? '#34B378' : clamped >= 40 ? '#D6A44E' : '#E0525C';

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#1F2730" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-data text-2xl font-semibold text-[#E8ECF1] leading-none">{Math.round(clamped)}</span>
        <span className="text-[9px] uppercase tracking-wider text-[#5A6472] mt-1">/ 100</span>
      </div>
    </div>
  );
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  const color = value >= 65 ? 'bg-[#34B378]' : value >= 40 ? 'bg-[#D6A44E]' : 'bg-[#E0525C]';
  return (
    <div>
      <div className="flex justify-between items-baseline text-xs mb-1.5">
        <span className="text-[#8D97A5]">{label}</span>
        <span className="font-data text-[#E8ECF1] font-medium tabular-nums">{value}</span>
      </div>
      <div className="h-1.5 rounded-full bg-[#1B222B] overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all duration-500`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

function RatioRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline py-2 border-b border-[#1F2730] last:border-0">
      <span className="text-[#8D97A5] text-sm">{label}</span>
      <span className={`font-data text-sm tabular-nums ${value === 'N/A' ? 'text-[#4A525E]' : 'text-[#E8ECF1]'}`}>{value}</span>
    </div>
  );
}

function StatBadge({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'bull' | 'bear' }) {
  const valueColor = tone === 'bull' ? 'text-[#34B378]' : tone === 'bear' ? 'text-[#E0525C]' : 'text-[#E8ECF1]';
  return (
    <div>
      <p className="text-[10px] text-[#5A6472] uppercase font-semibold tracking-wider mb-1">{label}</p>
      <p className={`font-data text-sm tabular-nums ${valueColor}`}>{value}</p>
    </div>
  );
}

function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-white/[0.05] ${className}`} />;
}

const MONTH_SHORT = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

function SeasonalityStrip({ months, title }: { months: MonthlySeasonalityStats[]; title: string }) {
  const usable = months.filter(m => m.samples > 0);
  if (usable.length === 0) {
    return (
      <Card>
        <h4 className="font-display text-[#E8ECF1] font-semibold text-sm mb-2">{title}</h4>
        <p className="text-xs text-[#5A6472]">Not enough monthly price history is available yet to compute seasonality.</p>
      </Card>
    );
  }
  const bestMonth = usable.reduce((best, m) => (m.avgReturn > best.avgReturn ? m : best), usable[0]);
  const worstMonth = usable.reduce((worst, m) => (m.avgReturn < worst.avgReturn ? m : worst), usable[0]);
  const maxAbs = Math.max(...usable.map(m => Math.abs(m.avgReturn)), 1);

  return (
    <Card>
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <h4 className="font-display text-[#E8ECF1] font-semibold text-sm flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-[#24C0AC]" />{title}
        </h4>
        <span className="text-[10px] text-[#5A6472] font-data">up to {Math.max(...usable.map(m => m.samples))}y sample</span>
      </div>
      <div className="grid grid-cols-12 gap-1 sm:gap-1.5 items-end h-24 mb-3">
        {months.map((m) => {
          const hasData = m.samples > 0;
          const heightPct = hasData ? Math.max(8, (Math.abs(m.avgReturn) / maxAbs) * 100) : 4;
          const positive = m.avgReturn >= 0;
          return (
            <div key={m.month} className="flex flex-col items-center justify-end h-full" title={hasData ? `${m.monthName}: avg ${m.avgReturn.toFixed(1)}%, win rate ${m.winRate.toFixed(0)}% (${m.samples}y)` : `${m.monthName}: no data`}>
              <div
                className={`w-full rounded-sm ${!hasData ? 'bg-[#1F2730]' : positive ? 'bg-[#34B378]/70' : 'bg-[#E0525C]/70'}`}
                style={{ height: `${heightPct}%` }}
              />
              <span className="text-[9px] text-[#5A6472] mt-1 font-data">{MONTH_SHORT[m.month - 1]}</span>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-4 text-xs pt-3 border-t border-[#1F2730]">
        <div className="flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5 text-[#34B378]" />
          <span className="text-[#8D97A5]">Best: <span className="text-[#34B378] font-data tabular-nums">{bestMonth.monthName} ({bestMonth.avgReturn >= 0 ? '+' : ''}{bestMonth.avgReturn.toFixed(1)}%)</span></span>
        </div>
        <div className="flex items-center gap-1.5">
          <TrendingDown className="w-3.5 h-3.5 text-[#E0525C]" />
          <span className="text-[#8D97A5]">Worst: <span className="text-[#E0525C] font-data tabular-nums">{worstMonth.monthName} ({worstMonth.avgReturn.toFixed(1)}%)</span></span>
        </div>
      </div>
    </Card>
  );
}

function sectorTrendBadgeClass(label: string): string {
  if (label === 'Bullish') return 'bg-[#34B378]/10 border-[#34B378]/30 text-[#34B378]';
  if (label === 'Bearish') return 'bg-[#E0525C]/10 border-[#E0525C]/30 text-[#E0525C]';
  return 'bg-white/[0.06] border-white/15 text-[#8D97A5]';
}

function fundamentalLabelBadgeClass(label: string): string {
  if (label === 'Fundamentally Strong') return 'bg-[#34B378]/10 border-[#34B378]/30 text-[#34B378]';
  if (label === 'Fundamentally Weak') return 'bg-[#E0525C]/10 border-[#E0525C]/30 text-[#E0525C]';
  if (label === 'Insufficient Data') return 'bg-white/[0.04] border-white/10 text-[#5A6472]';
  return 'bg-[#D6A44E]/10 border-[#D6A44E]/30 text-[#D6A44E]';
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function FundamentalsContent() {
  const [searchInput, setSearchInput] = useState('RELIANCE');
  const [exchange, setExchange] = useState<'NSE' | 'BSE' | 'US'>('NSE');
  const [selected, setSelected] = useState<{ symbol: string; exchange: 'NSE' | 'BSE' | 'US' }>({ symbol: 'RELIANCE', exchange: 'NSE' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<FundamentalAnalysis | null>(null);

  const [stockSeasonality, setStockSeasonality] = useState<MonthlySeasonalityStats[] | null>(null);
  const [sectorData, setSectorData] = useState<SectorAnalysisResponse | null>(null);
  const [sectorLoading, setSectorLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAnalysis(null);

    // Best-effort: blend in the existing technical trend score so the verdict reflects
    // both fundamentals and current price action, not fundamentals in isolation.
    let technicalTrendScore: number | undefined;
    try {
      const priceData = await fetchYahooFinanceData(selected.symbol, selected.exchange, '1d');
      if (priceData.candles.length >= 50) {
        technicalTrendScore = calculateIndicators(priceData.candles).trendScore?.score;
      }
    } catch {
      // Technical context is optional - the fundamentals verdict still works without it.
    }

    try {
      const params = new URLSearchParams({ symbol: selected.symbol, exchange: selected.exchange });
      if (typeof technicalTrendScore === 'number') params.set('technicalTrendScore', String(technicalTrendScore));

      const response = await fetch(`/api/fundamentals?${params.toString()}`);
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || `Request failed with ${response.status}`);
      setAnalysis(result as FundamentalAnalysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load fundamental data');
    } finally {
      setLoading(false);
    }
  }, [selected]);

  // Sector analysis (technical trend + 10y performance + peer comparison) and this stock's
  // own 10-year monthly seasonality are both independent of the main fundamentals fetch
  // above, so they load in parallel rather than blocking or being blocked by it.
  useEffect(() => {
    let cancelled = false;
    setStockSeasonality(null);
    setSectorData(null);
    setSectorLoading(true);

    (async () => {
      try {
        const monthlyData = await fetchYahooFinanceData(selected.symbol, selected.exchange, '1mo');
        if (!cancelled && monthlyData.candles.length > 0) {
          setStockSeasonality(calculateMonthlySeasonality(monthlyData.candles));
        }
      } catch {
        // Seasonality is a supplementary view - leave it blank rather than blocking the page.
      }
    })();

    (async () => {
      try {
        const params = new URLSearchParams({ symbol: selected.symbol, exchange: selected.exchange, excludeSymbol: selected.symbol });
        const response = await fetch(`/api/sector-analysis?${params.toString()}`);
        const result = await response.json().catch(() => null);
        if (!cancelled) {
          if (response.ok) setSectorData(result as SectorAnalysisResponse);
          else setSectorData(null);
        }
      } catch {
        if (!cancelled) setSectorData(null);
      } finally {
        if (!cancelled) setSectorLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [selected]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const { snapshot, ratios, piotroski, altmanZ, magicFormula, grahamNumber, scores, recommendation } = analysis || {};
  const verdictStyle = recommendation ? VERDICT_STYLES[recommendation.verdict] : VERDICT_STYLES.Hold;

  return (
    <div className="min-h-screen bg-[#0A0E13] text-[#C4CBD4] selection:bg-[#24C0AC]/30">
      <AppHeader />

      <main className="max-w-7xl mx-auto px-4 py-6 sm:py-8">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-6 gap-4">
          <div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#E8ECF1] flex items-center gap-3">
              <BarChart3 className="w-7 h-7 sm:w-8 sm:h-8 text-[#24C0AC]" />
              Fundamental Analysis
            </h2>
            <p className="text-[#8D97A5] mt-1 text-sm sm:text-base">Ratios, Piotroski F-Score, Altman Z-Score, and a blended Buy/Hold/Sell verdict from real, sourced data.</p>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (searchInput.trim()) setSelected({ symbol: searchInput.trim().toUpperCase(), exchange });
            }}
            className="w-full lg:w-auto flex items-center gap-2 bg-[#12181F] p-2 rounded-xl border border-[#1F2730] focus-within:border-[#24C0AC] focus-within:ring-2 focus-within:ring-[#24C0AC]/30 transition-colors"
          >
            <Search className="w-4 h-4 text-[#5A6472] ml-2 shrink-0" />
            <input
              type="text"
              placeholder="Symbol (e.g. RELIANCE, AAPL)"
              className="bg-transparent border-none text-[#E8ECF1] focus:ring-0 outline-none py-1 px-1 w-full sm:w-44 uppercase placeholder:text-[#5A6472] placeholder:normal-case text-sm"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <select
              value={exchange}
              onChange={(e) => setExchange(e.target.value as 'NSE' | 'BSE' | 'US')}
              className="bg-[#1B222B] text-[#C4CBD4] text-sm rounded-lg px-2 py-1.5 border border-[#232D38] outline-none focus-visible:ring-2 focus-visible:ring-[#24C0AC]/60 shrink-0"
            >
              <option value="NSE">NSE</option>
              <option value="BSE">BSE</option>
              <option value="US">US</option>
            </select>
            <button type="submit" className="shrink-0 px-4 py-1.5 bg-[#24C0AC] hover:bg-[#1FAB99] text-[#0A0E13] rounded-lg text-sm font-semibold transition-colors">
              Analyze
            </button>
          </form>
        </div>

        <div className="flex flex-wrap gap-2 mb-8 -mx-4 px-4 sm:mx-0 sm:px-0 overflow-x-auto sm:overflow-visible pb-1 sm:pb-0">
          {POPULAR_SYMBOLS.map((s) => (
            <button
              key={`${s.exchange}:${s.symbol}`}
              onClick={() => { setSearchInput(s.symbol); setExchange(s.exchange); setSelected({ symbol: s.symbol, exchange: s.exchange }); }}
              className={`shrink-0 text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                selected.symbol === s.symbol && selected.exchange === s.exchange
                  ? 'bg-[#24C0AC] border-[#24C0AC] text-[#0A0E13] font-medium'
                  : 'bg-[#12181F] border-[#1F2730] text-[#8D97A5] hover:text-[#E8ECF1] hover:border-[#2A3542]'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-6">
            <Card><SkeletonBlock className="h-24" /></Card>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1 space-y-6">
                <Card><SkeletonBlock className="h-40" /></Card>
                <Card><SkeletonBlock className="h-56" /></Card>
              </div>
              <div className="lg:col-span-2 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card><SkeletonBlock className="h-48" /></Card>
                  <Card><SkeletonBlock className="h-48" /></Card>
                </div>
                <Card><SkeletonBlock className="h-64" /></Card>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-[#5A6472] justify-center pt-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Fetching fundamentals from SEC EDGAR / Yahoo Finance...
            </div>
          </div>
        )}

        {error && !loading && (
          <Card className="text-center border-[#E0525C]/25 bg-[#E0525C]/5">
            <AlertTriangle className="w-10 h-10 text-[#E0525C] mx-auto mb-3" />
            <h3 className="font-display text-lg font-medium text-[#E0525C] mb-1">Fundamental data unavailable</h3>
            <p className="text-[#C4818A]">{error}</p>
          </Card>
        )}

        {analysis && snapshot && ratios && piotroski && altmanZ && magicFormula && grahamNumber && scores && recommendation && !loading && (
          <div className="space-y-6">
            {/* Company header */}
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="font-display text-xl sm:text-2xl font-bold text-[#E8ECF1]">{snapshot.companyName || snapshot.symbol}</h3>
                  <p className="text-[#8D97A5] text-sm mt-1">
                    {[snapshot.sector, snapshot.industry].filter(Boolean).join(' · ') || 'Sector/industry not available'}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border bg-[#24C0AC]/10 border-[#24C0AC]/30 text-[#24C0AC]">
                      Source: {snapshot.source === 'sec-edgar' ? 'SEC EDGAR' : 'Yahoo Finance'}
                    </span>
                    {snapshot.fiscalPeriodEnd && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border bg-white/[0.04] border-white/10 text-[#8D97A5]">
                        FY end: {snapshot.fiscalPeriodEnd}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-data text-2xl sm:text-3xl font-semibold text-[#E8ECF1] tabular-nums">{formatCompactCurrency(snapshot.price, snapshot.currency)}</div>
                  <div className="text-[#8D97A5] text-sm">Market Cap: <span className="font-data tabular-nums">{formatCompactCurrency(snapshot.marketCap, snapshot.currency)}</span></div>
                </div>
              </div>
              {snapshot.warnings.length > 0 && (
                <div className="mt-4 flex items-start gap-2 text-xs text-[#D6A44E]/90 bg-[#D6A44E]/5 border border-[#D6A44E]/15 rounded-lg p-3">
                  <HelpCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <ul className="space-y-1">
                    {snapshot.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Verdict column */}
              <div className="lg:col-span-1 space-y-6">
                <div className={`rounded-2xl border p-6 ${verdictStyle.badge}`}>
                  <div className="flex items-center gap-5">
                    <ConfluenceGauge score={scores.overallScore} />
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold uppercase tracking-wider opacity-70 mb-1">AI Verdict</div>
                      <div className="font-display text-2xl font-bold leading-tight break-words">{recommendation.verdict}</div>
                      <div className="text-sm opacity-80 mt-1 font-data tabular-nums">Confidence: {recommendation.confidence}%</div>
                    </div>
                  </div>
                  {recommendation.reasoning.length > 0 && (
                    <div className="space-y-1.5 mt-5 pt-4 border-t border-current/10">
                      {recommendation.reasoning.map((r, i) => (
                        <div key={i} className="flex items-start gap-2 text-sm">
                          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 opacity-70" />
                          <span className="opacity-90">{r}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {recommendation.cautionNotes.length > 0 && (
                    <div className="space-y-1.5 mt-3 pt-3 border-t border-current/10">
                      {recommendation.cautionNotes.map((c, i) => (
                        <div key={i} className="flex items-start gap-2 text-sm">
                          <XCircle className="w-4 h-4 shrink-0 mt-0.5 opacity-70" />
                          <span className="opacity-90">{c}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Card className="space-y-4">
                  <Eyebrow>Composite Scores</Eyebrow>
                  <ScoreBar label="Overall" value={scores.overallScore} />
                  <ScoreBar label="Quality" value={scores.qualityScore} />
                  <ScoreBar label="Value" value={scores.valueScore} />
                  <ScoreBar label="Growth" value={scores.growthScore} />
                  <ScoreBar label="Financial Health" value={scores.financialHealthScore} />
                  {scores.momentumScore !== undefined && (
                    <ScoreBar label="Momentum (Technical)" value={scores.momentumScore} />
                  )}
                  <div className="pt-2 border-t border-[#1F2730] text-xs text-[#5A6472]">
                    Data completeness: <span className="font-data tabular-nums">{scores.dataCompleteness}%</span> of inputs behind these scores were available from {snapshot.source === 'sec-edgar' ? 'SEC EDGAR' : 'Yahoo Finance'}.
                  </div>
                </Card>

                <Card>
                  <h4 className="font-display text-[#E8ECF1] font-semibold text-sm mb-3 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-[#D6A44E]" />
                    Magic Formula <span className="text-[10px] text-[#5A6472] font-normal">(Greenblatt)</span>
                  </h4>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-data text-2xl font-semibold text-[#E8ECF1] tabular-nums">{magicFormula.score ?? 'N/A'}</span>
                    {magicFormula.score !== null && (
                      <span className={`text-xs px-2 py-1 rounded-full font-bold uppercase border ${
                        magicFormula.score >= 65 ? 'bg-[#34B378]/10 border-[#34B378]/30 text-[#34B378]'
                          : magicFormula.score >= 40 ? 'bg-[#D6A44E]/10 border-[#D6A44E]/30 text-[#D6A44E]'
                            : 'bg-[#E0525C]/10 border-[#E0525C]/30 text-[#E0525C]'
                      }`}>
                        {magicFormula.score >= 65 ? 'Attractive' : magicFormula.score >= 40 ? 'Average' : 'Weak'}
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between text-xs text-[#5A6472] mb-2">
                    <span>Earnings Yield: <span className="font-data text-[#C4CBD4] tabular-nums">{formatPct(magicFormula.earningsYieldPct ?? undefined)}</span></span>
                    <span>Return on Capital: <span className="font-data text-[#C4CBD4] tabular-nums">{formatPct(magicFormula.returnOnCapitalPct ?? undefined)}</span></span>
                  </div>
                  <p className="text-xs text-[#5A6472]">{magicFormula.detail}</p>
                </Card>

                <Card>
                  <h4 className="font-display text-[#E8ECF1] font-semibold text-sm mb-3">
                    Graham Number <span className="text-[10px] text-[#5A6472] font-normal">(Benjamin Graham)</span>
                  </h4>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-data text-2xl font-semibold text-[#E8ECF1] tabular-nums">{grahamNumber.grahamNumber !== null ? formatCompactCurrency(grahamNumber.grahamNumber, snapshot.currency) : 'N/A'}</span>
                    {grahamNumber.marginOfSafetyPct !== null && (
                      <span className={`text-xs px-2 py-1 rounded-full font-bold uppercase border ${
                        grahamNumber.marginOfSafetyPct >= 0 ? 'bg-[#34B378]/10 border-[#34B378]/30 text-[#34B378]' : 'bg-[#E0525C]/10 border-[#E0525C]/30 text-[#E0525C]'
                      }`}>
                        {grahamNumber.marginOfSafetyPct >= 0 ? '+' : ''}{grahamNumber.marginOfSafetyPct.toFixed(1)}% margin
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#5A6472]">{grahamNumber.detail}</p>
                </Card>

                <Card>
                  <h4 className="font-display text-[#E8ECF1] font-semibold text-sm mb-3">Altman Z-Score</h4>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-data text-2xl font-semibold text-[#E8ECF1] tabular-nums">{altmanZ.score ?? 'N/A'}</span>
                    <span className={`text-xs px-2 py-1 rounded-full font-bold uppercase border ${
                      altmanZ.zone === 'Safe' ? 'bg-[#34B378]/10 border-[#34B378]/30 text-[#34B378]'
                        : altmanZ.zone === 'Grey' ? 'bg-[#D6A44E]/10 border-[#D6A44E]/30 text-[#D6A44E]'
                          : altmanZ.zone === 'Distress' ? 'bg-[#E0525C]/10 border-[#E0525C]/30 text-[#E0525C]'
                            : 'bg-white/[0.04] border-white/10 text-[#8D97A5]'
                    }`}>
                      {altmanZ.zone}
                    </span>
                  </div>
                  <p className="text-xs text-[#5A6472]">{altmanZ.detail}</p>
                </Card>
              </div>

              {/* Ratios + Piotroski + Seasonality */}
              <div className="lg:col-span-2 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card>
                    <Eyebrow>Profitability &amp; Returns</Eyebrow>
                    <RatioRow label="Gross Margin" value={formatPct(ratios.grossMarginPct)} />
                    <RatioRow label="EBITDA Margin" value={formatPct(ratios.ebitdaMarginPct)} />
                    <RatioRow label="Operating Margin" value={formatPct(ratios.operatingMarginPct)} />
                    <RatioRow label="Net Margin" value={formatPct(ratios.netMarginPct)} />
                    <RatioRow label="ROE" value={formatPct(ratios.roePct)} />
                    <RatioRow label="ROA" value={formatPct(ratios.roaPct)} />
                    <RatioRow label="ROCE" value={formatPct(ratios.rocePct)} />
                  </Card>

                  <Card>
                    <Eyebrow>Growth</Eyebrow>
                    <RatioRow label="Revenue Growth (YoY)" value={formatPct(ratios.revenueGrowthPct)} />
                    <RatioRow label="Net Income Growth (YoY)" value={formatPct(ratios.netIncomeGrowthPct)} />
                    <div className="pt-4">
                      <Eyebrow>Valuation</Eyebrow>
                    </div>
                    <RatioRow label="P/E Ratio" value={formatNum(ratios.peRatio)} />
                    <RatioRow label="P/B Ratio" value={formatNum(ratios.pbRatio)} />
                    <RatioRow label="P/S Ratio" value={formatNum(ratios.psRatio)} />
                    <RatioRow label="EV/EBITDA" value={formatNum(ratios.evToEbitda)} />
                    <RatioRow label="Dividend Yield" value={formatPct(ratios.dividendYieldPct)} />
                  </Card>

                  <Card>
                    <Eyebrow>Liquidity &amp; Leverage</Eyebrow>
                    <RatioRow label="Current Ratio" value={formatNum(ratios.currentRatio)} />
                    <RatioRow label="Quick Ratio" value={formatNum(ratios.quickRatio)} />
                    <RatioRow label="Debt / Equity" value={formatNum(ratios.debtToEquity)} />
                    <RatioRow label="Interest Coverage" value={formatNum(ratios.interestCoverage)} />
                  </Card>

                  <Card>
                    <Eyebrow>Cash Flow</Eyebrow>
                    <RatioRow label="Free Cash Flow" value={formatCompactCurrency(ratios.freeCashFlow, snapshot.currency)} />
                    <RatioRow label="Owner Earnings (≈FCF)" value={formatCompactCurrency(ratios.ownerEarnings, snapshot.currency)} />
                    <RatioRow label="FCF Margin" value={formatPct(ratios.fcfMarginPct)} />
                  </Card>
                </div>

                <Card>
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="font-display text-[#E8ECF1] font-semibold text-sm">Piotroski F-Score</h4>
                    <span className="font-data text-lg font-semibold text-[#E8ECF1] tabular-nums">{piotroski.score}/9</span>
                  </div>
                  <div className="space-y-2">
                    {piotroski.breakdown.map((b, i) => (
                      <div key={i} className="flex items-start gap-3 text-sm">
                        {b.passed === true && <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-[#34B378]" />}
                        {b.passed === false && <XCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#E0525C]" />}
                        {b.passed === null && <HelpCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#4A525E]" />}
                        <div>
                          <span className={b.passed === null ? 'text-[#5A6472]' : 'text-[#C4CBD4]'}>{b.label}</span>
                          <span className="text-[#4A525E]"> — {b.detail}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>

                {stockSeasonality && (
                  <SeasonalityStrip months={stockSeasonality} title={`${snapshot.symbol} - Month-wise Behavior (up to 10y)`} />
                )}
              </div>
            </div>

            {/* Sector Analysis */}
            {sectorLoading && !sectorData && (
              <Card className="flex items-center gap-3 text-[#8D97A5] text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading sector analysis...
              </Card>
            )}

            {sectorData && (
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                  <h3 className="font-display text-lg font-bold text-[#E8ECF1] flex items-center gap-2">
                    <Users className="w-5 h-5 text-[#24C0AC]" />
                    {sectorData.sectorName} Sector Analysis
                  </h3>
                  <div className="flex flex-wrap items-center gap-2">
                    {sectorData.technical && (
                      <span className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase border ${sectorTrendBadgeClass(sectorData.technical.label)}`}>
                        {sectorData.technical.label === 'Bullish' && <TrendingUp className="w-3 h-3 inline mr-1" />}
                        {sectorData.technical.label === 'Bearish' && <TrendingDown className="w-3 h-3 inline mr-1" />}
                        Technical: {sectorData.technical.label}
                      </span>
                    )}
                    <span className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase border ${fundamentalLabelBadgeClass(sectorData.fundamental.label)}`}>
                      {sectorData.fundamental.label}
                    </span>
                  </div>
                </div>

                {sectorData.technical ? (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <StatBadge label="Index / Proxy" value={sectorData.technical.indexSymbol} />
                    <StatBadge label="Trend Score" value={`${sectorData.technical.trendScore?.score ?? 'N/A'}/100 (${sectorData.technical.trendScore?.label ?? 'N/A'})`} />
                    <StatBadge
                      label="10Y Annualized Return"
                      value={sectorData.technical.annualizedReturnPct !== undefined ? `${sectorData.technical.annualizedReturnPct >= 0 ? '+' : ''}${sectorData.technical.annualizedReturnPct.toFixed(1)}%/yr` : 'N/A'}
                      tone={(sectorData.technical.annualizedReturnPct ?? 0) >= 0 ? 'bull' : 'bear'}
                    />
                    <StatBadge label="Positive / Negative Years" value={`${sectorData.technical.positiveYears} up / ${sectorData.technical.negativeYears} down`} />
                  </div>
                ) : (
                  <p className="text-xs text-[#D6A44E]/90 bg-[#D6A44E]/5 border border-[#D6A44E]/15 rounded-lg p-3 mb-6">
                    {sectorData.technicalUnavailableReason || 'Technical sector trend is unavailable for this sector.'}
                  </p>
                )}

                {sectorData.technical && sectorData.technical.yearlyPerformance.length > 0 && (
                  <div className="mb-6">
                    <Eyebrow>10-Year Yearly Performance</Eyebrow>
                    <div className="flex flex-wrap gap-2">
                      {[...sectorData.technical.yearlyPerformance].sort((a, b) => a.year - b.year).map(y => (
                        <div key={y.year} className={`font-data text-xs tabular-nums px-2.5 py-1.5 rounded-lg border ${y.returnPct >= 0 ? 'bg-[#34B378]/5 border-[#34B378]/20 text-[#34B378]' : 'bg-[#E0525C]/5 border-[#E0525C]/20 text-[#E0525C]'}`}>
                          {y.year}: {y.returnPct >= 0 ? '+' : ''}{y.returnPct.toFixed(1)}%
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {sectorData.technical && sectorData.technical.monthlySeasonality.length > 0 && (
                  <div className="mb-6">
                    <SeasonalityStrip months={sectorData.technical.monthlySeasonality} title={`${sectorData.sectorName} Sector - Month-wise Behavior`} />
                  </div>
                )}

                {sectorData.fundamental.peersEvaluated > 0 && (
                  <div>
                    <Eyebrow>Peer Comparison ({sectorData.fundamental.peersEvaluated}/{sectorData.fundamental.peersRequested} peers evaluated)</Eyebrow>
                    <p className="text-[10px] text-[#5A6472] mb-2 sm:hidden">Scroll sideways to see all columns →</p>
                    <div className="overflow-x-auto -mx-5 px-5 sm:mx-0 sm:px-0 rounded-lg">
                      <table className="w-full text-sm border-separate border-spacing-0">
                        <thead>
                          <tr className="text-left text-[10px] text-[#5A6472] uppercase tracking-wider">
                            <th className="py-2 pr-4 sticky left-0 bg-[#12181F] font-semibold">Symbol</th>
                            <th className="py-2 pr-4 font-semibold">Overall</th>
                            <th className="py-2 pr-4 font-semibold">P/E</th>
                            <th className="py-2 pr-4 font-semibold">ROE</th>
                            <th className="py-2 pr-4 font-semibold">Rev. Growth</th>
                            <th className="py-2 pr-4 font-semibold">Verdict</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr className="bg-[#24C0AC]/[0.06]">
                            <td className="py-2.5 pr-4 font-semibold text-[#24C0AC] border-t border-[#1F2730] sticky left-0 bg-[#141B22] whitespace-nowrap">{snapshot.symbol} (this stock)</td>
                            <td className="py-2.5 pr-4 text-[#E8ECF1] border-t border-[#1F2730] font-data tabular-nums">{scores.overallScore}</td>
                            <td className="py-2.5 pr-4 text-[#C4CBD4] border-t border-[#1F2730] font-data tabular-nums">{formatNum(ratios.peRatio)}</td>
                            <td className="py-2.5 pr-4 text-[#C4CBD4] border-t border-[#1F2730] font-data tabular-nums">{formatPct(ratios.roePct)}</td>
                            <td className="py-2.5 pr-4 text-[#C4CBD4] border-t border-[#1F2730] font-data tabular-nums">{formatPct(ratios.revenueGrowthPct)}</td>
                            <td className="py-2.5 pr-4 text-[#C4CBD4] border-t border-[#1F2730] whitespace-nowrap">{recommendation.verdict}</td>
                          </tr>
                          {sectorData.peers.map((peer) => (
                            <tr key={peer.symbol}>
                              <td className="py-2.5 pr-4 text-[#C4CBD4] border-t border-[#1F2730] sticky left-0 bg-[#12181F] whitespace-nowrap">{peer.symbol}</td>
                              {peer.analysis ? (
                                <>
                                  <td className="py-2.5 pr-4 text-[#E8ECF1] border-t border-[#1F2730] font-data tabular-nums">{peer.analysis.scores.overallScore}</td>
                                  <td className="py-2.5 pr-4 text-[#8D97A5] border-t border-[#1F2730] font-data tabular-nums">{formatNum(peer.analysis.ratios.peRatio)}</td>
                                  <td className="py-2.5 pr-4 text-[#8D97A5] border-t border-[#1F2730] font-data tabular-nums">{formatPct(peer.analysis.ratios.roePct)}</td>
                                  <td className="py-2.5 pr-4 text-[#8D97A5] border-t border-[#1F2730] font-data tabular-nums">{formatPct(peer.analysis.ratios.revenueGrowthPct)}</td>
                                  <td className="py-2.5 pr-4 text-[#8D97A5] border-t border-[#1F2730] whitespace-nowrap">{peer.analysis.recommendation.verdict}</td>
                                </>
                              ) : (
                                <td className="py-2.5 pr-4 text-[#4A525E] text-xs border-t border-[#1F2730]" colSpan={5}>Data unavailable{peer.error ? ` - ${peer.error}` : ''}</td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </Card>
            )}
          </div>
        )}

        <LegalDisclaimer className="mt-8" />
      </main>
    </div>
  );
}

export default function FundamentalsPage() {
  return (
    <ProGuard featureName="Fundamental Analysis">
      <FundamentalsContent />
    </ProGuard>
  );
}
