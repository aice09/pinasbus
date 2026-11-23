import pg from 'pg';

// Keep DATE columns as 'YYYY-MM-DD' strings; a JS Date would shift them by the server's timezone.
pg.types.setTypeParser(1082, (v: string) => v);

const g = globalThis as unknown as { __pool?: pg.Pool; __schema?: Promise<void> };

export function pool() {
  if (!g.__pool) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
    g.__pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10, idleTimeoutMillis: 30000 });
  }
  return g.__pool;
}

const SCHEMA = `
create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  ref text unique not null,
  trip_id text not null,
  travel_date date not null,
  pickup text not null,
  dropoff text not null,
  seats text[] not null,
  name text not null,
  email text not null,
  phone text not null,
  fare_centavos integer not null,
  fee_centavos integer not null,
  total_centavos integer not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'expired', 'needs_refund')),
  checkout_id text unique,
  payment_id text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  paid_at timestamptz
);
create index if not exists bookings_pending on bookings (expires_at) where status = 'pending';
-- One row per occupied seat; the primary key is what stops double booking.
create table if not exists seat_locks (
  trip_id text not null,
  travel_date date not null,
  seat text not null,
  booking_id uuid not null references bookings(id) on delete cascade,
  primary key (trip_id, travel_date, seat)
);
create index if not exists seat_locks_booking on seat_locks (booking_id);
`;

export function ready() {
  g.__schema ??= pool().query(SCHEMA).then(() => undefined).catch((e) => { g.__schema = undefined; throw e; });
  return g.__schema;
}

export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  await ready();
  const c = await pool().connect();
  try {
    await c.query('begin');
    const out = await fn(c);
    await c.query('commit');
    return out;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
