import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Liveness check for Docker/orchestration platforms. Deliberately does not touch the
 * database or any external API (Yahoo/Gemini) so it stays fast and independent of those
 * services being reachable - it only reports that the Next.js server process is up.
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'stocksense-pro',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
  });
}
