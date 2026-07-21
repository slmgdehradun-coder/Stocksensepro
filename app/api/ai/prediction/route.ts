import { NextResponse } from 'next/server';
import { GeminiConfigError, generateGeminiText } from '@/lib/gemini';
import { authErrorResponse, requirePro } from '@/lib/server/auth';
import { updateDb } from '@/lib/server/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function fallbackNarrative(payload: any) {
  const signal = payload?.prediction?.signal || 'Neutral';
  const confidence = payload?.prediction?.confidence || 0;
  const warnings = payload?.metadata?.warnings || [];
  return {
    text: [
      `${signal} educational setup with ${confidence}% model confidence.`,
      `The signal is based on technical indicators, recent candlestick behavior, volume, trend score, and historical pattern outcomes.`,
      `Use position sizing, stop-loss discipline, and independent verification before making any real trade.`,
      warnings.length ? `Data caveat: ${warnings.join(' ')}` : 'Data caveat: provider data can be delayed or revised.',
    ].join('\n\n'),
    model: 'deterministic-fallback',
  };
}

export async function POST(request: Request) {
  let payload: any = {};
  try {
    const user = await requirePro();
    payload = await request.json();
    if (!payload?.symbol || !payload?.prediction) {
      return NextResponse.json({ error: 'Prediction payload is required' }, { status: 400 });
    }

    await updateDb((db) => {
      db.predictionLogs.unshift({
        id: crypto.randomUUID(),
        userId: user.id,
        symbol: String(payload.symbol),
        signal: String(payload.prediction.signal || 'Neutral'),
        confidence: Number(payload.prediction.confidence || 0),
        createdAt: new Date().toISOString(),
      });
      db.predictionLogs = db.predictionLogs.slice(0, 1000);
      return true;
    });

    const result = await generateGeminiText({
      systemInstruction: [
        'You are StockSense Pro, an educational technical-analysis assistant.',
        'Summarize the setup without financial advice, certainty claims, or guaranteed targets.',
        'Base the explanation only on the supplied technical indicators, historical candles, backtest metrics, and data warnings.',
        'Include risk, invalidation, and data-quality caveats.',
      ].join(' '),
      prompt: `Create a concise educational explanation for this setup:\n${JSON.stringify(payload, null, 2)}`,
      temperature: 0.2,
      maxOutputTokens: 700,
    });

    return NextResponse.json(result);
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;

    if (error instanceof GeminiConfigError) {
      return NextResponse.json(fallbackNarrative(payload));
    }

    const message = error instanceof Error ? error.message : 'AI prediction analysis failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
