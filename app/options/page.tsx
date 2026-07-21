'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Activity, Search, AlertTriangle, Loader2, BarChart2 } from 'lucide-react';
import { fetchYahooFinanceData } from '@/lib/dataFetcher';
import { generateMockOptionsData, OptionsData } from '@/lib/optionsData';
import AppHeader from '@/components/AppHeader';
import ProGuard from '@/components/ProGuard';
import LegalDisclaimer from '@/components/LegalDisclaimer';

const FO_SYMBOLS = [
  { symbol: '^NSEI', name: 'NIFTY 50' },
  { symbol: '^NSEBANK', name: 'BANKNIFTY' },
  { symbol: 'RELIANCE.NS', name: 'RELIANCE' },
  { symbol: 'HDFCBANK.NS', name: 'HDFCBANK' },
  { symbol: 'ICICIBANK.NS', name: 'ICICIBANK' },
  { symbol: 'INFY.NS', name: 'INFY' },
  { symbol: 'TCS.NS', name: 'TCS' },
  { symbol: 'SBIN.NS', name: 'SBIN' },
  { symbol: 'ITC.NS', name: 'ITC' },
  { symbol: 'GC=F', name: 'GOLD (MCX)' },
  { symbol: 'SI=F', name: 'SILVER (MCX)' },
  { symbol: 'CL=F', name: 'CRUDE OIL (MCX)' },
];

