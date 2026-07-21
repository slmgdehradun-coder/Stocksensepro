import { NextResponse } from 'next/server';
import { createSessionToken, setSessionCookie, toAuthUser } from '@/lib/server/auth';
import { updateDb, UserRecord } from '@/lib/server/db';
import { hashPassword } from '@/lib/server/password';
import { checkRateLimit, getClientIp } from '@/lib/server/rateLimit';
import { cleanString, isStrongEnoughPassword, isValidEmail, isValidMobile, normalizeEmail, normalizeMobile } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const rate = checkRateLimit({
    key: `signup:${getClientIp(request)}`,
    limit: 8,
    windowMs: 10 * 60 * 1000,
  });

  if (!rate.ok) {
    return NextResponse.json(
      { error: `Too many signup attempts. Try again in ${rate.retryAfter} seconds.` },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfter) } },
    );
  }

  try {
    const body = await request.json();
    const name = cleanString(body.name, 80);
    const mobile = normalizeMobile(body.mobile);
    const email = normalizeEmail(body.email);
    const password = typeof body.password === 'string' ? body.password : '';
    const acceptedDisclaimer = body.acceptedDisclaimer === true;

    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    if (!isValidMobile(mobile)) return NextResponse.json({ error: 'Valid mobile number is required' }, { status: 400 });
    if (!isValidEmail(email)) return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    if (!isStrongEnoughPassword(password)) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }
    if (!acceptedDisclaimer) {
      return NextResponse.json({ error: 'Disclaimer acceptance is required' }, { status: 400 });
    }

    const timestamp = new Date().toISOString();
    const user = await updateDb<UserRecord>((db) => {
      if (db.users.some(item => item.email.toLowerCase() === email)) {
        throw new Error('EMAIL_EXISTS');
      }

      const record: UserRecord = {
        id: crypto.randomUUID(),
        name,
        mobile,
        email,
        passwordHash: hashPassword(password),
        role: 'user',
        status: 'free',
        proActiveDates: [],
        authProvider: 'password',
        disclaimerAcceptedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      db.users.push(record);
      return record;
    });

    const response = NextResponse.json({ user: toAuthUser(user) });
    setSessionCookie(response, createSessionToken(user));
    return response;
  } catch (error) {
    if (error instanceof Error && error.message === 'EMAIL_EXISTS') {
      return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 });
    }

    const message = error instanceof Error ? error.message : 'Signup failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
