import { NextResponse, type NextRequest } from 'next/server';
import { tripById } from '@/lib/routes';
import { takenSeats } from '@/lib/bookings';

export async function GET(req: NextRequest) {
  const trip = await tripById(req.nextUrl.searchParams.get('trip') ?? '');
  const date = req.nextUrl.searchParams.get('date') ?? '';
  if (!trip || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'trip and date are required' }, { status: 400 });
  return NextResponse.json({ taken: await takenSeats(trip.id, date) }, { headers: { 'cache-control': 'no-store' } });
}
