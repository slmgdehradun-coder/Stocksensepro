import { NextResponse } from 'next/server';
import { authErrorResponse, requireAdmin } from '@/lib/server/auth';
import { readDb, updateDb } from '@/lib/server/db';
import { SubscriptionPlan } from '@/lib/subscription';
import { cleanString } from '@/lib/server/validation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    await requireAdmin();
    const db = await readDb();
    return NextResponse.json({ settings: db.settings, plans: db.plans });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;

    const message = error instanceof Error ? error.message : 'Admin settings failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    await requireAdmin();
    const body = await request.json();

    const result = await updateDb((db) => {
      const timestamp = new Date().toISOString();

      if (typeof body.upiId === 'string') db.settings.upiId = cleanString(body.upiId, 120);
      if (typeof body.qrImageUrl === 'string') db.settings.qrImageUrl = cleanString(body.qrImageUrl, 1000);
      if (typeof body.paymentInstructions === 'string') {
        db.settings.paymentInstructions = cleanString(body.paymentInstructions, 1000);
      }
      db.settings.updatedAt = timestamp;

      if (Array.isArray(body.plans)) {
        const nextPlans = body.plans as Partial<SubscriptionPlan>[];
        db.plans = db.plans.map((plan) => {
          const incoming = nextPlans.find(item => item.id === plan.id);
          if (!incoming) return plan;

          const amount = Number(incoming.amount);
          const durationDays = Number(incoming.durationDays);
          return {
            ...plan,
            name: typeof incoming.name === 'string' ? cleanString(incoming.name, 80) || plan.name : plan.name,
            amount: Number.isFinite(amount) && amount > 0 ? Math.round(amount) : plan.amount,
            durationDays: Number.isFinite(durationDays) && durationDays > 0 ? Math.round(durationDays) : plan.durationDays,
            enabled: typeof incoming.enabled === 'boolean' ? incoming.enabled : plan.enabled,
          };
        });
      }

      return { settings: db.settings, plans: db.plans };
    });

    return NextResponse.json(result);
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;

    const message = error instanceof Error ? error.message : 'Admin settings update failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
