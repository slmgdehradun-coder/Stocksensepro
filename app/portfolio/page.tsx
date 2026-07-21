'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePaperTrading } from '@/lib/usePaperTrading';
import { fetchYahooFinanceData } from '@/lib/dataFetcher';
import { calculatePositionPnl, convertToBaseCurrency, getRiskTrigger } from '@/lib/portfolio';
import { 
  Wallet, 
  TrendingUp, 
  RefreshCw, 
  ArrowLeft, 
  History, 
  PieChart,
  Loader2,
  AlertTriangle
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import AppHeader from '@/components/AppHeader';
import ProGuard from '@/components/ProGuard';
import LegalDisclaimer from '@/components/LegalDisclaimer';

function PortfolioContent() {
  const { balance, positions, history, sell, resetAccount, isLoaded } = usePaperTrading();
  const { isLoaded: authLoaded } = useAuth();
  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>({});
  const [priceFetchErrors, setPriceFetchErrors] = useState<Record<string, string>>({});
  const [usdInr, setUsdInr] = useState(83.5);
  const [isLoadingPrices, setIsLoadingPrices] = useState(false);
  const [activeTab, setActiveTab] = useState<'POSITIONS' | 'HISTORY'>('POSITIONS');

  // Best-effort exchange guess for positions saved before Position.exchange existed. A
  // symbol containing '=', '-USD', or '-INR' (futures/crypto/forex) or starting with '^'
  // (an index) is unambiguous; anything else is genuinely ambiguous between NSE and US
  // (e.g. "AAPL" bare vs an old-format NSE symbol saved without its ".NS" suffix), so that
  // case is resolved by actually trying both below rather than guessing once and failing
  // silently.
  const guessExchange = (symbol: string): 'NSE' | 'GLOBAL' => {
    const isGlobal = symbol.startsWith('^') || symbol.includes('=') || symbol.includes('-USD') || symbol.includes('-INR');
    return isGlobal ? 'GLOBAL' : 'NSE';
  };

  // Fetch current prices for all positions
  useEffect(() => {
    const fetchPrices = async () => {
      if (positions.length === 0) return;
      setIsLoadingPrices(true);
      const prices: Record<string, number> = {};
      const errors: Record<string, string> = {};
      
      try {
        try {
          const fxData = await fetchYahooFinanceData('INR=X', 'GLOBAL', '1d');
          const fxPrice = fxData.candles.at(-1)?.close;
          if (fxPrice) setUsdInr(fxPrice);
        } catch {
          // Keep the last known fallback conversion rate for virtual portfolio display.
        }

        await Promise.all(positions.map(async (pos) => {
          // Prefer the exchange recorded on the position at buy time - it's exactly what
          // was used to resolve this symbol originally, so refetching with it is reliable
          // instead of re-guessing from the symbol's string shape.
          const exchangeAttempts: Array<'NSE' | 'BSE' | 'US' | 'GLOBAL' | 'MCX'> = pos.exchange
            ? [pos.exchange]
            : [guessExchange(pos.symbol), guessExchange(pos.symbol) === 'NSE' ? 'US' : 'NSE'];

          let lastError: unknown = null;
          for (const attemptExchange of exchangeAttempts) {
            try {
              const data = await fetchYahooFinanceData(pos.symbol, attemptExchange, '1d');
              if (data.candles.length > 0) {
                prices[pos.symbol] = data.candles[data.candles.length - 1].close;
                lastError = null;
                break;
              }
              lastError = new Error('No candles returned');
            } catch (err) {
              lastError = err;
            }
          }
          if (lastError) {
            const message = lastError instanceof Error ? lastError.message : String(lastError);
            console.error(`Failed to fetch price for ${pos.symbol}`, lastError);
            errors[pos.symbol] = message;
          }
        }));
        // Merge rather than replace: a transient failure on this refresh shouldn't erase a
        // previously known-good price for a position that fetched fine before.
        setCurrentPrices(prev => ({ ...prev, ...prices }));
        setPriceFetchErrors(errors);
      } finally {
        setIsLoadingPrices(false);
      }
    };

    if (isLoaded && positions.length > 0) {
      fetchPrices();
      const interval = setInterval(fetchPrices, 60000); // Refresh every minute
      return () => clearInterval(interval);
    }
  }, [isLoaded, positions]);

  if (!isLoaded || !authLoaded) {
    return (
      <div className="min-h-screen bg-ink flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  const calculateTotalValue = () => {
    let positionsValueInINR = 0;
    positions.forEach(pos => {
      // Aggregate totals fall back to avgPrice only so the total isn't NaN/undefined when a
      // live price is missing - this is a deliberate "assume no movement" approximation for
      // the portfolio-wide number. Each individual position card below shows the real
      // "Price unavailable" state rather than silently implying zero movement.
      const price = currentPrices[pos.symbol] ?? pos.avgPrice;
      const currency = pos.currency || (pos.symbol.includes('=') || pos.symbol.includes('-USD') ? 'USD' : 'INR');
      positionsValueInINR += convertToBaseCurrency(calculatePositionPnl(pos, price).currentValue, currency, usdInr);
    });
    return balance + positionsValueInINR;
  };

  const totalInvestedValueInINR = positions.reduce((acc, pos) => {
    const currency = pos.currency || (pos.symbol.includes('=') || pos.symbol.includes('-USD') ? 'USD' : 'INR');
    return acc + convertToBaseCurrency(calculatePositionPnl(pos, currentPrices[pos.symbol] ?? pos.avgPrice).investedValue, currency, usdInr);
  }, 0);

  const totalValue = calculateTotalValue();
  const totalPnl = positions.reduce((acc, pos) => {
    const price = currentPrices[pos.symbol] ?? pos.avgPrice;
    const currency = pos.currency || (pos.symbol.includes('=') || pos.symbol.includes('-USD') ? 'USD' : 'INR');
    return acc + convertToBaseCurrency(calculatePositionPnl(pos, price).pnl, currency, usdInr);
  }, 0);

  const totalPnlPercent = totalInvestedValueInINR > 0 ? (totalPnl / totalInvestedValueInINR) * 100 : 0;

  const totalRealizedPnl = history.reduce((acc, trade) => {
    const pnl = trade.realizedPnl || 0;
    const currency = trade.currency || (trade.symbol.includes('=') || trade.symbol.includes('-USD') ? 'USD' : 'INR');
    return acc + convertToBaseCurrency(pnl, currency, usdInr);
  }, 0);

  const positionsWithUnavailablePrice = positions.filter(pos => currentPrices[pos.symbol] === undefined);

  return (
    <div className="min-h-screen bg-ink text-fg-muted font-sans selection:bg-accent-soft">
      <AppHeader />

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <Link href="/" className="text-blue-400 hover:text-blue-300 text-sm font-medium flex items-center gap-1 mb-2 transition-colors">
              <ArrowLeft className="w-4 h-4" /> Back to Dashboard
            </Link>
            <h2 className="text-3xl font-bold text-white">My Portfolio</h2>
            <p className="text-slate-400">Manage your paper trading positions and track performance.</p>
          </div>
          <button 
            onClick={() => {
              if (confirm('Are you sure you want to reset your account to ₹1,00,000? All history and positions will be cleared.')) {
                resetAccount();
              }
            }}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 border border-slate-700"
          >
            <RefreshCw className="w-4 h-4" /> Reset Account
          </button>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 backdrop-blur-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <Wallet className="w-5 h-5 text-blue-400" />
              </div>
              <span className="text-sm font-medium text-slate-400">Available Cash</span>
            </div>
            <p className="text-2xl font-mono font-bold text-white">₹{balance.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
          </div>

          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 backdrop-blur-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
                <PieChart className="w-5 h-5 text-indigo-400" />
              </div>
              <span className="text-sm font-medium text-slate-400">Total Value</span>
            </div>
            <p className="text-2xl font-mono font-bold text-white">₹{totalValue.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
          </div>

          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 backdrop-blur-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-emerald-400" />
              </div>
              <span className="text-sm font-medium text-slate-400">Unrealized P&L</span>
            </div>
            <div className="flex flex-col">
              <p className={`text-2xl font-mono font-bold ${totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {totalPnl >= 0 ? '+' : ''}₹{totalPnl.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </p>
              <p className={`text-xs font-bold ${totalPnl >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {totalPnl >= 0 ? '+' : ''}{totalPnlPercent.toFixed(2)}%
              </p>
            </div>
          </div>

          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 backdrop-blur-sm">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                <History className="w-5 h-5 text-amber-400" />
              </div>
              <span className="text-sm font-medium text-slate-400">Realized P&L</span>
            </div>
            <p className={`text-2xl font-mono font-bold ${totalRealizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {totalRealizedPnl >= 0 ? '+' : ''}₹{totalRealizedPnl.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {positionsWithUnavailablePrice.length > 0 && !isLoadingPrices && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-200">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-400" />
            <div>
              <p className="font-semibold text-amber-300">
                Live price unavailable for {positionsWithUnavailablePrice.length} position{positionsWithUnavailablePrice.length > 1 ? 's' : ''}: {positionsWithUnavailablePrice.map(p => p.symbol).join(', ')}
              </p>
              <p className="mt-1 text-amber-200/80">
                Their P&amp;L below shows as unavailable rather than 0 - the totals above conservatively assume no price change for them until a live price is fetched. This usually resolves on the next automatic refresh (every 60s); if it persists, try reopening the position from the Dashboard.
              </p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-6 border-b border-slate-800 mb-6">
          <button 
            onClick={() => setActiveTab('POSITIONS')}
            className={`pb-4 text-sm font-bold transition-colors relative ${activeTab === 'POSITIONS' ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}
          >
            Open Positions ({positions.length})
            {activeTab === 'POSITIONS' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-500 rounded-full"></div>}
          </button>
          <button 
            onClick={() => setActiveTab('HISTORY')}
            className={`pb-4 text-sm font-bold transition-colors relative ${activeTab === 'HISTORY' ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'}`}
          >
            Trade History ({history.length})
            {activeTab === 'HISTORY' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-500 rounded-full"></div>}
          </button>
        </div>

        {activeTab === 'POSITIONS' ? (
          <div className="grid grid-cols-1 gap-4">
            {positions.length === 0 ? (
              <div className="bg-slate-900/30 border border-dashed border-slate-800 rounded-2xl p-12 text-center">
                <div className="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-4">
                  <PieChart className="w-8 h-8 text-slate-600" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">No Open Positions</h3>
                <p className="text-slate-500 mb-6">Start trading from the dashboard to see your positions here.</p>
                <Link href="/" className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors">
                  Go to Dashboard
                </Link>
              </div>
            ) : (
              positions.map((pos) => {
                const livePrice = currentPrices[pos.symbol];
                const hasLivePrice = livePrice !== undefined;
                const currentPrice = livePrice ?? pos.avgPrice;
                const { pnl, pnlPercent } = calculatePositionPnl(pos, currentPrice);
                const currency = pos.currency || (pos.symbol.includes('=') || pos.symbol.includes('-USD') ? 'USD' : 'INR');
                const currencySymbol = currency === 'USD' ? '$' : '₹';
                const riskTrigger = hasLivePrice ? getRiskTrigger(pos, currentPrice) : null;
                const fetchError = priceFetchErrors[pos.symbol];
                
                return (
                  <div key={pos.symbol} className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm hover:border-slate-700 transition-all group">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center font-bold text-white text-lg">
                          {pos.symbol.substring(0, 2)}
                        </div>
                        <div>
                          <h3 className="text-xl font-bold text-white">{pos.symbol}</h3>
                          <p className="text-sm text-slate-500">{pos.shares} Shares</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 flex-1 lg:ml-12">
                        <div>
                          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Avg. Price</p>
                          <p className="text-sm font-mono text-white">{currencySymbol}{pos.avgPrice.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Buy Value</p>
                          <p className="text-sm font-mono text-slate-300">{currencySymbol}{(pos.avgPrice * pos.shares).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Current Price</p>
                          {hasLivePrice ? (
                            <p className="text-sm font-mono text-blue-400">
                              {currencySymbol}{currentPrice.toFixed(2)}
                              {isLoadingPrices && <Loader2 className="w-3 h-3 inline ml-1 animate-spin opacity-50" />}
                            </p>
                          ) : (
                            <p className="text-sm font-mono text-amber-400/80 flex items-center gap-1" title={fetchError || 'Live price could not be fetched yet'}>
                              {isLoadingPrices ? <Loader2 className="w-3 h-3 animate-spin" /> : <AlertTriangle className="w-3 h-3" />}
                              Unavailable
                            </p>
                          )}
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Current Value</p>
                          {hasLivePrice ? (
                            <p className="text-sm font-mono text-white">{currencySymbol}{(currentPrice * pos.shares).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
                          ) : (
                            <p className="text-sm font-mono text-slate-600">—</p>
                          )}
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">P&L</p>
                          {hasLivePrice ? (
                            <>
                              <p className={`text-sm font-mono font-bold ${pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {pnl >= 0 ? '+' : ''}{currencySymbol}{pnl.toFixed(2)} ({pnlPercent.toFixed(2)}%)
                              </p>
                              {riskTrigger && (
                                <p className={`mt-1 text-[10px] font-bold ${riskTrigger === 'TARGET' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                  {riskTrigger === 'TARGET' ? 'Target hit' : 'Stop hit'}
                                </p>
                              )}
                            </>
                          ) : (
                            <p className="text-sm font-mono text-slate-600">—</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <Link 
                          href={`/?symbol=${pos.symbol}`}
                          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium rounded-lg transition-colors border border-slate-700"
                        >
                          View Chart
                        </Link>
                        <button 
                          onClick={() => {
                            // Simple sell all for now, or could open a modal
                            if (confirm(`Sell all ${pos.shares} shares of ${pos.symbol} at ${currencySymbol}${currentPrice.toFixed(2)}?`)) {
                              sell(pos.symbol, currentPrice, pos.shares, currency);
                            }
                          }}
                          disabled={!hasLivePrice}
                          title={!hasLivePrice ? 'Live price unavailable - wait for the next refresh before selling' : undefined}
                          className="px-4 py-2 bg-rose-600/20 hover:bg-rose-600/30 disabled:bg-slate-800/50 disabled:text-slate-600 disabled:cursor-not-allowed text-rose-400 border border-rose-500/30 disabled:border-slate-700 text-sm font-medium rounded-lg transition-colors"
                        >
                          Sell All
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden backdrop-blur-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-800/50 border-b border-slate-800">
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Type</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Symbol</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Date & Time</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Shares</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Price</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total</th>
                    <th className="px-6 py-4 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Realized P&L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {history.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-slate-500">No trade history found.</td>
                    </tr>
                  ) : (
                    history.map((trade) => {
                      const currency = trade.currency || (trade.symbol.includes('=') || trade.symbol.includes('-USD') ? 'USD' : 'INR');
                      const currencySymbol = currency === 'USD' ? '$' : '₹';
                      
                      return (
                        <tr key={trade.id} className="hover:bg-slate-800/20 transition-colors">
                          <td className="px-6 py-4">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${trade.type === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
                              {trade.type}
                            </span>
                          </td>
                          <td className="px-6 py-4 font-bold text-white">{trade.symbol}</td>
                          <td className="px-6 py-4 text-sm text-slate-400">{new Date(trade.timestamp).toLocaleString()}</td>
                          <td className="px-6 py-4 text-sm font-mono text-slate-300">{trade.shares}</td>
                          <td className="px-6 py-4 text-sm font-mono text-slate-300">{currencySymbol}{trade.price.toFixed(2)}</td>
                          <td className="px-6 py-4 text-sm font-mono text-white">{currencySymbol}{(trade.shares * trade.price).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</td>
                          <td className="px-6 py-4 text-sm font-mono font-bold text-right">
                            {trade.realizedPnl !== undefined ? (
                              <span className={trade.realizedPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                {trade.realizedPnl >= 0 ? '+' : ''}{currencySymbol}{trade.realizedPnl.toFixed(2)}
                              </span>
                            ) : (
                              <span className="text-slate-600">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
        <LegalDisclaimer className="mt-8" />
      </main>
    </div>
  );
}

export default function PortfolioPage() {
  return (
    <ProGuard featureName="Paper Trading Portfolio">
      <PortfolioContent />
    </ProGuard>
  );
}
