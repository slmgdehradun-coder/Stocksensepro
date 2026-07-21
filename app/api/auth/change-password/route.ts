import { NextResponse } from 'next/server';
import { authErrorResponse, requireAuth } from '@/lib/server/auth';
import { updateDb } from '@/lib/server/db';
import { hashPassword, verifyPassword } from '@/lib/server/password';
import { checkRateLimit, getClientIp } from '@/lib/server/rateLimit';
import { isStrongEnoughPassword } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request) {
  const rate = checkRateLimit({
    key: `change-password:${getClientIp(request)}`,
    limit: 6,
    windowMs: 10 * 60 * 1000,
  });

  if (!rate.ok) {
    return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
  }

  try {
    const authUser = await requireAuth();
    const body = await request.json();
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const nextPassword = typeof body.nextPassword === 'string' ? body.nextPassword : '';

    if (!isStrongEnoughPassword(nextPassword)) {
      return NextResponse.json({ error: 'New password must be at least 8 characters' }, { status: 400 });
    }

    const updated = await updateDb((db) => {
      const user = db.users.find(item => item.id === authUser.id);
      if (!user) throw new Error('USER_NOT_FOUND');
      if (!verifyPassword(currentPassword, user.passwordHash)) throw new Error('BAD_PASSWORD');

      user.passwordHash = hashPassword(nextPassword);
      user.updatedAt = new Date().toISOString();
      return true;
    });

    return NextResponse.json({ ok: updated });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;

    if (error instanceof Error && error.message === 'BAD_PASSWORD') {
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : 'Password change failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
