import { NextResponse } from 'next/server';
import { authErrorResponse, requireAdmin } from '@/lib/server/auth';
import { updateDb } from '@/lib/server/db';
import { addDays, dateToYmd, getEffectiveAccess } from '@/lib/subscription';
import { cleanString } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await context.params;
    const body = await request.json();
    const action = cleanString(body.action, 20);
    const remarks = cleanString(body.remarks, 500);

    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Action must be approve or reject' }, { status: 400 });
    }

    const updated = await updateDb((db) => {
      const payment = db.paymentRequests.find(item => item.id === id);
      if (!payment) return null;
      if (payment.status !== 'pending') throw new Error('ALREADY_REVIEWED');

      const user = db.users.find(item => item.id === payment.userId);
      if (!user) throw new Error('USER_NOT_FOUND');

      const timestamp = new Date().toISOString();
      payment.remarks = remarks;
      payment.reviewedAt = timestamp;
      payment.reviewedBy = admin.email;
      payment.updatedAt = timestamp;

      if (action === 'approve') {
        const plan = db.plans.find(item => item.id === payment.planId);
        if (!plan) throw new Error('PLAN_NOT_FOUND');

        const today = dateToYmd();
        const access = getEffectiveAccess(user);
        const startDate = access.isPro && user.proEndDate && user.proEndDate >= today
          ? addDays(user.proEndDate, 1)
          : today;
        const endDate = addDays(startDate, Math.max(0, plan.durationDays - 1));

        payment.status = 'approved';
        user.status = 'pro';
        user.proStartDate = startDate;
        user.proEndDate = endDate;
        user.updatedAt = timestamp;
      } else {
        payment.status = 'rejected';
        if (user.status === 'pending') {
          user.status = 'free';
          user.updatedAt = timestamp;
        }
      }

      return payment;
    });

    if (!updated) return NextResponse.json({ error: 'Payment request not found' }, { status: 404 });
    return NextResponse.json({ request: updated });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;

    const messageMap: Record<string, string> = {
      ALREADY_REVIEWED: 'Payment request has already been reviewed',
      USER_NOT_FOUND: 'Payment user was not found',
      PLAN_NOT_FOUND: 'Payment plan was not found',
    };
    if (error instanceof Error && messageMap[error.message]) {
      return NextResponse.json({ error: messageMap[error.message] }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : 'Payment review failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
