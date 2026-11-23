// Background jobs, started once per server process (instrumentation.ts). Each job takes a Postgres advisory lock,
// so with several pods only one runs it at a time.
import { pool } from './db.ts';
import { releaseExpired } from './bookings.ts';
import { flushOutbox, notify } from './notify.ts';

type Job = { name: string; everyMs: number; run: () => Promise<unknown> };

async function tripReminders() {
  const { rows } = await pool().query<{ id: string; ref: string; user_id: string | null; email: string; pickup: string; dropoff: string; departs_at: Date }>(
    `update bookings b set reminded_at = now() from trips t
      where t.id = b.trip_uuid and b.status = 'paid' and b.reminded_at is null
        and t.departs_at between now() + interval '20 hours' and now() + interval '28 hours'
      returning b.id, b.ref, b.user_id, b.email, b.pickup, b.dropoff, t.departs_at`);
  for (const b of rows) {
    const when = b.departs_at.toLocaleString('en-PH', { timeZone: 'Asia/Manila', weekday: 'short', hour: 'numeric', minute: '2-digit' });
    await notify({ userIds: [b.user_id], emails: [b.email] }, { kind: 'trip.reminder', title: `Tomorrow: ${b.pickup} to ${b.dropoff}`, body: `Your bus leaves ${when}. Be at ${b.pickup} 30 minutes early with a valid ID. Ticket ${b.ref}.`, link: `/booking/${b.ref}` });
  }
}

const JOBS: Job[] = [
  { name: 'outbox', everyMs: 20_000, run: flushOutbox },
  { name: 'expire-holds', everyMs: 60_000, run: releaseExpired },
  { name: 'trip-reminders', everyMs: 5 * 60_000, run: tripReminders },
];

const g = globalThis as unknown as { __jobs?: boolean };

export function startJobs() {
  if (g.__jobs || !process.env.DATABASE_URL || process.env.JOBS === 'off') return;
  g.__jobs = true;
  JOBS.forEach((job, i) => {
    const tick = async () => {
      const c = await pool().connect().catch(() => null);
      if (!c) return;
      try {
        const { rows } = await c.query<{ ok: boolean }>('select pg_try_advisory_lock(727300, $1) ok', [i]);
        if (!rows[0].ok) return;
        try { await job.run(); } finally { await c.query('select pg_advisory_unlock(727300, $1)', [i]); }
        await c.query('insert into job_runs (name, last_run) values ($1, now()) on conflict (name) do update set last_run = now()', [job.name]);
      } catch (e) {
        console.error('job failed', job.name, (e as Error).message);
      } finally {
        c.release();
      }
    };
    setTimeout(() => { void tick(); setInterval(tick, job.everyMs).unref(); }, 5_000 + i * 1_000).unref();
  });
}
