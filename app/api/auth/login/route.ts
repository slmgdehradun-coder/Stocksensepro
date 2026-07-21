import { NextResponse } from 'next/server';
import { createSessionToken, setSessionCookie, toAuthUser } from '@/lib/server/auth';
import { readDb } from '@/lib/server/db';
import { verifyPassword } from '@/lib/server/password';
import { checkRateLimit, getClientIp } from '@/lib/server/rateLimit';
import { isValidEmail, normalizeEmail } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const rate = checkRateLimit({
    key: `login:${getClientIp(request)}`,
    limit: 10,
    windowMs: 10 * 60 * 1000,
  });

  if (!rate.ok) {
    return NextResponse.json(
      { error: `Too many login attempts. Try again in ${rate.retryAfter} seconds.` },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfter) } },
    );
  }

  try {
    const body = await request.json();
    const email = normalizeEmail(body.email);
    const password = typeof body.password === 'string' ? body.password : '';

    if (!isValidEmail(email) || !password) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    const db = await readDb();
    const user = db.users.find(item => item.email.toLowerCase() === email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    if (user.status === 'blocked') {
      return NextResponse.json({ error: 'Your account is blocked. Contact admin.' }, { status: 403 });
    }

    const response = NextResponse.json({ user: toAuthUser(user) });
    setSessionCookie(response, createSessionToken(user));
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Login failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
