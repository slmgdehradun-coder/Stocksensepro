import { Exchange } from './types';

export interface Position {
  symbol: string;
  shares: number;
  avgPrice: number;
  currency?: string;
  /** Exchange the position was bought on (e.g. 'NSE', 'US'). Recorded at buy time so price
   * refreshes later don't have to guess it from the symbol's string shape - older positions
   * saved before this field existed will simply have it undefined, and callers should fall
   * back to symbol-based inference only in that case. */
  exchange?: Exchange;
  stopLoss?: number;
  target?: number;
}

export interface TradeHistory {
  id: string;
  symbol: string;
  type: 'BUY' | 'SELL';
  shares: number;
  price: number;
  timestamp: number;
  realizedPnl?: number;
  currency?: string;
}

export interface TradeOrder {
  symbol: string;
  price: number;
  shares: number;
  currency?: string;
  exchange?: Exchange;
  stopLoss?: number;
  target?: number;
}

export interface TradeResult {
  balance: number;
  positions: Position[];
  trade: TradeHistory;
}

export function validateTradeOrder(order: TradeOrder) {
  if (!order.symbol.trim()) throw new Error('Symbol is required');
  if (!Number.isFinite(order.price) || order.price <= 0) throw new Error('Price must be positive');
  if (!Number.isInteger(order.shares) || order.shares <= 0) throw new Error('Quantity must be a positive whole number');
  if (order.stopLoss !== undefined && (!Number.isFinite(order.stopLoss) || order.stopLoss <= 0)) throw new Error('Stop loss must be positive');
  if (order.target !== undefined && (!Number.isFinite(order.target) || order.target <= 0)) throw new Error('Target must be positive');
}

function createTrade(order: TradeOrder, type: TradeHistory['type'], realizedPnl?: number): TradeHistory {
  return {
    id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    symbol: order.symbol,
    type,
    shares: order.shares,
    price: order.price,
    timestamp: Date.now(),
    realizedPnl,
    currency: order.currency,
  };
}

export function buyPosition(balance: number, positions: Position[], order: TradeOrder): TradeResult {
  validateTradeOrder(order);
  const cost = order.price * order.shares;
  if (balance < cost) throw new Error('Insufficient balance');

  const existing = positions.find(position => position.symbol === order.symbol);
  const nextPositions = existing
    ? positions.map(position => {
        if (position.symbol !== order.symbol) return position;
        const newShares = position.shares + order.shares;
        const newAvgPrice = ((position.shares * position.avgPrice) + cost) / newShares;
        return {
          ...position,
          shares: newShares,
          avgPrice: newAvgPrice,
          currency: order.currency || position.currency,
          exchange: order.exchange ?? position.exchange,
          stopLoss: order.stopLoss ?? position.stopLoss,
          target: order.target ?? position.target,
        };
      })
    : [
        ...positions,
        {
          symbol: order.symbol,
          shares: order.shares,
          avgPrice: order.price,
          currency: order.currency,
          exchange: order.exchange,
          stopLoss: order.stopLoss,
          target: order.target,
        },
      ];

  return {
    balance: balance - cost,
    positions: nextPositions,
    trade: createTrade(order, 'BUY'),
  };
}

export function sellPosition(balance: number, positions: Position[], order: TradeOrder): TradeResult {
  validateTradeOrder(order);
  const existing = positions.find(position => position.symbol === order.symbol);
  if (!existing || existing.shares < order.shares) throw new Error('Insufficient shares to sell');

  const revenue = order.price * order.shares;
  const realizedPnl = (order.price - existing.avgPrice) * order.shares;
  const nextPositions = existing.shares === order.shares
    ? positions.filter(position => position.symbol !== order.symbol)
    : positions.map(position => position.symbol === order.symbol ? { ...position, shares: position.shares - order.shares } : position);

  return {
    balance: balance + revenue,
    positions: nextPositions,
    trade: createTrade({ ...order, currency: order.currency || existing.currency }, 'SELL', realizedPnl),
  };
}

export function calculatePositionPnl(position: Position, currentPrice: number) {
  const pnl = (currentPrice - position.avgPrice) * position.shares;
  const pnlPercent = position.avgPrice > 0 ? ((currentPrice - position.avgPrice) / position.avgPrice) * 100 : 0;
  return {
    investedValue: position.avgPrice * position.shares,
    currentValue: currentPrice * position.shares,
    pnl,
    pnlPercent,
  };
}

export function getRiskTrigger(position: Position, currentPrice: number) {
  if (position.stopLoss && currentPrice <= position.stopLoss) return 'STOP_LOSS' as const;
  if (position.target && currentPrice >= position.target) return 'TARGET' as const;
  return null;
}

export function convertToBaseCurrency(value: number, currency = 'INR', usdInr = 83.5) {
  return currency === 'USD' ? value * usdInr : value;
}
