import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/server/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST() {
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
