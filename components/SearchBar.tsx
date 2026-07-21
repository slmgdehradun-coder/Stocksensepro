'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { Exchange, TimeFrame, TIME_FRAME_CONFIGS } from '@/lib/dataFetcher';
import { MarketSearchResult } from '@/lib/types';

interface SearchBarProps {
  symbol: string;
  setSymbol: (s: string) => void;
  exchange: Exchange;
  setExchange: (e: Exchange) => void;
  timeFrame: TimeFrame;
  setTimeFrame: (tf: TimeFrame) => void;
  onSearch: (symbol: string, exchange: Exchange, timeFrame: TimeFrame) => void;
}

const US_EXCHANGE_LABELS = new Set(['NMS', 'NYQ', 'ASE', 'NCM', 'NGM', 'PCX', 'BATS', 'NASDAQ', 'NYSE', 'NYSE ARCA', 'AMEX']);

function exchangeFromSuggestion(item: MarketSearchResult, currentExchange: Exchange): Exchange {
  const yahooExchange = (item.exchange || item.exchangeDisplay || '').toUpperCase();

  if (currentExchange === 'MCX' && (item.exchange === 'MCX' || item.exchangeDisplay === 'MCX')) return 'MCX';
  if (item.symbol.endsWith('.NS') || item.symbol.startsWith('^NSE')) return 'NSE';
  if (item.symbol.endsWith('.BO') || item.symbol === '^BSESN') return 'BSE';
  if (US_EXCHANGE_LABELS.has(yahooExchange) || (item.currency === 'USD' && !item.symbol.includes('='))) return 'US';
  if (currentExchange === 'MCX') return 'MCX';
  return 'GLOBAL';
}

function cleanSymbolForExchange(symbol: string, exchange: Exchange) {
  if (exchange === 'NSE' && symbol.endsWith('.NS')) return symbol.replace(/\.NS$/, '');
  if (exchange === 'BSE' && symbol.endsWith('.BO')) return symbol.replace(/\.BO$/, '');
  return symbol;
}

export default function SearchBar({ symbol, setSymbol, exchange, setExchange, timeFrame, setTimeFrame, onSearch }: SearchBarProps) {
  const [query, setQuery] = useState(symbol);
  const [suggestions, setSuggestions] = useState<MarketSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    setQuery(symbol);
  }, [symbol]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const fetchSuggestions = async () => {
      if (!query || query.length < 2) {
        setSuggestions([]);
        return;
      }
      setLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&exchange=${exchange}`);
        if (res.ok) {
          const data = await res.json().catch(() => []);
          setSuggestions(Array.isArray(data) ? data : []);
        } else {
          setSuggestions([]);
        }
      } catch (err) {
        console.error('Failed to fetch suggestions', err);
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    };

    const debounce = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(debounce);
  }, [query, exchange]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setShowDropdown(false);
    onSearch(query, exchange, timeFrame);
  };

  const handleSelect = (item: MarketSearchResult) => {
    const nextExchange = exchangeFromSuggestion(item, exchange);
    const cleanSymbol = cleanSymbolForExchange(item.symbol, nextExchange);

    setExchange(nextExchange);
    setQuery(cleanSymbol);
    setSymbol(cleanSymbol);
    setShowDropdown(false);
    onSearch(cleanSymbol, nextExchange, timeFrame);
  };

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2 relative" ref={dropdownRef}>
      <div className="relative flex items-center bg-slate-900 border border-slate-700 rounded-lg overflow-visible focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 transition-all">
        <select 
          value={exchange} 
          onChange={(e) => {
            const newEx = e.target.value as Exchange;
            setExchange(newEx);
            if (symbol) onSearch(symbol, newEx, timeFrame);
          }}
          className="bg-transparent text-xs font-medium text-slate-400 pl-3 pr-2 py-2 outline-none border-r border-slate-700 cursor-pointer hover:text-white"
        >
          <option value="NSE">NSE</option>
          <option value="BSE">BSE</option>
          <option value="US">US</option>
          <option value="MCX">MCX</option>
          <option value="GLOBAL">Global/Raw</option>
        </select>
        
        <div className="relative">
          <input
            type="text"
            placeholder="Search stock or symbol..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value.toUpperCase());
              setShowDropdown(true);
            }}
            onFocus={() => setShowDropdown(true)}
            className="bg-transparent text-sm text-white px-3 py-2 w-56 outline-none placeholder:text-slate-600"
          />
          {loading && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2">
              <Loader2 className="w-4 h-4 text-slate-500 animate-spin" />
            </div>
          )}
        </div>

        <select
          value={timeFrame}
          onChange={(e) => {
            const newTf = e.target.value as TimeFrame;
            setTimeFrame(newTf);
            if (symbol) onSearch(symbol, exchange, newTf);
          }}
          className="bg-transparent text-xs font-medium text-slate-400 pl-2 pr-3 py-2 outline-none border-l border-slate-700 cursor-pointer hover:text-white"
        >
          {Object.entries(TIME_FRAME_CONFIGS).map(([key, config]) => (
            <option key={key} value={key}>{config.label}</option>
          ))}
        </select>
        <button type="submit" className="p-2 text-slate-400 hover:text-white transition-colors border-l border-slate-700">
          <Search className="w-4 h-4" />
        </button>
      </div>

      {showDropdown && suggestions.length > 0 && (
        <div className="absolute top-full left-0 mt-2 w-full bg-slate-800 border border-slate-700 rounded-lg shadow-xl overflow-hidden z-50">
          {suggestions.map((s, i) => (
            <button
              key={i}
              type="button"
              onClick={() => handleSelect(s)}
              className="w-full text-left px-4 py-3 hover:bg-slate-700 border-b border-slate-700/50 last:border-0 transition-colors flex flex-col"
            >
              <div className="flex justify-between items-center">
                <span className="font-bold text-white text-sm">{s.symbol}</span>
                <span className="text-xs text-slate-400">{s.exchangeDisplay || s.exchange}</span>
              </div>
              <span className="text-xs text-slate-300 truncate">{s.name}</span>
              <div className="mt-1 flex items-center justify-between gap-3 text-[11px] text-slate-500">
                <span>{s.type}</span>
                {typeof s.latestPrice === 'number' && (
                  <span className="font-mono text-slate-300">
                    {s.currency ? `${s.currency} ` : ''}{s.latestPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </form>
  );
}
