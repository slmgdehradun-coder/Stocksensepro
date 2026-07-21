'use client';

import React, { useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  CalendarDays,
  Loader2,
  Search,
  StopCircle,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import AppHeader from '@/components/AppHeader';
import LegalDisclaimer from '@/components/LegalDisclaimer';
import ProGuard from '@/components/ProGuard';
import { fetchYahooFinanceData } from '@/lib/dataFetcher';
import {
  MONTH_NAMES,
  SeasonalityIndexGroup,
  SEASONALITY_SAMPLE_YEARS,
  SEASONALITY_UNIVERSES,
  StockSeasonalityResult,
  summarizeStockSeasonality,
} from '@/lib/seasonality';

type UniverseSelection = SeasonalityIndexGroup | 'BOTH';
type SortMode = 'best' | 'worst' | 'winRate' | 'symbol';

interface ScanItem {
  symbol: string;
  indexGroup: SeasonalityIndexGroup;
}

interface FailedScan {
  symbol: string;
  reason: string;
}

interface IndexConstituentGroup {
  indexGroup: SeasonalityIndexGroup;
  symbols: string[];
  source: 'nse-csv' | 'configured-fallback';
  warnings?: string[];
}

function formatPct(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return '-';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

function returnClass(value?: number) {
  if (value === undefined) return 'text-slate-300';
  if (value > 0) return 'text-emerald-300';
  if (value < 0) return 'text-rose-300';
  return 'text-slate-300';
}

function consistencyClass(consistency: string) {
  if (consistency.includes('Strong Up')) return 'border-emerald-500/40 bg-emerald-500/10';
  if (consistency === 'Up') return 'border-emerald-500/25 bg-emerald-500/5';
  if (consistency.includes('Strong Down')) return 'border-rose-500/40 bg-rose-500/10';
  if (consistency === 'Down') return 'border-rose-500/25 bg-rose-500/5';
  return 'border-slate-700 bg-slate-900/60';
}

function buildScanList(selection: UniverseSelection): ScanItem[] {
  if (selection === 'BOTH') {
    return [
      ...SEASONALITY_UNIVERSES['NIFTY 50'].map(symbol => ({ symbol, indexGroup: 'NIFTY 50' as const })),
      ...SEASONALITY_UNIVERSES['NIFTY NEXT 50'].map(symbol => ({ symbol, indexGroup: 'NIFTY NEXT 50' as const })),
    ];
  }

  return SEASONALITY_UNIVERSES[selection].map(symbol => ({ symbol, indexGroup: selection }));
}

function indexParamForSelection(selection: UniverseSelection) {
  if (selection === 'NIFTY 50') return 'nifty50';
  if (selection === 'NIFTY NEXT 50') return 'niftynext50';
  return 'both';
}

function monthForResult(result: StockSeasonalityResult, monthFilter: string) {
  if (monthFilter === 'all') return result.bestMonth;
  return result.months[Number(monthFilter) - 1];
}

function SeasonalityContent() {
  const [universe, setUniverse] = useState<UniverseSelection>('NIFTY 50');
  const [monthFilter, setMonthFilter] = useState('all');
  const [sortMode, setSortMode] = useState<SortMode>('best');
  const [query, setQuery] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0, symbol: '' });
  const [results, setResults] = useState<StockSeasonalityResult[]>([]);
  const [failures, setFailures] = useState<FailedScan[]>([]);
  const [universeNotes, setUniverseNotes] = useState<string[]>([]);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const abortRef = useRef(false);

  const scanList = useMemo(() => buildScanList(universe), [universe]);

  const summary = useMemo(() => {
    const strongUp = results.reduce((sum, result) => sum + result.months.filter(month => month.consistency === 'Strong Up').length, 0);
    const strongDown = results.reduce((sum, result) => sum + result.months.filter(month => month.consistency === 'Strong Down').length, 0);
    const sampleMonths = results.flatMap(result => result.months.filter(month => month.samples > 0));
    const avgSamples = sampleMonths.length
      ? sampleMonths.reduce((sum, month) => sum + month.samples, 0) / sampleMonths.length
      : 0;
    return { strongUp, strongDown, avgSamples };
  }, [results]);

  const filteredResults = useMemo(() => {
    const normalizedQuery = query.trim().toUpperCase();
    const next = results.filter(result => !normalizedQuery || result.symbol.includes(normalizedQuery));

    return [...next].sort((a, b) => {
      if (sortMode === 'symbol') return a.symbol.localeCompare(b.symbol);
      if (sortMode === 'winRate') {
        const aMonth = monthForResult(a, monthFilter);
        const bMonth = monthForResult(b, monthFilter);
        return (bMonth?.winRate || 0) - (aMonth?.winRate || 0);
      }
      if (sortMode === 'worst') {
        const aMonth = monthFilter === 'all' ? a.worstMonth : monthForResult(a, monthFilter);
        const bMonth = monthFilter === 'all' ? b.worstMonth : monthForResult(b, monthFilter);
        return (aMonth?.avgReturn || 0) - (bMonth?.avgReturn || 0);
      }

      const aMonth = monthForResult(a, monthFilter);
      const bMonth = monthForResult(b, monthFilter);
      return (bMonth?.avgReturn || 0) - (aMonth?.avgReturn || 0);
    });
  }, [monthFilter, query, results, sortMode]);

  const selectedResult = useMemo(() => {
    return results.find(result => result.symbol === selectedSymbol) || filteredResults[0];
  }, [filteredResults, results, selectedSymbol]);

  const selectedMonth = selectedResult
    ? monthFilter === 'all'
      ? selectedResult.bestMonth
      : selectedResult.months[Number(monthFilter) - 1]
    : undefined;

  const loadScanList = async () => {
    try {
      const response = await fetch(`/api/index-constituents?index=${indexParamForSelection(universe)}`, {
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !Array.isArray(payload?.groups)) {
        throw new Error(payload?.error || `Index constituents request failed with ${response.status}`);
      }

      const groups = payload.groups as IndexConstituentGroup[];
      const items = groups.flatMap(group => group.symbols.map(symbol => ({
        symbol,
        indexGroup: group.indexGroup,
      })));
      const notes = groups.flatMap(group => [
        `${group.indexGroup}: ${group.source === 'nse-csv' ? 'official NSE CSV' : 'configured fallback'} (${group.symbols.length} symbols)`,
        ...(group.warnings || []),
      ]);
      setUniverseNotes(notes);
      return items.length > 0 ? items : scanList;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown constituent fetch error';
      setUniverseNotes([`Using configured fallback list because constituent API failed: ${message}`]);
      return scanList;
    }
  };

  const startScan = async () => {
    if (isScanning) return;
    abortRef.current = false;
    setIsScanning(true);
    setResults([]);
    setFailures([]);
    setSelectedSymbol(null);
    setUniverseNotes(['Loading index constituents...']);

    const nextResults: StockSeasonalityResult[] = [];
    const nextFailures: FailedScan[] = [];
    const itemsToScan = await loadScanList();
    setProgress({ current: 0, total: itemsToScan.length, symbol: '' });

    for (let index = 0; index < itemsToScan.length; index++) {
      if (abortRef.current) break;
      const item = itemsToScan[index];
      setProgress({ current: index + 1, total: itemsToScan.length, symbol: item.symbol });

      try {
        const data = await fetchYahooFinanceData(item.symbol, 'NSE', '1mo');
        if (data.candles.length < 12) {
          throw new Error('Not enough historical candles for seasonality.');
        }

        const result = summarizeStockSeasonality(
          item.symbol,
          item.indexGroup,
          data.candles,
          data.metadata?.warnings || [],
          SEASONALITY_SAMPLE_YEARS
        );
        nextResults.push(result);
        setResults([...nextResults]);
        setSelectedSymbol(current => current || result.symbol);
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Unknown market data error';
        nextFailures.push({ symbol: item.symbol, reason });
        setFailures([...nextFailures]);
      }

      await new Promise(resolve => setTimeout(resolve, 350));
    }

    setIsScanning(false);
    setProgress(current => ({ ...current, symbol: '' }));
  };

  const stopScan = () => {
    abortRef.current = true;
    setIsScanning(false);
  };

  return (
    <div className="min-h-screen bg-ink text-fg-muted font-sans selection:bg-accent-soft">
      <AppHeader />

      <main className="mx-auto max-w-7xl px-4 py-8">
        <section className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-blue-200">
              <CalendarDays className="h-4 w-4" />
              10-year seasonality scanner
            </div>
            <h2 className="text-3xl font-bold text-white md:text-4xl">Month-wise NIFTY stock behavior</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              Scans NIFTY 50 and NIFTY Next 50 symbols with 10-year monthly candles, then ranks which months delivered the highest and lowest average returns.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={startScan}
              disabled={isScanning}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isScanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
              {isScanning ? 'Scanning...' : `Scan ${scanList.length} Stocks`}
            </button>
            {isScanning && (
              <button
                onClick={stopScan}
                className="inline-flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-5 py-3 text-sm font-semibold text-rose-200 transition-colors hover:bg-rose-500/20"
              >
                <StopCircle className="h-4 w-4" />
                Stop
              </button>
            )}
          </div>
        </section>

        <section className="mb-6 grid gap-3 lg:grid-cols-[1fr_1fr_1fr_1.2fr]">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Universe</span>
            <select
              value={universe}
              onChange={event => setUniverse(event.target.value as UniverseSelection)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-sm text-white outline-none focus:border-blue-500"
              disabled={isScanning}
            >
              <option value="NIFTY 50">NIFTY 50</option>
              <option value="NIFTY NEXT 50">NIFTY Next 50</option>
              <option value="BOTH">NIFTY 50 + Next 50</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Month Focus</span>
            <select
              value={monthFilter}
              onChange={event => setMonthFilter(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-sm text-white outline-none focus:border-blue-500"
            >
              <option value="all">Best month per stock</option>
              {MONTH_NAMES.map((month, index) => (
                <option key={month} value={String(index + 1)}>{month}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Sort</span>
            <select
              value={sortMode}
              onChange={event => setSortMode(event.target.value as SortMode)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-3 text-sm text-white outline-none focus:border-blue-500"
            >
              <option value="best">Highest average return</option>
              <option value="winRate">Highest up-year ratio</option>
              <option value="worst">Weakest average return</option>
              <option value="symbol">Symbol A-Z</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Search</span>
            <div className="flex items-center rounded-lg border border-slate-700 bg-slate-900 px-3 py-3">
              <Search className="mr-2 h-4 w-4 text-slate-500" />
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="RELIANCE, HDFCBANK..."
                className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-600"
              />
            </div>
          </label>
        </section>

        {isScanning && (
          <div className="mb-6 rounded-lg border border-blue-500/20 bg-blue-500/10 p-4">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium text-blue-100">Fetching 10-year monthly history for {progress.symbol || 'selected universe'}</span>
              <span className="text-blue-200">{progress.current}/{progress.total}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-blue-500 transition-all"
                style={{ width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%` }}
              />
            </div>
          </div>
        )}

        {universeNotes.length > 0 && (
          <div className="mb-6 rounded-lg border border-slate-800 bg-slate-900/60 p-4 text-xs leading-5 text-slate-400">
            {universeNotes.map(note => (
              <p key={note}>{note}</p>
            ))}
          </div>
        )}

        <section className="mb-6 grid gap-4 md:grid-cols-4">
          <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Scanned</p>
            <p className="mt-2 text-2xl font-bold text-white">{results.length}</p>
            <p className="mt-1 text-xs text-slate-500">{failures.length} failed</p>
          </div>
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-200">Strong Up Months</p>
            <p className="mt-2 text-2xl font-bold text-emerald-200">{summary.strongUp}</p>
            <p className="mt-1 text-xs text-emerald-100/70">70%+ up years with positive avg return</p>
          </div>
          <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-rose-200">Strong Down Months</p>
            <p className="mt-2 text-2xl font-bold text-rose-200">{summary.strongDown}</p>
            <p className="mt-1 text-xs text-rose-100/70">70%+ down years with negative avg return</p>
          </div>
          <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Avg Samples</p>
            <p className="mt-2 text-2xl font-bold text-white">{summary.avgSamples.toFixed(1)}</p>
            <p className="mt-1 text-xs text-slate-500">Latest completed occurrences per month</p>
          </div>
        </section>

        {results.length === 0 && !isScanning ? (
          <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-8 text-center">
            <CalendarDays className="mx-auto mb-4 h-10 w-10 text-slate-500" />
            <h3 className="text-lg font-semibold text-white">Run a seasonality scan</h3>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-400">
              Select NIFTY 50, NIFTY Next 50, or both. The scanner will fetch server-proxied 10-year monthly candles and calculate month-wise historical behavior for each stock.
            </p>
          </section>
        ) : (
          <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900/50">
              <div className="border-b border-slate-800 px-4 py-3">
                <h3 className="font-semibold text-white">Seasonality Results</h3>
                <p className="mt-1 text-xs text-slate-500">Click a row to see all 12 months and year-wise returns.</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead className="border-b border-slate-800 bg-slate-950/60 text-xs uppercase tracking-[0.12em] text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Symbol</th>
                      <th className="px-4 py-3">Index</th>
                      <th className="px-4 py-3">{monthFilter === 'all' ? 'Best Month' : 'Focus Month'}</th>
                      <th className="px-4 py-3">Avg Return</th>
                      <th className="px-4 py-3">Up/Down</th>
                      <th className="px-4 py-3">Win Rate</th>
                      <th className="px-4 py-3">Worst Month</th>
                      <th className="px-4 py-3">Price</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredResults.map(result => {
                      const focusMonth = monthForResult(result, monthFilter);
                      const isActive = selectedResult?.symbol === result.symbol;
                      return (
                        <tr
                          key={`${result.indexGroup}-${result.symbol}`}
                          onClick={() => setSelectedSymbol(result.symbol)}
                          className={`cursor-pointer border-b border-slate-800/70 transition-colors hover:bg-slate-800/60 ${isActive ? 'bg-blue-500/10' : ''}`}
                        >
                          <td className="px-4 py-3 font-semibold text-white">{result.symbol}</td>
                          <td className="px-4 py-3 text-slate-400">{result.indexGroup}</td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full border px-2.5 py-1 text-xs ${focusMonth ? consistencyClass(focusMonth.consistency) : 'border-slate-700 bg-slate-900'}`}>
                              {focusMonth?.monthName || '-'}
                            </span>
                          </td>
                          <td className={`px-4 py-3 font-semibold ${returnClass(focusMonth?.avgReturn)}`}>{formatPct(focusMonth?.avgReturn)}</td>
                          <td className="px-4 py-3 text-slate-300">{focusMonth ? `${focusMonth.upYears}U / ${focusMonth.downYears}D` : '-'}</td>
                          <td className="px-4 py-3 text-slate-300">{focusMonth ? `${focusMonth.winRate.toFixed(1)}%` : '-'}</td>
                          <td className={`px-4 py-3 ${returnClass(result.worstMonth?.avgReturn)}`}>
                            {result.worstMonth ? `${result.worstMonth.monthName} ${formatPct(result.worstMonth.avgReturn)}` : '-'}
                          </td>
                          <td className="px-4 py-3 text-slate-300">{result.currentPrice ? result.currentPrice.toFixed(2) : '-'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <aside className="space-y-4">
              {selectedResult ? (
                <>
                  <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-5">
                    <div className="mb-4 flex items-start justify-between gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Selected Stock</p>
                        <h3 className="mt-1 text-2xl font-bold text-white">{selectedResult.symbol}</h3>
                        <p className="mt-1 text-sm text-slate-400">{selectedResult.indexGroup}</p>
                      </div>
                      <div className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-right">
                        <p className="text-xs text-slate-500">Current</p>
                        <p className="font-semibold text-white">{selectedResult.currentPrice?.toFixed(2) || '-'}</p>
                      </div>
                    </div>

                    {selectedMonth && (
                      <div className={`rounded-lg border p-4 ${consistencyClass(selectedMonth.consistency)}`}>
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
                              {monthFilter === 'all' ? 'Best Seasonal Month' : 'Focused Month'}
                            </p>
                            <p className="mt-1 text-xl font-bold text-white">{selectedMonth.monthName}</p>
                          </div>
                          <p className={`text-2xl font-bold ${returnClass(selectedMonth.avgReturn)}`}>{formatPct(selectedMonth.avgReturn)}</p>
                        </div>
                        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                          <div className="rounded-lg bg-slate-950/50 p-2">
                            <p className="text-slate-500">Up Years</p>
                            <p className="mt-1 font-semibold text-emerald-300">{selectedMonth.upYears}/{selectedMonth.samples}</p>
                          </div>
                          <div className="rounded-lg bg-slate-950/50 p-2">
                            <p className="text-slate-500">Win Rate</p>
                            <p className="mt-1 font-semibold text-white">{selectedMonth.winRate.toFixed(1)}%</p>
                          </div>
                          <div className="rounded-lg bg-slate-950/50 p-2">
                            <p className="text-slate-500">Median</p>
                            <p className={`mt-1 font-semibold ${returnClass(selectedMonth.medianReturn)}`}>{formatPct(selectedMonth.medianReturn)}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-5">
                    <h4 className="mb-3 font-semibold text-white">12-Month Map</h4>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {selectedResult.months.map(month => (
                        <button
                          key={month.month}
                          onClick={() => setMonthFilter(String(month.month))}
                          className={`rounded-lg border p-3 text-left transition-transform hover:-translate-y-0.5 ${consistencyClass(month.consistency)}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-white">{month.monthName.slice(0, 3)}</span>
                            {month.avgReturn >= 0 ? <TrendingUp className="h-3.5 w-3.5 text-emerald-300" /> : <TrendingDown className="h-3.5 w-3.5 text-rose-300" />}
                          </div>
                          <p className={`mt-2 text-lg font-bold ${returnClass(month.avgReturn)}`}>{formatPct(month.avgReturn)}</p>
                          <p className="mt-1 text-[11px] text-slate-400">{month.upYears}U / {month.downYears}D / {month.samples}Y</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  {selectedMonth && (
                    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-5">
                      <h4 className="mb-3 font-semibold text-white">{selectedMonth.monthName} Year-wise Breakdown</h4>
                      <div className="space-y-2">
                        {selectedMonth.yearly.map(year => (
                          <div key={year.year} className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm">
                            <span className="font-medium text-slate-200">{year.year}</span>
                            <span className={returnClass(year.returnPct)}>{formatPct(year.returnPct)}</span>
                            <span className="text-xs text-slate-500">{year.startPrice.toFixed(2)} to {year.endPrice.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-5">
                    <h4 className="mb-2 font-semibold text-white">Data Notes</h4>
                    <ul className="space-y-2 text-xs leading-5 text-slate-400">
                      {selectedResult.dataQuality.map(note => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  </div>
                </>
              ) : (
                <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-400">
                  Select a scanned stock to see month-wise detail.
                </div>
              )}
            </aside>
          </section>
        )}

        {failures.length > 0 && (
          <section className="mt-6 rounded-lg border border-amber-500/20 bg-amber-500/10 p-4">
            <h4 className="font-semibold text-amber-100">Symbols skipped</h4>
            <p className="mt-1 text-xs text-amber-100/80">
              {failures.slice(0, 8).map(item => `${item.symbol}: ${item.reason}`).join(' | ')}
              {failures.length > 8 ? ` | ${failures.length - 8} more` : ''}
            </p>
          </section>
        )}

        <LegalDisclaimer compact className="mt-6" />
      </main>
    </div>
  );
}

export default function SeasonalityPage() {
  return (
    <ProGuard featureName="Seasonality Scanner">
      <SeasonalityContent />
    </ProGuard>
  );
}
