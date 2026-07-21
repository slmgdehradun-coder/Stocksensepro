'use client';

import React from 'react';
import { BacktestResult } from '@/lib/aiPrediction';
import { TrendingUp, TrendingDown, Activity, Target, ShieldAlert, BarChart3, Percent, Clock } from 'lucide-react';
import LegalDisclaimer from '@/components/LegalDisclaimer';

interface PredictionProps {
  prediction: any;
  backtest: BacktestResult[];
  currentPattern: string;
  lastCandleTime?: string | number;
  timeFrame?: string;
  currency?: string;
}

export default function AIPredictionPanel({ prediction, backtest, currentPattern, lastCandleTime, timeFrame, currency }: PredictionProps) {
  const logicBias = prediction.logicBias || (prediction.signal.includes('Buy') ? 'bullish' : prediction.signal.includes('Sell') ? 'bearish' : 'neutral');
  const isBullish = logicBias === 'bullish';
  const isBearish = logicBias === 'bearish';
  const signalColor = isBullish ? 'text-emerald-400' : isBearish ? 'text-rose-400' : 'text-amber-400';
  const signalBg = isBullish ? 'bg-emerald-400/10' : isBearish ? 'bg-rose-400/10' : 'bg-amber-400/10';
  const signalBorder = isBullish ? 'border-emerald-400/20' : isBearish ? 'border-rose-400/20' : 'border-amber-400/20';
  const primaryReasons = isBullish ? prediction.bullishReasons || [] : isBearish ? prediction.bearishReasons || [] : prediction.neutralReasons || [];
  const opposingReasons = isBullish ? prediction.bearishReasons || [] : isBearish ? prediction.bullishReasons || [] : [];

  const currencySymbol = currency === 'USD' ? '$' : '₹';

  const currentBacktest = backtest.find(b => b.patternName === currentPattern);

  // Format the last candle time
  let formattedTime = '';
  if (lastCandleTime) {
    if (typeof lastCandleTime === 'number') {
      const date = new Date(lastCandleTime * 1000);
      formattedTime = date.toLocaleTimeString('en-US', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit', hour12: true });
      formattedTime += ' (IST)';
    } else {
      formattedTime = lastCandleTime;
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* AI Signal Card */}
      <div className={`col-span-1 p-6 rounded-2xl border ${signalBorder} ${signalBg} backdrop-blur-sm relative overflow-hidden group`}>
        {/* Animated background glow */}
        <div className={`absolute -top-24 -right-24 w-48 h-48 rounded-full blur-3xl opacity-20 transition-all duration-1000 group-hover:scale-150 ${isBullish ? 'bg-emerald-500' : isBearish ? 'bg-rose-500' : 'bg-amber-500'}`}></div>
        
        <div className="flex items-center justify-between mb-4 relative z-10">
          <h3 className="text-lg font-medium text-slate-300 flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-400" />
            AI Prediction Engine
          </h3>
          <div className="flex flex-col items-end gap-1">
            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider shadow-lg ${isBullish ? 'bg-emerald-500 text-white shadow-emerald-500/20' : isBearish ? 'bg-rose-500 text-white shadow-rose-500/20' : 'bg-amber-500 text-slate-950 shadow-amber-500/20'}`}>
              {prediction.signal}
            </span>
            {prediction.isConfirmed && (
              <span className="text-[9px] font-bold text-emerald-400 flex items-center gap-1 bg-emerald-400/10 px-1.5 py-0.5 rounded border border-emerald-400/20">
                <ShieldAlert className="w-2.5 h-2.5" /> CONFIRMED
              </span>
            )}
          </div>
        </div>
        
        <div className="mb-6 relative z-10">
          <div className="flex items-baseline gap-2">
            <span className={`text-6xl font-black tracking-tighter ${signalColor}`}>
              {prediction.confidence}%
            </span>
            <div className="flex flex-col">
              <span className="text-slate-400 text-xs uppercase font-bold tracking-widest">Confidence</span>
              <div className="flex items-center gap-1 mt-1">
                <div className="h-1.5 w-24 bg-slate-800 rounded-full overflow-hidden border border-slate-700/50">
                  <div 
                    className={`h-full transition-all duration-1000 ${isBullish ? 'bg-emerald-500' : isBearish ? 'bg-rose-500' : 'bg-amber-500'}`} 
                    style={{ width: `${prediction.confidence}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3 relative z-10">
          {/* Stability Info */}
          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/50 flex items-start gap-3">
            <Clock className="w-4 h-4 text-blue-400 mt-0.5" />
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Signal Stability</span>
              <span className="text-xs text-slate-200">
                Locked to {timeFrame || '15m'} candle close. Next update at candle end.
              </span>
              {formattedTime && (
                <span className="text-[10px] text-slate-500 mt-1">Reference: {formattedTime}</span>
              )}
            </div>
          </div>

          {/* Live Sentiment */}
          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Activity className={`w-4 h-4 ${prediction.liveSentiment === 'Bullish' ? 'text-emerald-400' : 'text-rose-400'} animate-pulse`} />
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-500 uppercase font-bold tracking-wider">Live Sentiment</span>
                <span className={`text-xs font-bold ${prediction.liveSentiment === 'Bullish' ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {prediction.liveSentiment} Price Action
                </span>
              </div>
            </div>
            <div className="text-[10px] text-slate-500 italic">Real-time</div>
          </div>

          {prediction.tradePlan ? (
            <div className="rounded-xl border border-slate-800/70 bg-slate-950/60 p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-500 text-[10px] uppercase font-bold">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                  Stop Loss
                </div>
                <div className="text-right">
                  <span className="font-mono font-bold text-amber-400 text-base">{currencySymbol}{prediction.tradePlan.stopLoss.toFixed(2)}</span>
                  <span className="ml-2 text-[10px] text-slate-500 font-mono">(1R = {currencySymbol}{prediction.tradePlan.riskPerShare.toFixed(2)})</span>
                </div>
              </div>

              <div className="h-px bg-slate-800"></div>

              <div className="space-y-2">
                {[prediction.tradePlan.target1, prediction.tradePlan.target2, prediction.tradePlan.target3].map((t: any, i: number) => (
                  <div key={t.label} className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Target className={`w-3.5 h-3.5 mt-0.5 ${i === 0 ? 'text-blue-400' : i === 1 ? 'text-emerald-400' : 'text-emerald-300'}`} />
                      <div>
                        <div className="flex items-baseline gap-2">
                          <span className="text-xs font-bold text-slate-300">{t.label}</span>
                          <span className="font-mono font-bold text-white text-sm">{currencySymbol}{t.price.toFixed(2)}</span>
                          <span className="text-[10px] font-mono text-emerald-400">{t.rMultiple.toFixed(1)}R</span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-0.5 max-w-xs">{t.guidance}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <p className="text-[9px] text-slate-600 italic pt-1 border-t border-slate-800/70">
                Staged exit plan (T1/T2/T3), not a single fixed target - this is how professional traders take partial profit while letting winners run, and R-multiples are always ≥1R/2R/3R by construction relative to this stop.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/50 flex flex-col gap-1">
                <div className="flex items-center gap-2 text-slate-500 text-[10px] uppercase font-bold">
                  <Target className="w-3.5 h-3.5 text-blue-400" />
                  Target
                </div>
                <span className="font-mono font-bold text-blue-400 text-lg">{currencySymbol}{prediction.targetPrice.toFixed(2)}</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800/50 flex flex-col gap-1">
                <div className="flex items-center gap-2 text-slate-500 text-[10px] uppercase font-bold">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                  Stop Loss
                </div>
                <span className="font-mono font-bold text-amber-400 text-lg">{currencySymbol}{prediction.stopLoss.toFixed(2)}</span>
              </div>
            </div>
          )}
          
          <div className={`p-3 rounded-xl border text-center ${prediction.volumeAnalysis.includes('High') ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-slate-800/50 border-slate-700/50 text-slate-400'} text-xs font-bold uppercase tracking-widest`}>
            {prediction.volumeAnalysis}
          </div>

          <div className="rounded-xl border border-slate-800/70 bg-slate-950/60 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  {isBullish ? 'Why Bullish' : isBearish ? 'Why Bearish' : 'Why Neutral'}
                </span>
                <p className="mt-1 text-xs text-slate-300">{prediction.logicSummary}</p>
              </div>
              <div className="text-right">
                <div className={`text-lg font-black ${signalColor}`}>{prediction.confluenceScore ?? Math.abs(prediction.score)}%</div>
                <div className="text-[9px] uppercase text-slate-500">Confluence</div>
              </div>
            </div>
            <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-slate-800">
              <div
                className={`h-full ${isBullish ? 'bg-emerald-500' : isBearish ? 'bg-rose-500' : 'bg-amber-500'}`}
                style={{ width: `${Math.min(100, prediction.confluenceScore ?? Math.abs(prediction.score))}%` }}
              />
            </div>
            <div className="space-y-2">
              {primaryReasons.slice(0, 4).map((reason: string) => (
                <div key={reason} className="flex gap-2 text-[11px] text-slate-300">
                  <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${isBullish ? 'bg-emerald-400' : isBearish ? 'bg-rose-400' : 'bg-amber-400'}`} />
                  <span>{reason}</span>
                </div>
              ))}
              {primaryReasons.length === 0 && (
                <div className="text-[11px] text-slate-500">No strong single factor; signal is based on mixed indicator evidence.</div>
              )}
            </div>
            {opposingReasons.length > 0 && (
              <div className="mt-3 border-t border-slate-800 pt-3">
                <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Opposing Factors</div>
                {opposingReasons.slice(0, 2).map((reason: string) => (
                  <div key={reason} className="flex gap-2 text-[11px] text-slate-400">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-500" />
                    <span>{reason}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {(prediction.marketRegime || prediction.higherTimeframeAlignment !== 'unavailable' || prediction.relativeStrength || prediction.falseBreakoutRisk) && (
            <div className="flex flex-wrap gap-2">
              {prediction.marketRegime && (
                <span
                  className={`text-[10px] px-2 py-1 rounded-lg font-bold uppercase tracking-wider border ${
                    prediction.marketRegime.label === 'Risk-On'
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                      : prediction.marketRegime.label === 'Risk-Off'
                        ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                        : prediction.marketRegime.label === 'Choppy'
                          ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                          : 'bg-slate-800/50 border-slate-700/50 text-slate-400'
                  }`}
                  title={prediction.marketRegime.notes?.join(' ')}
                >
                  NIFTY {prediction.marketRegime.label}
                </span>
              )}
              {prediction.higherTimeframeAlignment === 'aligned' && (
                <span className="text-[10px] px-2 py-1 rounded-lg font-bold uppercase tracking-wider border bg-emerald-500/10 border-emerald-500/20 text-emerald-400">
                  Weekly Confirms
                </span>
              )}
              {prediction.higherTimeframeAlignment === 'conflict' && (
                <span className="text-[10px] px-2 py-1 rounded-lg font-bold uppercase tracking-wider border bg-amber-500/10 border-amber-500/20 text-amber-400">
                  Weekly Conflicts
                </span>
              )}
              {prediction.relativeStrength && (
                <span
                  className={`text-[10px] px-2 py-1 rounded-lg font-bold uppercase tracking-wider border ${
                    prediction.relativeStrength.label === 'Leading'
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                      : prediction.relativeStrength.label === 'Lagging'
                        ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                        : 'bg-slate-800/50 border-slate-700/50 text-slate-400'
                  }`}
                >
                  vs NIFTY: {prediction.relativeStrength.label}
                </span>
              )}
              {prediction.falseBreakoutRisk && (
                <span className="text-[10px] px-2 py-1 rounded-lg font-bold uppercase tracking-wider border bg-amber-500/15 border-amber-500/30 text-amber-300">
                  ⚠ Breakout Risk
                </span>
              )}
            </div>
          )}

          {prediction.riskNotes?.length > 0 && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-100 space-y-1">
              {prediction.riskNotes.slice(0, 2).map((note: string) => (
                <div key={note}>{note}</div>
              ))}
            </div>
          )}

          {prediction.aiNarrative && (
            <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
              {prediction.aiNarrative}
            </div>
          )}

          <LegalDisclaimer compact />
        </div>
      </div>

      {/* Historical Pattern Stats */}
      <div className="col-span-1 lg:col-span-2 p-6 rounded-2xl border border-slate-800 bg-slate-900/50 backdrop-blur-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
          <BarChart3 className="w-32 h-32 text-white" />
        </div>
        
        {currentBacktest ? (
          <>
            <div className="flex items-center justify-between mb-6 relative z-10">
              <h3 className="text-lg font-medium text-slate-300 flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-indigo-400" />
                Pattern Backtest: <span className="text-white font-bold">{currentPattern}</span>
              </h3>
              <div className="flex flex-col items-end">
                <span className="text-xs text-slate-400 font-medium">Directional Win Rate</span>
                <span className="text-xl font-black text-indigo-400">{currentBacktest.winRate.toFixed(1)}%</span>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 relative z-10">
              <StatBox label="Win Rate" value={`${currentBacktest.winRate.toFixed(1)}%`} icon={<Percent className="w-4 h-4" />} color="text-emerald-400" />
              <StatBox label="Avg Return" value={`${currentBacktest.averageReturn >= 0 ? '+' : ''}${currentBacktest.averageReturn.toFixed(2)}%`} icon={<TrendingUp className="w-4 h-4" />} color={currentBacktest.averageReturn >= 0 ? 'text-emerald-400' : 'text-rose-400'} />
              <StatBox label="Max Drawdown" value={`${currentBacktest.maxDrawdown.toFixed(2)}%`} icon={<TrendingDown className="w-4 h-4" />} color="text-rose-400" />
              <StatBox label="Sample" value={`${currentBacktest.totalOccurrences} ${currentBacktest.sampleQuality}`} icon={<Activity className="w-4 h-4" />} color="text-blue-400" />
            </div>

            <div className="space-y-4 relative z-10">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <Clock className="w-4 h-4" /> Expected Returns (Candle-based)
                </h4>
                <div className="h-px flex-1 bg-slate-800 mx-4"></div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <TargetBox days={5} returnPct={currentBacktest.avgReturn5D} />
                <TargetBox days={10} returnPct={currentBacktest.avgReturn10D} />
                <TargetBox days={20} returnPct={currentBacktest.avgReturn20D} />
              </div>
              <p className="text-[10px] text-slate-500 italic text-center mt-4">
                *Backtest results are educational, exclude brokerage/slippage/taxes, and do not guarantee future performance.
              </p>
            </div>
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center py-12 relative z-10">
            <div className="w-16 h-16 rounded-full bg-slate-800/50 flex items-center justify-center mb-4 border border-slate-700/50">
              <BarChart3 className="w-8 h-8 text-slate-500" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">No Pattern Detected</h3>
            <p className="text-slate-400 max-w-xs mx-auto text-sm">
              The AI engine is currently analyzing technical indicators. No specific candlestick patterns have been identified in the current data range.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function StatBox({ label, value, icon, color }: { label: string, value: string, icon: React.ReactNode, color: string }) {
  return (
    <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/50 flex flex-col gap-2">
      <div className="flex items-center gap-2 text-slate-400 text-xs uppercase tracking-wider font-medium">
        {icon}
        {label}
      </div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

function TargetBox({ days, returnPct }: { days: number, returnPct: number }) {
  const isPositive = returnPct >= 0;
  return (
    <div className="p-3 rounded-xl bg-slate-800/30 border border-slate-700/30 flex justify-between items-center">
      <span className="text-slate-300 text-sm font-medium">{days} Candles</span>
      <span className={`font-mono font-bold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
        {isPositive ? '+' : ''}{returnPct.toFixed(2)}%
      </span>
    </div>
  );
}
