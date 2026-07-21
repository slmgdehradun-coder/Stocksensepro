import { NextResponse } from 'next/server';
import { GeminiConfigError, generateGeminiText } from '@/lib/gemini';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const message = String(body?.message || '').trim();
    const context = String(body?.context || '').slice(0, 4000);

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    const result = await generateGeminiText({
      systemInstruction: [
        'You are StockSense Pro, an educational market analytics assistant.',
        'Do not provide personalized financial advice or guaranteed predictions.',
        'Explain technical evidence, risk, uncertainty, and invalidation levels in concise language.',
        'If data is estimated, stale, simulated, or incomplete, say so clearly.',
      ].join(' '),
      prompt: `Context:\n${context || 'No active symbol context.'}\n\nUser question:\n${message}`,
      temperature: 0.35,
      maxOutputTokens: 700,
    });

    return NextResponse.json(result);
  } catch (error) {
    const status = error instanceof GeminiConfigError ? 503 : 500;
    const message = error instanceof Error ? error.message : 'AI chat failed';
    return NextResponse.json({ error: message }, { status });
  }
}
