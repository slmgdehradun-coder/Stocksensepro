import { NextResponse } from 'next/server';
import { authErrorResponse, requireAdmin, toAuthUser } from '@/lib/server/auth';
import { readDb, updateDb, UserRecord } from '@/lib/server/db';
import { hashPassword } from '@/lib/server/password';
import { SubscriptionStatus } from '@/lib/subscription';
import { cleanString, isStrongEnoughPassword, isValidEmail, isValidMobile, normalizeEmail, normalizeMobile, parseDateList, parseDateOnly } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ALLOWED_CREATE_STATUSES: SubscriptionStatus[] = ['free', 'pending', 'pro', 'expired', 'blocked'];

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const query = (searchParams.get('q') || '').trim().toLowerCase();
    const db = await readDb();
    const users = db.users
      .filter((user) => {
        if (!query) return true;
        return [user.name, user.mobile, user.email].some(value => value.toLowerCase().includes(query));
      })
      .map(user => ({
        ...toAuthUser(user),
        blockedAt: user.blockedAt,
        updatedAt: user.updatedAt,
        paymentRequests: db.paymentRequests.filter(payment => payment.userId === user.id).length,
      }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return NextResponse.json({ users }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;

    const message = error instanceof Error ? error.message : 'Admin users failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body = await request.json();
    const name = cleanString(body.name, 80);
    const mobile = normalizeMobile(body.mobile);
    const email = normalizeEmail(body.email);
    const password = typeof body.password === 'string' ? body.password : '';
    const status = ALLOWED_CREATE_STATUSES.includes(body.status as SubscriptionStatus)
      ? body.status as SubscriptionStatus
      : 'free';
    const proStartDate = body.proStartDate === '' || body.proStartDate === undefined ? undefined : parseDateOnly(body.proStartDate);
    const proEndDate = body.proEndDate === '' || body.proEndDate === undefined ? undefined : parseDateOnly(body.proEndDate);
    const proActiveDates = parseDateList(body.proActiveDates);

    if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    if (!isValidMobile(mobile)) return NextResponse.json({ error: 'Valid mobile number is required' }, { status: 400 });
    if (!isValidEmail(email)) return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    if (!isStrongEnoughPassword(password)) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }
    if (body.proStartDate && !proStartDate) return NextResponse.json({ error: 'Valid Pro start date is required' }, { status: 400 });
    if (body.proEndDate && !proEndDate) return NextResponse.json({ error: 'Valid Pro end date is required' }, { status: 400 });

    const timestamp = new Date().toISOString();
    const created = await updateDb<UserRecord>((db) => {
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
        status,
        proStartDate,
        proEndDate,
        proActiveDates,
        blockedAt: status === 'blocked' ? timestamp : undefined,
        authProvider: 'password',
        disclaimerAcceptedAt: timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      db.users.push(record);
      return record;
    });

    return NextResponse.json({ user: toAuthUser(created) }, { status: 201 });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;

    if (error instanceof Error && error.message === 'EMAIL_EXISTS') {
      return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 });
    }

    const message = error instanceof Error ? error.message : 'User creation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
