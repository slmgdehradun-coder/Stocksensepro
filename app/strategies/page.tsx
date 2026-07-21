import React from 'react';
import Link from 'next/link';
import { Activity, BookOpen, TrendingUp, BarChart2, Target, Zap, ArrowRight } from 'lucide-react';
import AppHeader from '@/components/AppHeader';
import LegalDisclaimer from '@/components/LegalDisclaimer';

const STRATEGIES = [
  {
    id: 'golden-cross',
    name: 'Moving Average Crossover (Golden Cross)',
    book: 'Technical Analysis of the Financial Markets',
    author: 'John J. Murphy',
    icon: <TrendingUp className="w-6 h-6 text-emerald-400" />,
    description: 'A classic trend-following strategy that triggers a buy signal when a short-term moving average crosses above a long-term moving average.',
    rules: [
      'Use 50-day Simple Moving Average (SMA) as short-term.',
      'Use 200-day Simple Moving Average (SMA) as long-term.',
      'BUY when 50-day SMA crosses ABOVE 200-day SMA.',
      'SELL when 50-day SMA crosses BELOW 200-day SMA (Death Cross).'
    ],
    bestFor: 'Long-term trend following in strong bull markets.'
  },
  {
    id: 'rsi-divergence',
    name: 'RSI Divergence',
    book: 'New Concepts in Technical Trading Systems',
    author: 'J. Welles Wilder',
    icon: <Activity className="w-6 h-6 text-blue-400" />,
    description: 'Identifies potential reversals by comparing price action to the Relative Strength Index (RSI) momentum oscillator.',
    rules: [
      'Look for price making a Lower Low (LL).',
      'Check if RSI is making a Higher Low (HL) at the same time.',
      'This creates a Bullish Divergence, signaling weakening downward momentum.',
      'Enter long on the next bullish confirmation candle.'
    ],
    bestFor: 'Catching bottoms or tops before a major trend reversal.'
  },
  {
    id: 'bollinger-squeeze',
    name: 'Bollinger Band Squeeze',
    book: 'Bollinger on Bollinger Bands',
    author: 'John Bollinger',
    icon: <Target className="w-6 h-6 text-purple-400" />,
    description: 'Capitalizes on periods of low volatility (squeeze) which are historically followed by periods of high volatility (breakout).',
    rules: [
      'Wait for Bollinger Bands to narrow significantly (the squeeze).',
      'Look for volume expansion as price breaks out of the upper or lower band.',
      'BUY if price breaks above the upper band with high volume.',
      'Place stop loss below the middle band (20 SMA).'
    ],
    bestFor: 'Trading explosive breakouts after periods of consolidation.'
  },
  {
    id: 'triple-screen',
    name: 'Triple Screen Trading System',
    book: 'Trading for a Living',
    author: 'Dr. Alexander Elder',
    icon: <BarChart2 className="w-6 h-6 text-amber-400" />,
    description: 'A comprehensive system that uses three different timeframes to filter out false signals and align with the major trend.',
    rules: [
      'Screen 1 (Long-term): Identify the major trend using MACD Histogram on a weekly chart.',
      'Screen 2 (Intermediate): Find pullbacks against the major trend using an oscillator (like RSI or Stochastic) on a daily chart.',
      'Screen 3 (Short-term): Time the exact entry using trailing buy stops on intraday charts.'
    ],
    bestFor: 'Reducing false breakouts and trading with the dominant market tide.'
  },
  {
    id: 'vcp',
    name: 'Volatility Contraction Pattern (VCP)',
    book: 'Trade Like a Stock Market Wizard',
    author: 'Mark Minervini',
    icon: <Zap className="w-6 h-6 text-rose-400" />,
    description: 'Focuses on stocks consolidating with progressively tighter price swings and decreasing volume before a major breakout.',
    rules: [
      'Stock must be in a long-term uptrend (above 200 SMA).',
      'Look for 2 to 6 price contractions (pullbacks) from left to right.',
      'Each contraction should be smaller than the last (e.g., 25%, then 12%, then 5%).',
      'Volume must dry up dramatically during the tightest part of the pattern.',
      'BUY on the breakout above the pivot point on heavy volume.'
    ],
    bestFor: 'Finding explosive growth stocks ready for their next leg up.'
  }
];

export default function StrategiesPage() {
  return (
    <div className="min-h-screen bg-ink text-fg-muted font-sans selection:bg-accent-soft">
      <AppHeader />

      <main className="max-w-7xl mx-auto px-4 py-12">
        <div className="mb-12">
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-4 flex items-center gap-3">
            <BookOpen className="w-8 h-8 text-blue-500" />
            Top Technical Strategies
          </h1>
          <p className="text-slate-400 max-w-3xl text-lg">
            A curated collection of the most powerful trading strategies extracted from legendary technical analysis books. Use these proven frameworks to refine your trading edge.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {STRATEGIES.map((strategy) => (
            <div key={strategy.id} className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 hover:border-slate-700 transition-all group">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-slate-800 rounded-xl border border-slate-700">
                    {strategy.icon}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">{strategy.name}</h2>
                    <p className="text-sm text-slate-400 flex items-center gap-1 mt-1">
                      <BookOpen className="w-3 h-3" />
                      <span className="italic">{strategy.book}</span> by {strategy.author}
                    </p>
                  </div>
                </div>
              </div>

              <p className="text-slate-300 mb-6 leading-relaxed">
                {strategy.description}
              </p>

              <div className="bg-slate-800/30 rounded-xl p-5 border border-slate-700/50 mb-6">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Target className="w-4 h-4 text-blue-400" /> Execution Rules
                </h3>
                <ul className="space-y-2">
                  {strategy.rules.map((rule, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-slate-300">
                      <ArrowRight className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                      <span>{rule}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex items-center justify-between mt-6 pt-6 border-t border-slate-800/50">
                <div className="flex items-center gap-2 text-sm">
                  <span className="px-2.5 py-1 rounded-md bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">
                    Best For
                  </span>
                  <span className="text-slate-400">{strategy.bestFor}</span>
                </div>
                
                <Link 
                  href={`/screener?strategy=${strategy.id}`}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                >
                  <Activity className="w-4 h-4" />
                  Scan Stocks
                </Link>
              </div>
            </div>
          ))}
        </div>
        <LegalDisclaimer className="mt-8" />
      </main>
    </div>
  );
}
