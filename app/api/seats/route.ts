import { NextResponse, type NextRequest } from 'next/server';
import { availability, tripById } from '@/lib/trips';

export async function GET(req: NextRequest) {
  const trip = await tripById(req.nextUrl.searchParams.get('trip') ?? '');
  if (!trip) return NextResponse.json({ error: 'unknown trip' }, { status: 404 });
  const { taken, released } = await availability(trip);
  return NextResponse.json({ taken, released }, { headers: { 'cache-control': 'no-store' } });
}
