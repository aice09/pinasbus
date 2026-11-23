import pg from 'pg';
import { seedTrips } from './seed.ts';

// Keep DATE columns as 'YYYY-MM-DD' strings; a JS Date would shift them by the server's timezone.
pg.types.setTypeParser(1082, (v: string) => v);
// numeric -> number (weights, money sums fit easily in a double)
pg.types.setTypeParser(1700, (v: string) => Number(v));
pg.types.setTypeParser(20, (v: string) => Number(v));

const g = globalThis as unknown as { __pool?: pg.Pool; __schema?: Promise<void> };

export function pool() {
  if (!g.__pool) {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');
    g.__pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10, idleTimeoutMillis: 30000 });
  }
  return g.__pool;
}

// Append-only. Each entry runs once, in order, under an advisory lock so two pods starting together don't race.
const MIGRATIONS: string[] = [
  `create table if not exists bookings (
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
  create table if not exists seat_locks (
    trip_id text not null,
    travel_date date not null,
    seat text not null,
    booking_id uuid not null references bookings(id) on delete cascade,
    primary key (trip_id, travel_date, seat)
  );
  create index if not exists seat_locks_booking on seat_locks (booking_id);`,

  `create table users (
    id uuid primary key default gen_random_uuid(),
    email text not null,
    name text not null,
    phone text not null default '',
    password_hash text not null,
    role text not null default 'customer' check (role in ('customer', 'admin')),
    created_at timestamptz not null default now()
  );
  create unique index users_email on users (lower(email));
  create table sessions (
    token_hash text primary key,
    user_id uuid not null references users(id) on delete cascade,
    created_at timestamptz not null default now(),
    expires_at timestamptz not null
  );
  create index sessions_user on sessions (user_id);
  create table passengers (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references users(id) on delete cascade,
    full_name text not null,
    phone text not null default '',
    label text not null default '',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create index passengers_user on passengers (user_id);
  alter table bookings add column user_id uuid references users(id) on delete set null;
  alter table bookings add column passengers jsonb not null default '[]';
  alter table bookings drop constraint if exists bookings_status_check;
  alter table bookings add constraint bookings_status_check check (status in ('pending', 'paid', 'expired', 'needs_refund', 'refunded'));
  create index bookings_user on bookings (user_id, created_at desc);
  create table trips (
    id text primary key,
    code text not null,
    dir text not null check (dir in ('south', 'north')),
    bus_class text not null,
    fare integer not null check (fare > 0),
    pickups jsonb not null,
    dropoffs text[] not null,
    active boolean not null default true,
    updated_at timestamptz not null default now()
  );
  create table settings (key text primary key, value jsonb not null);
  create table shipments (
    id uuid primary key default gen_random_uuid(),
    ref text unique not null,
    user_id uuid references users(id) on delete set null,
    sender_name text not null,
    sender_phone text not null,
    sender_email text not null,
    recipient_name text not null,
    recipient_phone text not null,
    origin text not null,
    destination text not null,
    description text not null,
    weight_kg numeric(6,2) not null,
    declared_value_centavos integer not null,
    fee_centavos integer not null,
    status text not null default 'pending_payment'
      check (status in ('pending_payment', 'paid', 'received', 'in_transit', 'arrived', 'claimed', 'cancelled')),
    checkout_id text unique,
    payment_id text,
    created_at timestamptz not null default now(),
    paid_at timestamptz
  );
  create index shipments_user on shipments (user_id, created_at desc);
  create table shipment_events (
    id bigserial primary key,
    shipment_id uuid not null references shipments(id) on delete cascade,
    status text not null,
    note text not null default '',
    created_at timestamptz not null default now()
  );
  create table messages (
    id bigserial primary key,
    name text not null,
    email text not null,
    subject text not null,
    body text not null,
    handled boolean not null default false,
    created_at timestamptz not null default now()
  );`,
];

async function migrate() {
  const c = await pool().connect();
  try {
    await c.query('begin');
    await c.query('select pg_advisory_xact_lock(727274)');
    await c.query('create table if not exists schema_migrations (id integer primary key, applied_at timestamptz not null default now())');
    const { rows } = await c.query<{ id: number }>('select id from schema_migrations');
    const done = new Set(rows.map((r) => r.id));
    for (let i = 0; i < MIGRATIONS.length; i++) {
      if (done.has(i + 1)) continue;
      await c.query(MIGRATIONS[i]);
      await c.query('insert into schema_migrations (id) values ($1)', [i + 1]);
    }
    const { rows: n } = await c.query<{ n: number }>('select count(*)::int n from trips');
    if (n[0].n === 0) {
      for (const t of seedTrips()) {
        await c.query('insert into trips (id, code, dir, bus_class, fare, pickups, dropoffs) values ($1,$2,$3,$4,$5,$6,$7)',
          [t.id, t.code, t.dir, t.busClass, t.fare, JSON.stringify(t.pickups), t.dropoffs]);
      }
    }
    await c.query('commit');
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

export function ready() {
  g.__schema ??= migrate().catch((e) => { g.__schema = undefined; throw e; });
  return g.__schema;
}

export async function q<T extends pg.QueryResultRow>(sql: string, params: unknown[] = []) {
  await ready();
  return (await pool().query<T>(sql, params)).rows;
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