function OptionsContent() {
  const [searchInput, setSearchInput] = useState(FO_SYMBOLS[0].symbol);
  const [selectedSymbol, setSelectedSymbol] = useState(FO_SYMBOLS[0].symbol);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optionsData, setOptionsData] = useState<OptionsData | null>(null);
  const [aiPrediction, setAiPrediction] = useState<string | null>(null);
  const [isPredicting, setIsPredicting] = useState(false);

  const generatePrediction = useCallback(async (data: OptionsData) => {
    setIsPredicting(true);
    try {
      const response = await fetch('/api/ai/options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || `AI request failed with ${response.status}`);

      setAiPrediction(result?.text || 'No prediction generated.');
    } catch (err) {
      console.error('AI Prediction error:', err);
      setAiPrediction('AI analysis is unavailable. Review PCR, OI, max pain, IV, support/resistance, and risk manually.');
    } finally {
      setIsPredicting(false);
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setOptionsData(null);
    setAiPrediction(null);

    try {
      // Fetch current price
      const data = await fetchYahooFinanceData(selectedSymbol, 'GLOBAL', '1d');
      if (!data || data.candles.length === 0) throw new Error('Failed to fetch current price.');
      const currentPrice = data.candles[data.candles.length - 1].close;

      // Fetch India VIX
      let vix = 15; // default
      try {
        const vixData = await fetchYahooFinanceData('^INDIAVIX', 'GLOBAL', '1d');
        if (vixData && vixData.candles.length > 0) {
          vix = vixData.candles[vixData.candles.length - 1].close;
        }
    } catch {
      console.warn('Could not fetch India VIX, using default 15');
    }

      const optData = generateMockOptionsData(selectedSymbol, currentPrice, vix);
      setOptionsData(optData);

      // Generate AI Prediction
      generatePrediction(optData);

    } catch (err: any) {
      setError(err.message || 'Failed to load options data');
    } finally {
      setLoading(false);
    }
  }, [selectedSymbol, generatePrediction]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="min-h-screen bg-ink text-fg-muted font-sans selection:bg-accent-soft">
      <AppHeader />

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
          <div>
            <h2 className="text-3xl font-bold text-white flex items-center gap-3">
              <BarChart2 className="w-8 h-8 text-blue-500" />
              Options Chain & F&O Analysis
            </h2>
            <p className="text-slate-400 mt-1">Educational CE/PE analytics based on OI, IV, PCR, max pain, and VIX.</p>
          </div>

          <form 
            onSubmit={(e) => {
              e.preventDefault();
              if (searchInput.trim()) setSelectedSymbol(searchInput.trim().toUpperCase());
            }}
            className="flex items-center gap-3 bg-slate-900/50 p-2 rounded-xl border border-slate-800"
          >
            <Search className="w-5 h-5 text-slate-400 ml-2" />
            <input 
              type="text"
              placeholder="Search symbol (e.g. RELIANCE.NS)"
              className="bg-transparent border-none text-white focus:ring-0 outline-none py-1 px-2 w-48 uppercase placeholder:text-slate-500 placeholder:normal-case"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <button 
              type="submit"
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Analyze
            </button>
          </form>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
          </div>
        )}

        {error && (
          <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-6 text-center">
            <AlertTriangle className="w-10 h-10 text-rose-400 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-rose-400 mb-1">Error Loading Data</h3>
            <p className="text-rose-300/80">{error}</p>
          </div>
        )}

        {optionsData && !loading && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left Column: Stats & AI Prediction */}
            <div className="lg:col-span-1 space-y-6">
              
              {/* Key Metrics */}
              <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6">
                <h3 className="text-lg font-bold text-white mb-4">Key Metrics</h3>
                <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">
                  {optionsData.warnings[0]}
                </div>
                
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                    <div className="text-sm text-slate-400 mb-1">Current Price</div>
                    <div className="text-xl font-bold text-white">{optionsData.currentPrice.toFixed(2)}</div>
                  </div>
                  <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                    <div className="text-sm text-slate-400 mb-1">India VIX</div>
                    <div className={`text-xl font-bold ${optionsData.vix > 18 ? 'text-rose-400' : 'text-emerald-400'}`}>
                      {optionsData.vix.toFixed(2)}
                    </div>
                  </div>
                  <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                    <div className="text-sm text-slate-400 mb-1">Max Pain</div>
                    <div className="text-xl font-bold text-blue-400">{optionsData.maxPain}</div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center p-3 bg-slate-800/30 rounded-lg border border-slate-700/30">
                    <span className="text-slate-400">Put Call Ratio (PCR)</span>
                    <span className={`font-bold ${optionsData.pcr > 1 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {optionsData.pcr}
                    </span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-slate-800/30 rounded-lg border border-slate-700/30">
                    <span className="text-slate-400">Strongest Resistance (Call OI)</span>
                    <span className="font-bold text-rose-400">{optionsData.maxCallOIStrike}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-slate-800/30 rounded-lg border border-slate-700/30">
                    <span className="text-slate-400">Strongest Support (Put OI)</span>
                    <span className="font-bold text-emerald-400">{optionsData.maxPutOIStrike}</span>
                  </div>
                  <div className="p-3 bg-slate-800/30 rounded-lg border border-slate-700/30">
                    <div className="text-slate-400 mb-2">OI Resistance Zones</div>
                    <div className="flex flex-wrap gap-2">
                      {optionsData.oiResistance.map(level => (
                        <span key={level.strike} className="text-xs rounded-md bg-rose-500/10 px-2 py-1 text-rose-300 border border-rose-500/20">
                          {level.strike}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="p-3 bg-slate-800/30 rounded-lg border border-slate-700/30">
                    <div className="text-slate-400 mb-2">OI Support Zones</div>
                    <div className="flex flex-wrap gap-2">
                      {optionsData.oiSupport.map(level => (
                        <span key={level.strike} className="text-xs rounded-md bg-emerald-500/10 px-2 py-1 text-emerald-300 border border-emerald-500/20">
                          {level.strike}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* AI Prediction */}
              <div className="bg-gradient-to-br from-blue-900/20 to-indigo-900/20 border border-blue-500/20 rounded-2xl p-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl -mr-10 -mt-10"></div>
                
                <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-blue-400" />
                  AI Options Prediction
                </h3>
                
                {isPredicting ? (
                  <div className="flex flex-col items-center justify-center py-8">
                    <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-3" />
                    <p className="text-sm text-slate-400">Analyzing OI & PCR data...</p>
                  </div>
                ) : aiPrediction ? (
                  <div className="prose prose-invert prose-sm max-w-none">
                    <div className="text-slate-300 leading-relaxed whitespace-pre-wrap">
                      {aiPrediction}
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-400 text-sm">No prediction available.</p>
                )}
              </div>
            </div>

            {/* Right Column: Options Chain Table */}
            <div className="lg:col-span-2">
              <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden">
                <div className="p-4 border-b border-slate-800 bg-slate-800/30 flex justify-between items-center">
                  <h3 className="text-lg font-bold text-white">Synthetic Options Chain</h3>
                  <span className="text-xs text-slate-400">Expiry: {optionsData.expiryDate}</span>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-400 bg-slate-800/50 uppercase">
                      <tr>
                        <th colSpan={6} className="px-4 py-3 text-center border-b border-r border-slate-700/50">CALLS (CE)</th>
                        <th className="px-4 py-3 text-center border-b border-slate-700/50 bg-slate-800/80 text-white">STRIKE</th>
                        <th colSpan={6} className="px-4 py-3 text-center border-b border-l border-slate-700/50">PUTS (PE)</th>
                      </tr>
                      <tr className="border-b border-slate-700/50">
                        <th className="px-4 py-2 text-right">OI</th>
                        <th className="px-4 py-2 text-right">Chng OI</th>
                        <th className="px-4 py-2 text-right">IV</th>
                        <th className="px-4 py-2 text-right text-emerald-400">Target</th>
                        <th className="px-4 py-2 text-right text-rose-400">SL</th>
                        <th className="px-4 py-2 text-right border-r border-slate-700/50">LTP</th>
                        
                        <th className="px-4 py-2 text-center bg-slate-800/80 text-white">PRICE</th>
                        
                        <th className="px-4 py-2 text-left border-l border-slate-700/50">LTP</th>
                        <th className="px-4 py-2 text-left text-emerald-400">Target</th>
                        <th className="px-4 py-2 text-left text-rose-400">SL</th>
                        <th className="px-4 py-2 text-left">IV</th>
                        <th className="px-4 py-2 text-left">Chng OI</th>
                        <th className="px-4 py-2 text-left">OI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {optionsData.strikes.map((strike, idx) => {
                        const isATM = Math.abs(strike.strike - optionsData.currentPrice) < (strike.strike * 0.005);
                        
                        return (
                          <tr key={idx} className={`border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors ${isATM ? 'bg-blue-900/10' : ''}`}>
                            {/* Calls */}
                            <td className="px-4 py-2 text-right text-slate-300">
                              {strike.callOI.toLocaleString()}
                              {strike.strike === optionsData.maxCallOIStrike && (
                                <span className="ml-2 text-[10px] bg-rose-500/20 text-rose-400 px-1.5 py-0.5 rounded">Max</span>
                              )}
                            </td>
                            <td className={`px-4 py-2 text-right ${strike.callChangeOI > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {strike.callChangeOI > 0 ? '+' : ''}{strike.callChangeOI.toLocaleString()}
                            </td>
                            <td className="px-4 py-2 text-right text-slate-300 text-xs">
                              {strike.callIV.toFixed(1)}%
                            </td>
                            <td className="px-4 py-2 text-right text-emerald-400/80 text-xs">
                              {(strike.callPrice * 1.6).toFixed(2)}
                            </td>
                            <td className="px-4 py-2 text-right text-rose-400/80 text-xs">
                              {(strike.callPrice * 0.6).toFixed(2)}
                            </td>
                            <td className="px-4 py-2 text-right font-medium text-white border-r border-slate-700/50">
                              {strike.callPrice.toFixed(2)}
                            </td>
                            
                            {/* Strike */}
                            <td className="px-4 py-2 text-center font-bold text-white bg-slate-800/40">
                              {strike.strike}
                              {isATM && <div className="text-[10px] text-blue-400 font-normal">ATM</div>}
                            </td>
                            
                            {/* Puts */}
                            <td className="px-4 py-2 text-left font-medium text-white border-l border-slate-700/50">
                              {strike.putPrice.toFixed(2)}
                            </td>
                            <td className="px-4 py-2 text-left text-emerald-400/80 text-xs">
                              {(strike.putPrice * 1.6).toFixed(2)}
                            </td>
                            <td className="px-4 py-2 text-left text-rose-400/80 text-xs">
                              {(strike.putPrice * 0.6).toFixed(2)}
                            </td>
                            <td className="px-4 py-2 text-left text-slate-300 text-xs">
                              {strike.putIV.toFixed(1)}%
                            </td>
                            <td className={`px-4 py-2 text-left ${strike.putChangeOI > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {strike.putChangeOI > 0 ? '+' : ''}{strike.putChangeOI.toLocaleString()}
                            </td>
                            <td className="px-4 py-2 text-left text-slate-300">
                              {strike.putOI.toLocaleString()}
                              {strike.strike === optionsData.maxPutOIStrike && (
                                <span className="ml-2 text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded">Max</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

          </div>
        )}
        <LegalDisclaimer className="mt-8" />
      </main>
    </div>
  );
}

export default function OptionsPage() {
  return (
    <ProGuard featureName="Options Chain & F&O Analysis">
      <OptionsContent />
    </ProGuard>
  );
}
