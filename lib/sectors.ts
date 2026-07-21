import { Exchange } from './types';

export interface SectorDefinition {
  name: string;
  /** Representative NSE peer tickers for this sector (bare symbols, resolved normally). */
  nsePeers: string[];
  /** Verified Yahoo-resolvable NSE sectoral index ticker, used for the sector's technical
   * trend read. Left undefined when no reliably-confirmed ticker exists for this sector -
   * the technical trend is then simply not shown rather than guessed at a ticker. */
  nseIndexSymbol?: string;
  /** SPDR Select Sector ETF ticker - the closest US sector-fund equivalent, used for the
   * technical trend read when the analyzed stock is US-listed. */
  usIndexSymbol?: string;
  /** A few large, well-known US peer tickers for this sector, used for peer comparison
   * when the analyzed stock is US-listed. */
  usPeers?: string[];
}

// Maps an NSE stock symbol (bare ticker, as used throughout this app) to a sector name.
// This is the same taxonomy the AI Screener already uses (app/screener/page.tsx imports
// it from here so both features stay in sync rather than maintaining two copies).
export const NSE_SECTOR_MAP: Record<string, string> = {
  RELIANCE: 'Energy', ONGC: 'Energy', BPCL: 'Energy',
  TCS: 'IT', INFY: 'IT', HCLTECH: 'IT', WIPRO: 'IT', TECHM: 'IT',
  HDFCBANK: 'Banking', ICICIBANK: 'Banking', SBIN: 'Banking', AXISBANK: 'Banking', KOTAKBANK: 'Banking', PNB: 'Banking', BANKBARODA: 'Banking', INDUSINDBK: 'Banking',
  BAJFINANCE: 'Financials', BAJAJFINSV: 'Financials', JIOFIN: 'Financials', PFC: 'Financials', RECLTD: 'Financials', IRFC: 'Financials',
  SUNPHARMA: 'Pharma', DRREDDY: 'Pharma', CIPLA: 'Pharma', DIVISLAB: 'Pharma', TORNTPHARM: 'Pharma', LUPIN: 'Pharma',
  TATAMOTORS: 'Auto', MARUTI: 'Auto', 'M&M': 'Auto', EICHERMOT: 'Auto', HEROMOTOCO: 'Auto', 'BAJAJ-AUTO': 'Auto', TVSMOTOR: 'Auto',
  ITC: 'FMCG', HINDUNILVR: 'FMCG', TATACONSUM: 'FMCG', BRITANNIA: 'FMCG', NESTLEIND: 'FMCG',
  TATASTEEL: 'Metals', HINDALCO: 'Metals', JSWSTEEL: 'Metals', JINDALSTEL: 'Metals',
  BEL: 'Defence', HAL: 'Defence', MAZDOCK: 'Defence', COCHINSHIP: 'Defence',
  ZOMATO: 'Consumer Tech', PAYTM: 'Consumer Tech', NYKAA: 'Consumer Tech',
};

export const SECTOR_NAMES = Array.from(new Set(Object.values(NSE_SECTOR_MAP))).sort();

