'use client';

import React, { useState } from 'react';
import { usePaperTrading } from '@/lib/usePaperTrading';
import { Wallet, AlertCircle, ExternalLink, ShieldAlert, Target } from 'lucide-react';
import Link from 'next/link';
import { getRiskTrigger } from '@/lib/portfolio';
import { Exchange } from '@/lib/types';

interface PaperTradingPanelProps {
  symbol: string;
  currentPrice: number;
  currency?: string;
  /** Exchange this symbol was resolved on (e.g. stockData.metadata.exchange). Recorded on
   * the position at buy time so the Portfolio page can refresh its price correctly later
   * instead of guessing the exchange from the symbol's string shape. */
  exchange?: Exchange;
}

export default function PaperTradingPanel({ symbol, currentPrice, currency, exchange }: PaperTradingPanelProps) {
  const { balance, positions, buy, sell, isLoaded } = usePaperTrading();
  const [quantity, setQuantity] = useState<number>(1);
  const [stopLoss, setStopLoss] = useState('');
  const [target, setTarget] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!isLoaded) return null;

  const currentPosition = positions.find(p => p.symbol === symbol);
  const pnl = currentPosition ? (currentPrice - currentPosition.avgPrice) * currentPosition.shares : 0;
  const pnlPercent = currentPosition ? ((currentPrice - currentPosition.avgPrice) / currentPosition.avgPrice) * 100 : 0;
  const trigger = currentPosition ? getRiskTrigger(currentPosition, currentPrice) : null;
  
  const currencySymbol = currency === 'USD' ? '$' : '₹';
  
  const handleBuy = () => {
    try {
      setError(null);
      buy(symbol, currentPrice, quantity, currency, {
        stopLoss: stopLoss ? Number(stopLoss) : undefined,
        target: target ? Number(target) : undefined,
      }, exchange);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleSell = () => {
    try {
      setError(null);
      sell(symbol, currentPrice, quantity, currency);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Wallet className="w-5 h-5 text-blue-400" />
          Quick Trade
        </h3>
        <Link 
          href="/portfolio"
          className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 transition-colors font-medium"
        >
          Full Portfolio <ExternalLink className="w-3 h-3" />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Cash</p>
          <p className="text-sm font-mono font-bold text-white">₹{balance.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p>
        </div>
        <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-wider mb-1">Position</p>
          <p className="text-sm font-mono font-bold text-white">{currentPosition ? `${currentPosition.shares} Sh` : 'None'}</p>
        </div>
      </div>

      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{symbol} Setup</span>
          {currentPosition && (
            <span className={`text-xs font-bold flex items-center gap-1 ${pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {pnl >= 0 ? '+' : ''}{currencySymbol}{pnl.toFixed(2)} ({pnlPercent.toFixed(1)}%)
            </span>
          )}
        </div>
        {trigger && (
          <div className={`mb-3 rounded-lg border px-3 py-2 text-xs font-bold ${trigger === 'TARGET' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-rose-500/30 bg-rose-500/10 text-rose-300'}`}>
            {trigger === 'TARGET' ? 'Target reached in simulation' : 'Stop-loss reached in simulation'}
          </div>
        )}
        
        <div className="space-y-4">
          <div>
            <div className="flex items-center bg-slate-800 border border-slate-700 rounded-lg overflow-hidden h-10">
              <button 
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="px-3 text-slate-400 hover:bg-slate-700 hover:text-white transition-colors h-full"
              >
                -
              </button>
              <input 
                type="number" 
                min="1"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full bg-transparent text-center text-white font-mono text-sm outline-none"
              />
              <button 
                onClick={() => setQuantity(quantity + 1)}
                className="px-3 text-slate-400 hover:bg-slate-700 hover:text-white transition-colors h-full"
              >
                +
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-3 h-10">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              <input
                type="number"
                min="0"
                step="0.01"
                value={stopLoss}
                onChange={(e) => setStopLoss(e.target.value)}
                placeholder="Stop"
                className="w-full bg-transparent text-white font-mono text-xs outline-none placeholder:text-slate-500"
              />
            </label>
            <label className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-lg px-3 h-10">
              <Target className="w-4 h-4 text-blue-400" />
              <input
                type="number"
                min="0"
                step="0.01"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="Target"
                className="w-full bg-transparent text-white font-mono text-xs outline-none placeholder:text-slate-500"
              />
            </label>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-rose-400 text-[10px] bg-rose-400/10 p-2 rounded border border-rose-400/20">
              <AlertCircle className="w-3 h-3" />
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <button 
              onClick={handleBuy}
              className="py-2.5 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-500 transition-colors shadow-lg shadow-emerald-500/10 flex flex-col items-center justify-center"
            >
              <span className="text-sm">BUY</span>
              <span className="text-[10px] font-normal opacity-70">{currencySymbol}{(currentPrice * quantity).toFixed(0)}</span>
            </button>
            <button 
              onClick={handleSell}
              disabled={!currentPosition || currentPosition.shares < quantity}
              className="py-2.5 rounded-xl font-bold text-white bg-rose-600 hover:bg-rose-500 disabled:bg-slate-800 disabled:text-slate-500 transition-colors shadow-lg shadow-rose-500/10 flex flex-col items-center justify-center"
            >
              <span className="text-sm">SELL</span>
              <span className="text-[10px] font-normal opacity-70">{currencySymbol}{(currentPrice * quantity).toFixed(0)}</span>
            </button>
          </div>
        </div>
      </div>
      
      <div className="text-[10px] text-slate-500 text-center italic">
        *Paper trading uses virtual money for practice.
      </div>
    </div>
  );
}
