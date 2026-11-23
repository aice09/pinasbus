import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { metrics } from '@/lib/metrics';

export const dynamic = 'force-dynamic';

// Scraped by Prometheus with a bearer token (ServiceMonitor). Without METRICS_TOKEN the endpoint is closed.
export async function GET(req: NextRequest) {
  const want = process.env.METRICS_TOKEN ?? '';
  const got = req.headers.get('authorization')?.replace(/^Bearer /, '') ?? '';
  if (!want || got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) return new NextResponse(null, { status: 404 });
  const { registry } = metrics();
  return new NextResponse(await registry.metrics(), { headers: { 'content-type': registry.contentType, 'cache-control': 'no-store' } });
}
