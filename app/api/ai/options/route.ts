import { NextResponse } from 'next/server';
import { GeminiConfigError, generateGeminiText } from '@/lib/gemini';
import { authErrorResponse, requirePro } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  try {
    await requirePro();
    const data = await request.json();
    if (!data?.symbol || typeof data?.currentPrice !== 'number') {
      return NextResponse.json({ error: 'Options data is required' }, { status: 400 });
    }

    const result = await generateGeminiText({
      systemInstruction: [
        'You are an educational Indian options analytics assistant.',
        'Never present simulated data as live exchange data.',
        'Discuss CE/PE open interest, PCR, max pain, support/resistance, implied volatility, and risk controls.',
        'Avoid personalized financial advice. Keep the answer practical, risk-aware, and clearly caveated.',
      ].join(' '),
      prompt: `Analyze this options-chain snapshot for educational purposes only:\n${JSON.stringify(data, null, 2)}`,
      temperature: 0.25,
      maxOutputTokens: 900,
    });

    return NextResponse.json(result);
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;

    const status = error instanceof GeminiConfigError ? 503 : 500;
    const message = error instanceof Error ? error.message : 'AI options analysis failed';
    return NextResponse.json({ error: message }, { status });
  }
}
