export interface OptionStrike {
  strike: number;
  callOI: number;
  callChangeOI: number;
  callPrice: number;
  callIV: number;
  putOI: number;
  putChangeOI: number;
  putPrice: number;
  putIV: number;
}

export interface OILevel {
  strike: number;
  openInterest: number;
}

export interface OptionsData {
  symbol: string;
  currentPrice: number;
  vix: number;
  expiryDate: string;
  strikes: OptionStrike[];
  pcr: number;
  maxPain: number;
  maxCallOIStrike: number;
  maxPutOIStrike: number;
  totalCallOI: number;
  totalPutOI: number;
  oiResistance: OILevel[];
  oiSupport: OILevel[];
  dataMode: 'synthetic';
  warnings: string[];
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number) {
  let state = seed || 1;
  return () => {
    state |= 0;
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function getStrikeStep(currentPrice: number) {
  if (currentPrice > 30000) return 100;
  if (currentPrice > 10000) return 50;
  if (currentPrice > 2000) return 50;
  if (currentPrice > 500) return 20;
  return 10;
}

function getNextThursday() {
  const today = new Date();
  const nextThursday = new Date(today);
  nextThursday.setDate(today.getDate() + ((4 + 7 - today.getDay()) % 7 || 7));
  return nextThursday.toISOString().split('T')[0];
}

function estimateOptionPrice(currentPrice: number, strike: number, vix: number, side: 'call' | 'put', distance: number) {
  const intrinsic = side === 'call' ? Math.max(0, currentPrice - strike) : Math.max(0, strike - currentPrice);
  const volatilityFactor = Math.max(0.08, vix / 100);
  const timeValue = currentPrice * volatilityFactor * Math.max(0.015, (12 - distance) / 100);
  return Math.max(0.05, intrinsic + timeValue);
}

function calculateMaxPain(strikes: OptionStrike[]) {
  let bestStrike = strikes[0]?.strike || 0;
  let lowestPain = Number.POSITIVE_INFINITY;

  for (const expiry of strikes) {
    const pain = strikes.reduce((acc, item) => {
      const callPain = item.callOI * Math.max(0, expiry.strike - item.strike);
      const putPain = item.putOI * Math.max(0, item.strike - expiry.strike);
      return acc + callPain + putPain;
    }, 0);

    if (pain < lowestPain) {
      lowestPain = pain;
      bestStrike = expiry.strike;
    }
  }

  return bestStrike;
}

function topOILevels(strikes: OptionStrike[], currentPrice: number, side: 'support' | 'resistance') {
  return strikes
    .filter(item => side === 'support' ? item.strike <= currentPrice : item.strike >= currentPrice)
    .map(item => ({
      strike: item.strike,
      openInterest: side === 'support' ? item.putOI : item.callOI,
    }))
    .sort((a, b) => b.openInterest - a.openInterest)
    .slice(0, 3);
}

export function generateMockOptionsData(symbol: string, currentPrice: number, vix: number): OptionsData {
  const random = seededRandom(hashString(`${symbol}-${Math.round(currentPrice)}-${new Date().toISOString().split('T')[0]}`));
  const strikes: OptionStrike[] = [];
  const step = getStrikeStep(currentPrice);
  const atmStrike = Math.round(currentPrice / step) * step;
  const volatilityBias = Math.max(0.85, Math.min(1.35, vix / 15));

  let totalCallOI = 0;
  let totalPutOI = 0;
  let maxCallOI = 0;
  let maxPutOI = 0;
  let maxCallOIStrike = atmStrike;
  let maxPutOIStrike = atmStrike;

  for (let i = -10; i <= 10; i++) {
    const strike = atmStrike + i * step;
    const distance = Math.abs(i);
    const nearAtmWeight = Math.max(0.25, 1 - distance * 0.075);
    const roundWeight = strike % (step * 5) === 0 ? 1.35 : 1;
    const randomWeight = 0.75 + random() * 0.6;
    const callDirectionalBias = i > 0 ? 1.25 : 0.85;
    const putDirectionalBias = i < 0 ? 1.25 : 0.85;

    const callOI = Math.round(25000 * nearAtmWeight * roundWeight * randomWeight * callDirectionalBias * (vix < 15 ? 1.08 : 1));
    const putOI = Math.round(25000 * nearAtmWeight * roundWeight * (0.75 + random() * 0.6) * putDirectionalBias * volatilityBias);
    const callChangeOI = Math.round(callOI * ((random() - 0.42) * 0.22));
    const putChangeOI = Math.round(putOI * ((random() - 0.42) * 0.22));
    const callIV = Number(Math.max(8, vix + (random() - 0.5) * 5 + distance * 0.35).toFixed(2));
    const putIV = Number(Math.max(8, vix + (random() - 0.5) * 5 + distance * 0.4).toFixed(2));
    const callPrice = estimateOptionPrice(currentPrice, strike, callIV, 'call', distance);
    const putPrice = estimateOptionPrice(currentPrice, strike, putIV, 'put', distance);

    totalCallOI += callOI;
    totalPutOI += putOI;

    if (callOI > maxCallOI) {
      maxCallOI = callOI;
      maxCallOIStrike = strike;
    }
    if (putOI > maxPutOI) {
      maxPutOI = putOI;
      maxPutOIStrike = strike;
    }

    strikes.push({
      strike,
      callOI,
      callChangeOI,
      callPrice: Number(callPrice.toFixed(2)),
      callIV,
      putOI,
      putChangeOI,
      putPrice: Number(putPrice.toFixed(2)),
      putIV,
    });
  }

  const pcr = Number((totalPutOI / Math.max(1, totalCallOI)).toFixed(2));

  return {
    symbol,
    currentPrice,
    vix,
    expiryDate: getNextThursday(),
    strikes,
    pcr,
    maxPain: calculateMaxPain(strikes),
    maxCallOIStrike,
    maxPutOIStrike,
    totalCallOI,
    totalPutOI,
    oiResistance: topOILevels(strikes, currentPrice, 'resistance'),
    oiSupport: topOILevels(strikes, currentPrice, 'support'),
    dataMode: 'synthetic',
    warnings: [
      'Synthetic options chain: live exchange CE/PE OI, IV, and LTP require a licensed options data provider.',
      'Use this mode for workflow testing and education only.',
    ],
  };
}
