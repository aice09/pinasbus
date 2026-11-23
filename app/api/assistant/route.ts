import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { ask, assistantEnabled } from '@/lib/assistant';
import { allow, clientIp } from '@/lib/ratelimit';

const Body = z.object({ messages: z.array(z.object({ role: z.enum(['user', 'model']), text: z.string().trim().min(1).max(1500) })).min(1).max(20) });

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (origin && origin !== new URL(process.env.PUBLIC_BASE_URL ?? req.nextUrl.origin).origin) return NextResponse.json({ error: 'bad origin' }, { status: 403 });
  if (!assistantEnabled()) return NextResponse.json({ error: 'The assistant is not switched on.' }, { status: 503 });
  if (!allow('ai:' + clientIp(req), 20, 10 * 60_000)) return NextResponse.json({ error: 'You have asked a lot in a short time. Try again in a few minutes.' }, { status: 429 });
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success || p.data.messages.at(-1)!.role !== 'user') return NextResponse.json({ error: 'Ask a question.' }, { status: 400 });
  try {
    return NextResponse.json({ reply: await ask(p.data.messages.slice(-12)) });
  } catch (e) {
    console.error('assistant failed', (e as Error).message);
    return NextResponse.json({ error: 'The assistant is unavailable right now. Try the Help page.' }, { status: 502 });
  }
}
