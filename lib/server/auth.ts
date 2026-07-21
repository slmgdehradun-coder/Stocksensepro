import crypto from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getEffectiveAccess, SubscriptionStatus } from '@/lib/subscription';
import { readDb, UserRecord } from '@/lib/server/db';

const SESSION_COOKIE = 'stocksense_session';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const DEV_AUTH_SECRET = 'stocksense-local-dev-secret-change-before-production';

export interface AuthUser {
  id: string;
  name: string;
  mobile: string;
  email: string;
  role: 'admin' | 'user';
  status: SubscriptionStatus;
  effectiveStatus: SubscriptionStatus;
  isPro: boolean;
  remainingProDays: number;
  proStartDate?: string;
  proEndDate?: string;
  proActiveDates: string[];
  disclaimerAcceptedAt?: string;
  createdAt: string;
}

interface SessionClaims {
  userId: string;
  email: string;
  role: 'admin' | 'user';
  iat: number;
  exp: number;
}

export class AuthError extends Error {
  status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

function getSecret() {
  return process.env.AUTH_SECRET || DEV_AUTH_SECRET;
}

function signPayload(payload: string) {
  return crypto.createHmac('sha256', getSecret()).update(payload).digest('base64url');
}

function encodeClaims(claims: SessionClaims) {
  return Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
}

function decodeClaims(encoded: string): SessionClaims | null {
  try {
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SessionClaims;
  } catch {
    return null;
  }
}

export function createSessionToken(user: Pick<UserRecord, 'id' | 'email' | 'role'>) {
  const now = Math.floor(Date.now() / 1000);
  const payload = encodeClaims({
    userId: user.id,
    email: user.email,
    role: user.role,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  });
  return `${payload}.${signPayload(payload)}`;
}

export function verifySessionToken(token: string): SessionClaims | null {
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;

  const expected = signPayload(payload);
  const expectedBuffer = Buffer.from(expected, 'base64url');
  const signatureBuffer = Buffer.from(signature, 'base64url');

  if (expectedBuffer.length !== signatureBuffer.length) return null;
  if (!crypto.timingSafeEqual(expectedBuffer, signatureBuffer)) return null;

  const claims = decodeClaims(payload);
  if (!claims || claims.exp < Math.floor(Date.now() / 1000)) return null;
  return claims;
}

export function toAuthUser(user: UserRecord): AuthUser {
  const access = getEffectiveAccess(user);
  return {
    id: user.id,
    name: user.name,
    mobile: user.mobile,
    email: user.email,
    role: user.role,
    status: user.status,
    effectiveStatus: access.status,
    isPro: access.isPro,
    remainingProDays: access.remainingDays,
    proStartDate: user.proStartDate,
    proEndDate: user.proEndDate,
    proActiveDates: user.proActiveDates || [],
    disclaimerAcceptedAt: user.disclaimerAcceptedAt,
    createdAt: user.createdAt,
  };
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const claims = verifySessionToken(token);
  if (!claims) return null;

  const db = await readDb();
  const user = db.users.find(item => item.id === claims.userId)
    || db.users.find(item => item.email.toLowerCase() === claims.email.toLowerCase());
  if (!user) return null;

  return toAuthUser(user);
}

export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) throw new AuthError('Login required', 401);
  if (user.effectiveStatus === 'blocked') throw new AuthError('Your account is blocked. Contact admin.', 403);
  return user;
}

export async function requireAdmin() {
  const user = await requireAuth();
  if (user.role !== 'admin') throw new AuthError('Admin access required', 403);
  return user;
}

export async function requirePro() {
  const user = await requireAuth();
  if (!user.isPro) {
    throw new AuthError('Active Pro subscription required', 402);
  }
  return user;
}

export function setSessionCookie(response: NextResponse, token: string) {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(Date.now() + SESSION_TTL_SECONDS * 1000),
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set({
    name: SESSION_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}

export function authErrorResponse(error: unknown) {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return null;
}
