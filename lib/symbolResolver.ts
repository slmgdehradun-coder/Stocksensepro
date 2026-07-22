import { Exchange, MarketDataQuality, SymbolCandidate, SymbolResolution } from './types';

const INDIAN_EQUITY_ALIASES: Record<string, string> = {
  HDFC: 'HDFCBANK',
  HDFCBANK: 'HDFCBANK',
  'HDFCBANKLTD': 'HDFCBANK',
  'HDFCBANKLIMITED': 'HDFCBANK',
  'HDFCBANK LTD': 'HDFCBANK',
  'HDFC BANK': 'HDFCBANK',
  RELIANCE: 'RELIANCE',
  RIL: 'RELIANCE',
  TCS: 'TCS',
  INFY: 'INFY',
  INFOSYS: 'INFY',
  SBI: 'SBIN',
  SBIN: 'SBIN',
  'STATE BANK OF INDIA': 'SBIN',
  'BAJAJ FINANCE': 'BAJFINANCE',
  BAJFINANCE: 'BAJFINANCE',
  'BHARTI AIRTEL': 'BHARTIARTL',
  BHARTIARTL: 'BHARTIARTL',
  'KOTAK BANK': 'KOTAKBANK',
  KOTAKBANK: 'KOTAKBANK',
  'TATA MOTORS': 'TATAMOTORS',
  TATAMOTORS: 'TATAMOTORS',
  ZOMATO: 'ZOMATO',
  PAYTM: 'PAYTM',
  ADANI: 'ADANIENT',
  ADANIENT: 'ADANIENT',
  'ADANI ENTERPRISES': 'ADANIENT',
  'ADANI ENTERPRISES LTD': 'ADANIENT',
  'ADANI ENTERPRISES LIMITED': 'ADANIENT',
  ADANIENTERPRISE: 'ADANIENT',
  ADANIENTERPRISES: 'ADANIENT',
  ADANIENTERPRISESLTD: 'ADANIENT',
  ADANIENTERPRISESLIMITED: 'ADANIENT',
  'ADANI PORTS': 'ADANIPORTS',
  'ADANI PORTS AND SEZ': 'ADANIPORTS',
  ADANIPORT: 'ADANIPORTS',
  ADANIPORTS: 'ADANIPORTS',
  ICICI: 'ICICIBANK',
  ICICIBANK: 'ICICIBANK',
};

const INDEX_ALIASES: Record<string, string> = {
  NIFTY: '^NSEI',
  NIFTY50: '^NSEI',
  'NIFTY 50': '^NSEI',
  NSEI: '^NSEI',
  BANKNIFTY: '^NSEBANK',
  'BANK NIFTY': '^NSEBANK',
  NIFTYBANK: '^NSEBANK',
  'NIFTY BANK': '^NSEBANK',
  NSEBANK: '^NSEBANK',
  SENSEX: '^BSESN',
  BSESN: '^BSESN',
  'INDIA VIX': '^INDIAVIX',
  INDIAVIX: '^INDIAVIX',
};

const MCX_ALIASES: Record<string, { primary: string; globalFallback: string; label: string }> = {
  GOLD: { primary: 'GOLDM.NS', globalFallback: 'GC=F', label: 'Gold' },
  GOLDM: { primary: 'GOLDM.NS', globalFallback: 'GC=F', label: 'Gold Mini' },
  'MCX GOLD': { primary: 'GOLDM.NS', globalFallback: 'GC=F', label: 'Gold' },
  SILVER: { primary: 'SILVERM.NS', globalFallback: 'SI=F', label: 'Silver' },
  SILVERM: { primary: 'SILVERM.NS', globalFallback: 'SI=F', label: 'Silver Mini' },
  'MCX SILVER': { primary: 'SILVERM.NS', globalFallback: 'SI=F', label: 'Silver' },
  CRUDE: { primary: 'CRUDEOIL-I.NS', globalFallback: 'CL=F', label: 'Crude Oil' },
  CRUDEOIL: { primary: 'CRUDEOIL-I.NS', globalFallback: 'CL=F', label: 'Crude Oil' },
  'CRUDE OIL': { primary: 'CRUDEOIL-I.NS', globalFallback: 'CL=F', label: 'Crude Oil' },
  NATURALGAS: { primary: 'NATURALGAS-I.NS', globalFallback: 'NG=F', label: 'Natural Gas' },
  'NATURAL GAS': { primary: 'NATURALGAS-I.NS', globalFallback: 'NG=F', label: 'Natural Gas' },
  COPPER: { primary: 'COPPER-I.NS', globalFallback: 'HG=F', label: 'Copper' },
  ZINC: { primary: 'ZINCM-I.NS', globalFallback: 'ZN=F', label: 'Zinc' },
  ZINCM: { primary: 'ZINCM-I.NS', globalFallback: 'ZN=F', label: 'Zinc Mini' },
  ALUMINIUM: { primary: 'ALUMINIUM-I.NS', globalFallback: 'ALI=F', label: 'Aluminium' },
};

