import { NextResponse } from 'next/server';
import { createSessionToken, setSessionCookie, toAuthUser } from '@/lib/server/auth';
import { updateDb, UserRecord } from '@/lib/server/db';
import { checkRateLimit, getClientIp } from '@/lib/server/rateLimit';
import { cleanString, normalizeEmail } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface GoogleTokenInfo {
  sub?: string;
  email?: string;
  email_verified?: string | boolean;
  name?: string;
  aud?: string;
}

async function verifyGoogleCredential(credential: string): Promise<GoogleTokenInfo> {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    throw new Error('GOOGLE_NOT_CONFIGURED');
  }

  const response = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  });
  const payload = await response.json().catch(() => null) as GoogleTokenInfo | null;

  if (!response.ok || !payload?.sub || !payload.email) {
    throw new Error('GOOGLE_TOKEN_INVALID');
  }
  if (payload.aud !== clientId) {
    throw new Error('GOOGLE_AUDIENCE_MISMATCH');
  }
  if (payload.email_verified !== true && payload.email_verified !== 'true') {
    throw new Error('GOOGLE_EMAIL_NOT_VERIFIED');
  }

  return payload;
}

export async function POST(request: Request) {
  const rate = checkRateLimit({
    key: `google-login:${getClientIp(request)}`,
    limit: 20,
    windowMs: 10 * 60 * 1000,
  });

  if (!rate.ok) {
    return NextResponse.json({ error: 'Too many Google login attempts. Try again later.' }, { status: 429 });
  }

  try {
    const body = await request.json();
    const credential = typeof body.credential === 'string' ? body.credential : '';
    const acceptedDisclaimer = body.acceptedDisclaimer === true;
    if (!credential) {
      return NextResponse.json({ error: 'Google credential is required' }, { status: 400 });
    }

    const googleUser = await verifyGoogleCredential(credential);
    const email = normalizeEmail(googleUser.email);
    const timestamp = new Date().toISOString();

    const user = await updateDb<UserRecord>((db) => {
      const existing = db.users.find(item => item.email.toLowerCase() === email || item.googleSub === googleUser.sub);
      if (existing) {
        existing.googleSub = googleUser.sub;
        existing.authProvider = existing.authProvider || 'google';
        existing.updatedAt = timestamp;
        return existing;
      }

      if (!acceptedDisclaimer) {
        throw new Error('DISCLAIMER_REQUIRED');
      }

      const record: UserRecord = {
        id: crypto.randomUUID(),
        name: cleanString(googleUser.name, 80) || email.split('@')[0],
        mobile: '',
        email,
        passwordHash: `google:${googleUser.sub}`,
        role: 'user',
        status: 'free',
        proActiveDates: [],
        googleSub: googleUser.sub,
        authProvider: 'google',
        disclaimerAcceptedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      db.users.push(record);
      return record;
    });

    if (user.status === 'blocked') {
      return NextResponse.json({ error: 'Your account is blocked. Contact admin.' }, { status: 403 });
    }

    const response = NextResponse.json({ user: toAuthUser(user) });
    setSessionCookie(response, createSessionToken(user));
    return response;
  } catch (error) {
    const messages: Record<string, string> = {
      GOOGLE_NOT_CONFIGURED: 'Google Sign-In is not configured. Add NEXT_PUBLIC_GOOGLE_CLIENT_ID in environment variables.',
      GOOGLE_TOKEN_INVALID: 'Google sign-in token is invalid.',
      GOOGLE_AUDIENCE_MISMATCH: 'Google client ID does not match this app.',
      GOOGLE_EMAIL_NOT_VERIFIED: 'Google email is not verified.',
      DISCLAIMER_REQUIRED: 'Accept the disclaimer before creating a Google account.',
    };

    if (error instanceof Error && messages[error.message]) {
      return NextResponse.json({ error: messages[error.message] }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : 'Google sign-in failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
