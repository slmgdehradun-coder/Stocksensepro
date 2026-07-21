import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const user = await getCurrentUser();
  return NextResponse.json({ user }, { headers: { 'Cache-Control': 'no-store' } });
}