const GLOBAL_ALIASES: Record<string, string> = {
  GOLD: 'GC=F',
  SILVER: 'SI=F',
  CRUDEOIL: 'CL=F',
  'CRUDE OIL': 'CL=F',
  WTI: 'CL=F',
  NATURALGAS: 'NG=F',
  'NATURAL GAS': 'NG=F',
  BITCOIN: 'BTC-USD',
  BTC: 'BTC-USD',
  ETHEREUM: 'ETH-USD',
  ETH: 'ETH-USD',
  USDINR: 'INR=X',
  'USD/INR': 'INR=X',
};

const US_INDEX_ALIASES: Record<string, string> = {
  DOW: '^DJI',
  DOWJONES: '^DJI',
  'DOW JONES': '^DJI',
  NASDAQ: '^IXIC',
  NASDAQ100: '^NDX',
  'NASDAQ 100': '^NDX',
  SP500: '^GSPC',
  'S&P500': '^GSPC',
  'S&P 500': '^GSPC',
  SNP500: '^GSPC',
};

const INDIAN_EQUITY_SET = new Set(Object.values(INDIAN_EQUITY_ALIASES));

function compactSymbol(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, ' ');
}

function providerSymbol(value: string) {
  return compactSymbol(value).replace(/\s+/g, '').replace(/[^A-Z0-9.^=&-]/g, '');
}

function candidate(
  symbol: string,
  label: string,
  exchange: Exchange,
  currency: string,
  assetClass: SymbolCandidate['assetClass'],
  dataQuality: MarketDataQuality = 'provider',
  note?: string
): SymbolCandidate {
  return {
    symbol,
    label,
    exchange,
    provider: 'yahoo',
    currency,
    assetClass,
    dataQuality,
    note,
  };
}

export function isResolvedGlobalSymbol(symbol: string) {
  return symbol.startsWith('^') || symbol.includes('=') || symbol.includes('-USD') || symbol.includes('-INR');
}

export function inferCurrency(symbol: string) {
  if (symbol.endsWith('.NS') || symbol.endsWith('.BO') || symbol.startsWith('^NSE') || symbol.startsWith('^CNX') || symbol === '^BSESN' || symbol === '^INDIAVIX') {
    return 'INR';
  }
  if (symbol.endsWith('-INR') || symbol === 'INR=X') return 'INR';
  return 'USD';
}

export function inferExchange(symbol: string): Exchange {
  if (symbol.endsWith('.NS') || symbol.startsWith('^NSE') || symbol.startsWith('^CNX') || symbol === '^INDIAVIX') return 'NSE';
  if (symbol.endsWith('.BO') || symbol === '^BSESN') return 'BSE';
  if (symbol === '^DJI' || symbol === '^IXIC' || symbol === '^NDX' || symbol === '^GSPC') return 'US';
  return 'GLOBAL';
}

function dedupeCandidates(candidates: SymbolCandidate[]) {
  const seen = new Set<string>();
  return candidates.filter(item => {
    if (seen.has(item.symbol)) return false;
    seen.add(item.symbol);
    return true;
  });
}

