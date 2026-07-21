import { NextResponse } from 'next/server';
import { getFundamentalSnapshot } from '@/lib/server/fundamentals';
import { computeAltmanZScore, computeCompositeScores, computeFundamentalRatios, computeGrahamNumber, computeMagicFormula, computePiotroskiScore } from '@/lib/fundamentalScore';
import { generateFundamentalRecommendation } from '@/lib/fundamentalRecommendation';
import { AltmanZResult, FundamentalRatios, FundamentalSnapshot, GrahamNumberResult, MagicFormulaResult, PiotroskiResult } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Fundamental data changes slowly (quarterly at most) compared to price data, so the
// network-bound fetch + statement-derived figures are cached for a while to avoid
// hammering Yahoo Finance / SEC EDGAR on every page view, and to stay well inside SEC's
// fair-access request guidance. Only the parts that don't depend on the caller's live
// technical trend score are cached - momentum and the final recommendation are always
// recomputed fresh so a different technicalTrendScore on a later request never returns a
// stale blended result.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
interface CachedFundamentals {
  snapshot: FundamentalSnapshot;
  ratios: FundamentalRatios;
  piotroski: PiotroskiResult;
  altmanZ: AltmanZResult;
  magicFormula: MagicFormulaResult;
  grahamNumber: GrahamNumberResult;
}
const cache = new Map<string, { at: number; data: CachedFundamentals }>();

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol')?.trim();
    const exchange = searchParams.get('exchange')?.trim() || 'NSE';
    const technicalTrendScoreParam = searchParams.get('technicalTrendScore');
    const technicalTrendScore = technicalTrendScoreParam !== null && Number.isFinite(Number(technicalTrendScoreParam))
      ? Number(technicalTrendScoreParam)
      : undefined;

    if (!symbol) {
      return NextResponse.json({ error: 'Missing symbol parameter' }, { status: 400 });
    }

    const cacheKey = `${symbol.toUpperCase()}:${exchange}`;
    const cached = cache.get(cacheKey);
    let data: CachedFundamentals;

    if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
      data = cached.data;
    } else {
      const { snapshot, error } = await getFundamentalSnapshot(symbol, exchange);
      if (!snapshot) {
        return NextResponse.json({ error: error || 'Fundamental data unavailable for this symbol.' }, { status: 502 });
      }

      const ratios = computeFundamentalRatios(snapshot);
      const piotroski = computePiotroskiScore(snapshot);
      const altmanZ = computeAltmanZScore(snapshot);
      const magicFormula = computeMagicFormula(snapshot, ratios.rocePct);
      const grahamNumber = computeGrahamNumber(snapshot);

      data = { snapshot, ratios, piotroski, altmanZ, magicFormula, grahamNumber };
      cache.set(cacheKey, { at: Date.now(), data });
    }

    const scores = computeCompositeScores(data.ratios, data.piotroski, data.altmanZ, technicalTrendScore);
    const recommendation = generateFundamentalRecommendation(scores, data.ratios, data.piotroski, data.altmanZ, technicalTrendScore);

    return NextResponse.json({
      snapshot: data.snapshot,
      ratios: data.ratios,
      piotroski: data.piotroski,
      altmanZ: data.altmanZ,
      magicFormula: data.magicFormula,
      grahamNumber: data.grahamNumber,
      scores,
      recommendation,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected fundamentals error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
