import { NextResponse } from 'next/server';
import { authErrorResponse, requireAuth } from '@/lib/server/auth';
import { PaymentRequestRecord, readDb, updateDb } from '@/lib/server/db';
import { checkRateLimit, getClientIp } from '@/lib/server/rateLimit';
import { PlanId } from '@/lib/subscription';
import { cleanString, isValidScreenshotReference, parseDateOnly } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    const user = await requireAuth();
    const db = await readDb();
    const requests = db.paymentRequests
      .filter(request => request.userId === user.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return NextResponse.json({ requests });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;

    const message = error instanceof Error ? error.message : 'Payment requests failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const rate = checkRateLimit({
    key: `payment:${getClientIp(request)}`,
    limit: 8,
    windowMs: 15 * 60 * 1000,
  });

  if (!rate.ok) {
    return NextResponse.json({ error: 'Too many payment submissions. Try again later.' }, { status: 429 });
  }

  try {
    const user = await requireAuth();
    const body = await request.json();
    const planId = cleanString(body.planId, 20) as PlanId;
    const utr = cleanString(body.utr, 80);
    const paymentDate = parseDateOnly(body.paymentDate);
    const amount = Number(body.amount);
    const screenshotUrl = typeof body.screenshotUrl === 'string' ? body.screenshotUrl.trim() : '';

    if (!utr || utr.length < 6) {
      return NextResponse.json({ error: 'Valid UTR/transaction ID is required' }, { status: 400 });
    }
    if (!paymentDate) {
      return NextResponse.json({ error: 'Valid payment date is required' }, { status: 400 });
    }
    if (!isValidScreenshotReference(screenshotUrl)) {
      return NextResponse.json({ error: 'Payment screenshot must be an image URL or PNG/JPEG/WebP data URL' }, { status: 400 });
    }

    const created = await updateDb<PaymentRequestRecord>((db) => {
      const plan = db.plans.find(item => item.id === planId && item.enabled);
      if (!plan) throw new Error('PLAN_NOT_FOUND');
      if (Number.isFinite(amount) && amount !== plan.amount) throw new Error('AMOUNT_MISMATCH');

      const timestamp = new Date().toISOString();
      const record: PaymentRequestRecord = {
        id: crypto.randomUUID(),
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        planId: plan.id,
        planName: plan.name,
        amount: plan.amount,
        utr,
        paymentDate,
        screenshotUrl: screenshotUrl || undefined,
        status: 'pending',
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      db.paymentRequests.push(record);
      const dbUser = db.users.find(item => item.id === user.id);
      if (dbUser && !user.isPro) {
        dbUser.status = 'pending';
        dbUser.updatedAt = timestamp;
      }
      return record;
    });

    return NextResponse.json({ request: created }, { status: 201 });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;

    if (error instanceof Error && error.message === 'PLAN_NOT_FOUND') {
      return NextResponse.json({ error: 'Selected plan is not available' }, { status: 400 });
    }
    if (error instanceof Error && error.message === 'AMOUNT_MISMATCH') {
      return NextResponse.json({ error: 'Submitted amount does not match the plan amount' }, { status: 400 });
    }

    const message = error instanceof Error ? error.message : 'Payment request failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
