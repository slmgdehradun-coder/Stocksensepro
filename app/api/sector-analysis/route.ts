import { NextResponse } from 'next/server';
import { fetchMarketData } from '@/lib/marketData';
import { resolveSymbol } from '@/lib/symbolResolver';
import { calculateIndicators } from '@/lib/indicators';
import { SECTOR_DEFINITIONS, SECTOR_NAMES, resolveSectorForStock, SectorDefinition } from '@/lib/sectors';
import { aggregateSectorFundamentals, buildSectorTechnicalAnalysis, SectorFundamentalAnalysis, SectorTechnicalAnalysis } from '@/lib/sectorAnalysis';
import { getFundamentalSnapshot } from '@/lib/server/fundamentals';
import { computeAltmanZScore, computeCompositeScores, computeFundamentalRatios, computePiotroskiScore } from '@/lib/fundamentalScore';
import { FundamentalAnalysis } from '@/lib/types';
import { Exchange } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Sector-level data (index trend, 10y performance, aggregated peer fundamentals) changes
// slowly - cached in-process to avoid re-fetching a whole peer group on every page view.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
interface CachedSectorAnalysis {
  sectorName: string;
  technical: SectorTechnicalAnalysis | null;
  technicalUnavailableReason?: string;
  fundamental: SectorFundamentalAnalysis;
  peers: Array<{ symbol: string; analysis: FundamentalAnalysis | null; error?: string }>;
}
const cache = new Map<string, { at: number; data: CachedSectorAnalysis }>();

const MAX_PEERS = 4;

async function fetchPeerFundamentals(symbol: string, exchange: Exchange): Promise<{ symbol: string; analysis: FundamentalAnalysis | null; error?: string }> {
  try {
    const { snapshot, error } = await getFundamentalSnapshot(symbol, exchange);
    if (!snapshot) return { symbol, analysis: null, error: error || 'Fundamental data unavailable.' };

    const ratios = computeFundamentalRatios(snapshot);
    const piotroski = computePiotroskiScore(snapshot);
    const altmanZ = computeAltmanZScore(snapshot);
    const scores = computeCompositeScores(ratios, piotroski, altmanZ);
    // Peer comparison only needs the scores/ratios, not a full recommendation - build a
    // minimal analysis shape (recommendation omitted) for aggregation purposes only.
    const analysis: FundamentalAnalysis = {
      snapshot,
      ratios,
      piotroski,
      altmanZ,
      magicFormula: { earningsYieldPct: null, returnOnCapitalPct: null, score: null, detail: '' },
      grahamNumber: { grahamNumber: null, marginOfSafetyPct: null, detail: '' },
      scores,
      recommendation: { verdict: 'Hold', confidence: 0, reasoning: [], cautionNotes: [], disclaimer: '' },
    };
    return { symbol, analysis };
  } catch (err) {
    return { symbol, analysis: null, error: err instanceof Error ? err.message : 'Unexpected error' };
  }
}

async function computeSectorAnalysis(sectorName: string, sectorDef: SectorDefinition, isUsContext: boolean): Promise<CachedSectorAnalysis> {
  const indexSymbol = isUsContext ? sectorDef.usIndexSymbol : sectorDef.nseIndexSymbol;
  const indexExchange: Exchange = isUsContext ? 'US' : 'NSE';
  const peerList = (isUsContext ? sectorDef.usPeers : sectorDef.nsePeers) || [];
  const peerSymbols = peerList.slice(0, MAX_PEERS);

  let technical: SectorTechnicalAnalysis | null = null;
  let technicalUnavailableReason: string | undefined;

  if (indexSymbol) {
    try {
      const [trendData, longHistoryData] = await Promise.all([
        fetchMarketData({ symbol: indexSymbol, exchange: indexExchange, timeFrame: '1d' }),
        fetchMarketData({ symbol: indexSymbol, exchange: indexExchange, timeFrame: '1mo' }),
      ]);
      technical = buildSectorTechnicalAnalysis(indexSymbol, trendData.candles, longHistoryData.candles);
    } catch (err) {
      technicalUnavailableReason = err instanceof Error ? err.message : 'Sector index data could not be fetched.';
    }
  } else {
    technicalUnavailableReason = `No verified index/ETF ticker is configured for the ${sectorName} sector - peer comparison below is still available.`;
  }

  const peerResults = await Promise.all(peerSymbols.map(symbol => fetchPeerFundamentals(symbol, isUsContext ? 'US' : 'NSE')));
  const fundamental = aggregateSectorFundamentals(
    peerResults.map(p => p.analysis).filter((a): a is FundamentalAnalysis => a !== null),
    peerSymbols.length,
  );

  return { sectorName, technical, technicalUnavailableReason, fundamental, peers: peerResults };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sectorParam = searchParams.get('sector')?.trim();
    const symbolParam = searchParams.get('symbol')?.trim();
    const exchangeParam = (searchParams.get('exchange')?.trim() || 'NSE') as Exchange;
    const excludeSymbol = searchParams.get('excludeSymbol')?.trim()?.toUpperCase();

    let sectorName: string | undefined = sectorParam;
    let isUsContext = false;

    if (!sectorName && symbolParam) {
      const resolution = resolveSymbol(symbolParam, exchangeParam);
      const bareSymbol = resolution.primary.symbol.replace(/\.(NS|BO)$/, '');
      isUsContext = resolution.primary.exchange === 'US';

      let usGicsSector: string | undefined;
      if (isUsContext) {
        // Best-effort: peek at the fundamentals snapshot's sector field (already fetched
        // and cached by the Fundamentals page moments earlier in normal usage) to map a US
        // stock to the nearest sector definition via its GICS sector label.
        const { snapshot } = await getFundamentalSnapshot(symbolParam, exchangeParam).catch(() => ({ snapshot: null }));
        usGicsSector = snapshot?.sector;
      }

      const resolved = resolveSectorForStock(bareSymbol, resolution.primary.exchange, usGicsSector);
      if (!resolved) {
        return NextResponse.json({ error: `No sector mapping is available for ${symbolParam}.`, availableSectors: SECTOR_NAMES }, { status: 404 });
      }
      sectorName = resolved.sector.name;
    }

    if (!sectorName || !SECTOR_DEFINITIONS[sectorName]) {
      return NextResponse.json({ error: 'Unknown or missing sector.', availableSectors: SECTOR_NAMES }, { status: 400 });
    }

    const cacheKey = `${sectorName}:${isUsContext ? 'US' : 'NSE'}`;
    const cached = cache.get(cacheKey);
    let data: CachedSectorAnalysis;
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      data = cached.data;
    } else {
      data = await computeSectorAnalysis(sectorName, SECTOR_DEFINITIONS[sectorName], isUsContext);
      cache.set(cacheKey, { at: Date.now(), data });
    }

    // excludeSymbol filters the currently-analyzed stock out of its own peer comparison
    // table - done post-cache so the cached sector data can be reused across different
    // callers regardless of which stock they're viewing.
    const peers = excludeSymbol
      ? data.peers.filter(p => p.symbol.toUpperCase() !== excludeSymbol && !p.symbol.toUpperCase().startsWith(excludeSymbol))
      : data.peers;

    return NextResponse.json({ ...data, peers });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected sector analysis error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
