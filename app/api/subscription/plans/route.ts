import { NextResponse } from 'next/server';
import { readDb, publicPlan } from '@/lib/server/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  const db = await readDb();
  return NextResponse.json({
    plans: db.plans.filter(plan => plan.enabled).map(publicPlan),
    settings: {
      upiId: db.settings.upiId,
      qrImageUrl: db.settings.qrImageUrl,
      paymentInstructions: db.settings.paymentInstructions,
    },
  });
}
