import { NextResponse } from 'next/server';
import { authErrorResponse, requireAdmin } from '@/lib/server/auth';
import { readDb } from '@/lib/server/db';
import { PaymentStatus } from '@/lib/subscription';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const STATUS_FILTERS: PaymentStatus[] = ['pending', 'approved', 'rejected'];

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') as PaymentStatus | null;
    const query = (searchParams.get('q') || '').trim().toLowerCase();
    const db = await readDb();

    const requests = db.paymentRequests
      .filter((payment) => {
        if (status && STATUS_FILTERS.includes(status) && payment.status !== status) return false;
        if (!query) return true;
        return [payment.userName, payment.userEmail, payment.utr].some(value => value.toLowerCase().includes(query));
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return NextResponse.json({ requests });
  } catch (error) {
    const authResponse = authErrorResponse(error);
    if (authResponse) return authResponse;

    const message = error instanceof Error ? error.message : 'Admin payment requests failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
