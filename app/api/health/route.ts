import { NextResponse } from 'next/server';
import { pool, ready } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await ready();
    await pool().query('select 1');
    return NextResponse.json({ status: 'ok' });
  } catch {
    return NextResponse.json({ status: 'db unavailable' }, { status: 503 });
  }
}
