import { useState, useEffect } from 'react';
import { buyPosition, Position, sellPosition, TradeHistory } from './portfolio';

export type { Position, TradeHistory } from './portfolio';

export function usePaperTrading() {
  const [balance, setBalance] = useState<number>(100000);
  const [positions, setPositions] = useState<Position[]>([]);
  const [history, setHistory] = useState<TradeHistory[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load from local storage
  useEffect(() => {
    const loadData = () => {
      const storedBalance = localStorage.getItem('pt_balance');
      if (storedBalance) setBalance(parseFloat(storedBalance));
      
      const storedPositions = localStorage.getItem('pt_positions');
      if (storedPositions) setPositions(JSON.parse(storedPositions));
      
      const storedHistory = localStorage.getItem('pt_history');
      if (storedHistory) setHistory(JSON.parse(storedHistory));
      
      setIsLoaded(true);
    };
    
    // Defer execution to avoid synchronous setState in effect
    const timer = setTimeout(loadData, 0);
    return () => clearTimeout(timer);
  }, []);

  // Save to local storage
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('pt_balance', balance.toString());
      localStorage.setItem('pt_positions', JSON.stringify(positions));
      localStorage.setItem('pt_history', JSON.stringify(history));
    }
  }, [balance, positions, history, isLoaded]);

  const buy = (symbol: string, price: number, shares: number, currency?: string, risk?: { stopLoss?: number; target?: number }, exchange?: Position['exchange']) => {
    const result = buyPosition(balance, positions, {
      symbol,
      price,
      shares,
      currency,
      exchange,
      stopLoss: risk?.stopLoss,
      target: risk?.target,
    });
    setBalance(result.balance);
    setPositions(result.positions);
    setHistory(prev => [result.trade, ...prev]);
  };

  const sell = (symbol: string, price: number, shares: number, currency?: string) => {
    const result = sellPosition(balance, positions, {
      symbol,
      price,
      shares,
      currency,
    });
    setBalance(result.balance);
    setPositions(result.positions);
    setHistory(prev => [result.trade, ...prev]);
  };

  const resetAccount = () => {
    setBalance(100000);
    setPositions([]);
    setHistory([]);
  };

  return {
    balance,
    positions,
    history,
    buy,
    sell,
    resetAccount,
    isLoaded
  };
}
