import { NextResponse } from 'next/server';
import { authErrorResponse, requireAdmin, toAuthUser } from '@/lib/server/auth';
import { updateDb } from '@/lib/server/db';
import { SubscriptionStatus } from '@/lib/subscription';
import { cleanString, isValidMobile, normalizeMobile, parseDateList, parseDateOnly } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const ALLOWED_STATUSES: SubscriptionStatus[] = ['free', 'pro', 'pending', 'expired', 'blocked'];

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await context.params;
    const body = await request.json();

    const updated = await updateDb((db) => {
      const user = db.users.find(item => item.id === id);
      if (!user) return null;

      const timestamp = new Date().toISOString();

      if (typeof body.name === 'string') {
        const name = cleanString(body.name, 80);
        if (name) user.name = name;
      }

      if (typeof body.mobile === 'string') {
        const mobile = normalizeMobile(body.mobile);
        if (!isValidMobile(mobile)) throw new Error('BAD_MOBILE');
        user.mobile = mobile;
      }

      if (typeof body.blocked === 'boolean') {
        if (body.blocked) {
          if (user.id === admin.id) throw new Error('CANNOT_BLOCK_SELF');
          user.status = 'blocked';
          user.blockedAt = timestamp;
        } else if (user.status === 'blocked') {
          user.status = 'free';
          user.blockedAt = undefined;
        }
      }

      if (typeof body.status === 'string' && ALLOWED_STATUSES.includes(body.status as SubscriptionStatus)) {
        if (body.status === 'blocked' && user.id === admin.id) throw new Error('CANNOT_BLOCK_SELF');
        user.status = body.status as SubscriptionStatus;
        user.blockedAt = body.status === 'blocked' ? timestamp : undefined;
      }

      if (body.proStartDate === '') {
        user.proStartDate = undefined;
      } else if (typeof body.proStartDate === 'string') {
        const startDate = parseDateOnly(body.proStartDate);
        if (!startDate) throw new Error('BAD_START_DATE');
        user.proStartDate = startDate;
      }

      if (body.proEndDate === '') {
        user.proEndDate = undefined;
      } else if (typeof body.proEndDate === 'string') {
        const endDate = parseDateOnly(body.proEndDate);
        if (!endDate) throw new Error('BAD_END_DATE');
        user.proEndDate = endDate;
      }

      if (Array.isArray(body.proActiveDates)) {
        user.proActiveDates = parseDateList(body.proActiveDates);
      }

      user.updatedAt = timestamp;
      return toAuthUser(user);
    });

    if (!updated) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    return NextResponse.json({ user: updated });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;

    const messageMap: Record<string, string> = {
      BAD_MOBILE: 'Valid mobile number is required',
      BAD_START_DATE: 'Valid Pro start date is required',
      BAD_END_DATE: 'Valid Pro end date is required',
      CANNOT_BLOCK_SELF: 'Admin cannot block their own account',
    };
    if (error instanceof Error && messageMap[error.message]) {
      return NextResponse.json({ error: messageMap[error.message] }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : 'User update failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