// Sectoral index tickers were verified against live Yahoo Finance search results before
// being hardcoded here (^NSEBANK, ^CNXIT, ^CNXPHARMA, ^CNXAUTO, ^CNXFMCG, ^CNXMETAL,
// ^CNXENERGY, ^CNXFIN all confirmed present) - sectors without a verified ticker
// (Defence, Consumer Tech) are left without nseIndexSymbol rather than guessing one.
export const SECTOR_DEFINITIONS: Record<string, SectorDefinition> = {
  Energy: {
    name: 'Energy',
    nsePeers: ['RELIANCE', 'ONGC', 'BPCL'],
    nseIndexSymbol: '^CNXENERGY',
    usIndexSymbol: 'XLE',
    usPeers: ['XOM', 'CVX', 'COP'],
  },
  IT: {
    name: 'IT',
    nsePeers: ['TCS', 'INFY', 'HCLTECH', 'WIPRO', 'TECHM'],
    nseIndexSymbol: '^CNXIT',
    usIndexSymbol: 'XLK',
    usPeers: ['AAPL', 'MSFT', 'NVDA'],
  },
  Banking: {
    name: 'Banking',
    nsePeers: ['HDFCBANK', 'ICICIBANK', 'SBIN', 'AXISBANK', 'KOTAKBANK'],
    nseIndexSymbol: '^NSEBANK',
    usIndexSymbol: 'XLF',
    usPeers: ['JPM', 'BAC', 'WFC'],
  },
  Financials: {
    name: 'Financials',
    nsePeers: ['BAJFINANCE', 'BAJAJFINSV', 'JIOFIN', 'PFC', 'RECLTD'],
    nseIndexSymbol: '^CNXFIN',
    usIndexSymbol: 'XLF',
    usPeers: ['JPM', 'GS', 'MS'],
  },
  Pharma: {
    name: 'Pharma',
    nsePeers: ['SUNPHARMA', 'DRREDDY', 'CIPLA', 'DIVISLAB', 'TORNTPHARM'],
    nseIndexSymbol: '^CNXPHARMA',
    usIndexSymbol: 'XLV',
    usPeers: ['JNJ', 'PFE', 'UNH'],
  },
  Auto: {
    name: 'Auto',
    nsePeers: ['TATAMOTORS', 'MARUTI', 'M&M', 'EICHERMOT', 'HEROMOTOCO'],
    nseIndexSymbol: '^CNXAUTO',
    usIndexSymbol: 'XLY',
    usPeers: ['TSLA', 'GM', 'F'],
  },
  FMCG: {
    name: 'FMCG',
    nsePeers: ['ITC', 'HINDUNILVR', 'TATACONSUM', 'BRITANNIA', 'NESTLEIND'],
    nseIndexSymbol: '^CNXFMCG',
    usIndexSymbol: 'XLP',
    usPeers: ['PG', 'KO', 'PEP'],
  },
  Metals: {
    name: 'Metals',
    nsePeers: ['TATASTEEL', 'HINDALCO', 'JSWSTEEL', 'JINDALSTEL'],
    nseIndexSymbol: '^CNXMETAL',
    usIndexSymbol: 'XLB',
    usPeers: ['NUE', 'FCX', 'AA'],
  },
  Defence: {
    name: 'Defence',
    nsePeers: ['BEL', 'HAL', 'MAZDOCK', 'COCHINSHIP'],
    // No verified dedicated Yahoo-resolvable NIFTY Defence index ticker - technical trend
    // for this sector falls back to peer-average behavior instead (see sectorAnalysis.ts).
    usIndexSymbol: 'ITA',
  },
  'Consumer Tech': {
    name: 'Consumer Tech',
    nsePeers: ['ZOMATO', 'PAYTM', 'NYKAA'],
    // Same as Defence - no verified dedicated index ticker for this sector on Yahoo.
  },
};

// Maps Yahoo's assetProfile.sector string (standard GICS-style labels) for a US stock to
// the nearest SECTOR_DEFINITIONS entry, so a US symbol's sector analysis can reuse the
// same SPDR-ETF-based technical trend and peer list.
export const US_GICS_SECTOR_TO_DEFINITION: Record<string, string> = {
  Technology: 'IT',
  'Information Technology': 'IT',
  'Financial Services': 'Financials',
  Financials: 'Financials',
  Healthcare: 'Pharma',
  'Health Care': 'Pharma',
  'Consumer Cyclical': 'Auto',
  'Consumer Discretionary': 'Auto',
  'Consumer Defensive': 'FMCG',
  'Consumer Staples': 'FMCG',
  Energy: 'Energy',
  'Basic Materials': 'Metals',
  Materials: 'Metals',
  Industrials: 'Defence',
};

export interface ResolvedSector {
  sector: SectorDefinition;
  /** Whether this was matched via the NSE stock map (India) or a US GICS sector label. */
  matchedVia: 'nse-stock' | 'us-gics-sector' | 'none';
}

/**
 * Resolves a stock to its SectorDefinition. `bareSymbol` is the plain ticker (e.g.
 * "RELIANCE", "AAPL") without any exchange suffix. `usGicsSector` is Yahoo's
 * assetProfile.sector string, only meaningful for US-listed stocks.
 */
export function resolveSectorForStock(bareSymbol: string, exchange: Exchange, usGicsSector?: string): ResolvedSector | null {
  const nseSectorName = NSE_SECTOR_MAP[bareSymbol.toUpperCase()];
  if (nseSectorName && SECTOR_DEFINITIONS[nseSectorName]) {
    return { sector: SECTOR_DEFINITIONS[nseSectorName], matchedVia: 'nse-stock' };
  }

  if (exchange === 'US' && usGicsSector) {
    const mapped = US_GICS_SECTOR_TO_DEFINITION[usGicsSector];
    if (mapped && SECTOR_DEFINITIONS[mapped]) {
      return { sector: SECTOR_DEFINITIONS[mapped], matchedVia: 'us-gics-sector' };
    }
  }

  return null;
}