export function resolveSymbol(input: string, exchange: Exchange = 'NSE'): SymbolResolution {
  const requested = input;
  const normalized = compactSymbol(input);
  const compact = providerSymbol(input);
  const warnings: string[] = [];
  const candidates: SymbolCandidate[] = [];

  if (!compact) {
    const fallback = candidate('^NSEI', 'NIFTY 50', 'NSE', 'INR', 'index');
    return {
      requested,
      normalized,
      exchange,
      primary: fallback,
      candidates: [fallback],
      warnings: ['Empty symbol was resolved to NIFTY 50 as a safe default.'],
    };
  }

  const indexSymbol = INDEX_ALIASES[normalized] || INDEX_ALIASES[compact];
  if (indexSymbol) {
    candidates.push(candidate(indexSymbol, normalized, inferExchange(indexSymbol), inferCurrency(indexSymbol), 'index'));
  }

  const usIndexSymbol = US_INDEX_ALIASES[normalized] || US_INDEX_ALIASES[compact];
  if (exchange === 'US' && usIndexSymbol) {
    candidates.push(candidate(usIndexSymbol, normalized, 'US', 'USD', 'index'));
  }

  const mcxAlias = MCX_ALIASES[normalized] || MCX_ALIASES[compact];
  if (exchange === 'MCX' && mcxAlias) {
    candidates.push(candidate(mcxAlias.primary, mcxAlias.label, 'MCX', 'INR', 'commodity', 'provider', 'Yahoo availability may vary for MCX contracts.'));
    candidates.push(candidate(mcxAlias.globalFallback, `${mcxAlias.label} global benchmark`, 'GLOBAL', 'USD', 'future', 'estimated', 'Fallback benchmark, not an exact MCX contract.'));
    warnings.push('MCX symbols may use Yahoo proxies or global benchmarks. Treat converted prices as estimated.');
  }

  const globalAlias = GLOBAL_ALIASES[normalized] || GLOBAL_ALIASES[compact];
  if (exchange === 'GLOBAL' && globalAlias) {
    const assetClass = globalAlias.endsWith('-USD') ? 'crypto' : globalAlias.includes('=') ? 'future' : 'unknown';
    candidates.push(candidate(globalAlias, normalized, 'GLOBAL', inferCurrency(globalAlias), assetClass));
  }

  const equityAlias = INDIAN_EQUITY_ALIASES[normalized] || INDIAN_EQUITY_ALIASES[compact];
  const baseEquity = equityAlias || compact;

  if (exchange === 'US' && !indexSymbol && !globalAlias && !mcxAlias) {
    candidates.push(candidate(compact, normalized, 'US', inferCurrency(compact), compact.startsWith('^') ? 'index' : 'equity'));
  } else if (compact.includes('.') || isResolvedGlobalSymbol(compact)) {
    candidates.push(candidate(compact, normalized, inferExchange(compact), inferCurrency(compact), compact.startsWith('^') ? 'index' : 'unknown'));
  } else if (equityAlias || INDIAN_EQUITY_SET.has(baseEquity)) {
    if (exchange === 'BSE') {
      candidates.push(candidate(`${baseEquity}.BO`, baseEquity, 'BSE', 'INR', 'equity'));
      candidates.push(candidate(`${baseEquity}.NS`, baseEquity, 'NSE', 'INR', 'equity'));
    } else {
      candidates.push(candidate(`${baseEquity}.NS`, baseEquity, 'NSE', 'INR', 'equity'));
      candidates.push(candidate(`${baseEquity}.BO`, baseEquity, 'BSE', 'INR', 'equity'));
    }
  } else if (exchange === 'NSE') {
    candidates.push(candidate(`${compact}.NS`, compact, 'NSE', 'INR', 'equity'));
    candidates.push(candidate(`${compact}.BO`, compact, 'BSE', 'INR', 'equity'));
  } else if (exchange === 'BSE') {
    candidates.push(candidate(`${compact}.BO`, compact, 'BSE', 'INR', 'equity'));
    candidates.push(candidate(`${compact}.NS`, compact, 'NSE', 'INR', 'equity'));
  } else if (exchange === 'MCX') {
    candidates.push(candidate(`${compact}.NS`, compact, 'MCX', 'INR', 'commodity', 'provider', 'Fallback Yahoo symbol for exchange-traded commodity lookup.'));
  } else {
    candidates.push(candidate(compact, compact, 'GLOBAL', inferCurrency(compact), 'unknown'));
    candidates.push(candidate(`${compact}-USD`, compact, 'GLOBAL', 'USD', 'crypto'));
    candidates.push(candidate(`${compact}.NS`, compact, 'NSE', 'INR', 'equity'));
  }

  const uniqueCandidates = dedupeCandidates(candidates);
  return {
    requested,
    normalized,
    exchange,
    primary: uniqueCandidates[0],
    candidates: uniqueCandidates,
    warnings,
  };
}
