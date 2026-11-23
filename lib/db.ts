import pg from 'pg';
import { seedDemo } from './demo.ts';

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
  `alter table trips rename to legacy_trips;
  create table organizations (
    id uuid primary key default gen_random_uuid(),
    kind text not null check (kind in ('platform', 'bus_operator', 'card_issuer', 'shipping_operator')),
    name text not null,
    slug text unique not null check (slug ~ '^[a-z0-9-]{2,40}$'),
    status text not null default 'active' check (status in ('pending', 'active', 'suspended')),
    contact_email text not null default '',
    contact_phone text not null default '',
    address text not null default '',
    settings jsonb not null default '{}',
    is_demo boolean not null default false,
    data_sources jsonb not null default '[]',
    created_at timestamptz not null default now()
  );
  create table memberships (
    user_id uuid not null references users(id) on delete cascade,
    org_id uuid not null references organizations(id) on delete cascade,
    role text not null,
    created_at timestamptz not null default now(),
    primary key (user_id, org_id)
  );
  create index memberships_org on memberships (org_id);
  alter table users add column platform_role text not null default 'none' check (platform_role in ('none', 'platform_admin'));
  alter table users add column passenger_category text not null default 'regular' check (passenger_category in ('regular', 'senior', 'pwd', 'student', 'child'));
  alter table users add column id_type text not null default '';
  alter table users add column id_last4 text not null default '';
  alter table users add column must_change_password boolean not null default false;
  alter table users add column disabled boolean not null default false;
  update users set platform_role = 'platform_admin' where role = 'admin';
  alter table passengers add column category text not null default 'regular' check (category in ('regular', 'senior', 'pwd', 'student', 'child'));
  alter table passengers add column id_type text not null default '';
  alter table passengers add column id_last4 text not null default '';
  create table categories (
    id text primary key check (id ~ '^[a-z0-9-]{2,40}$'),
    name text not null,
    description text not null default '',
    rules jsonb not null default '{}',
    sort integer not null default 100,
    active boolean not null default true
  );
  create table amenities (
    id uuid primary key default gen_random_uuid(),
    org_id uuid references organizations(id) on delete cascade,
    name text not null,
    unique nulls not distinct (org_id, name)
  );
  create table stations (
    id uuid primary key default gen_random_uuid(),
    name text not null unique,
    city text not null default '',
    province text not null default '',
    kind text not null default 'terminal' check (kind in ('terminal', 'stop', 'port', 'toll_plaza', 'rest_stop', 'expressway_exit')),
    address text not null default '',
    lat double precision,
    lng double precision,
    source_url text not null default '',
    verified_at date
  );
  create table seat_layouts (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references organizations(id) on delete cascade,
    name text not null,
    seats jsonb not null,
    updated_at timestamptz not null default now(),
    unique (org_id, name)
  );
  create table buses (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references organizations(id) on delete cascade,
    code text not null,
    plate text not null default '',
    make text not null default '',
    model text not null default '',
    year integer,
    color text not null default '',
    category_id text references categories(id),
    class_name text not null default '',
    layout_id uuid references seat_layouts(id),
    decks integer not null default 1,
    length_m numeric(5,2), width_m numeric(5,2), height_m numeric(5,2),
    max_passengers integer,
    max_baggage_kg integer,
    max_bag_kg integer not null default 20,
    status text not null default 'active' check (status in ('active', 'maintenance', 'retired')),
    registration_expiry date,
    inspection_status text not null default '',
    amenity_ids uuid[] not null default '{}',
    created_at timestamptz not null default now(),
    unique (org_id, code)
  );
  create table routes (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references organizations(id) on delete cascade,
    code text not null,
    name text not null,
    category_id text references categories(id),
    stops jsonb not null,
    itinerary jsonb not null default '[]',
    mode text not null default 'road' check (mode in ('road', 'road_ferry')),
    active boolean not null default true,
    data_sources jsonb not null default '[]',
    created_at timestamptz not null default now(),
    unique (org_id, code)
  );
  create table schedules (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references organizations(id) on delete cascade,
    route_id uuid not null references routes(id) on delete cascade,
    code text not null,
    departure time not null,
    days integer[] not null default '{0,1,2,3,4,5,6}',
    valid_from date not null default current_date,
    valid_to date,
    bus_id uuid references buses(id) on delete set null,
    layout_id uuid not null references seat_layouts(id),
    class_name text not null default '',
    amenity_ids uuid[] not null default '{}',
    fare_adjust_pct numeric(5,2) not null default 0,
    active boolean not null default true,
    legacy_trip_id text unique,
    data_sources jsonb not null default '[]',
    created_at timestamptz not null default now()
  );
  create table trips (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references organizations(id) on delete cascade,
    schedule_id uuid not null references schedules(id) on delete cascade,
    service_date date not null,
    departs_at timestamptz not null,
    bus_id uuid references buses(id) on delete set null,
    layout_id uuid not null references seat_layouts(id),
    driver_id uuid references users(id) on delete set null,
    conductor_id uuid references users(id) on delete set null,
    status text not null default 'scheduled' check (status in ('scheduled', 'boarding', 'departed', 'arrived', 'cancelled')),
    unique (schedule_id, service_date)
  );
  create index trips_date on trips (service_date, org_id);
  create table trip_seats (
    trip_id uuid not null references trips(id) on delete cascade,
    seat text not null,
    booking_id uuid not null references bookings(id) on delete cascade,
    primary key (trip_id, seat)
  );
  create index trip_seats_booking on trip_seats (booking_id);
  create table seat_releases (
    trip_id uuid not null references trips(id) on delete cascade,
    seat text not null,
    released_at timestamptz not null default now(),
    primary key (trip_id, seat)
  );
  alter table bookings add column org_id uuid references organizations(id);
  alter table bookings add column trip_uuid uuid references trips(id);
  alter table bookings add column sold_by uuid references users(id) on delete set null;
  alter table bookings add column channel text not null default 'online' check (channel in ('online', 'terminal'));
  alter table bookings add column checked_in text[] not null default '{}';
  create index bookings_trip on bookings (trip_uuid);
  create index bookings_org on bookings (org_id, created_at desc);
  create table audit_log (
    id bigserial primary key,
    at timestamptz not null default now(),
    actor_id uuid references users(id) on delete set null,
    org_id uuid references organizations(id) on delete cascade,
    action text not null,
    entity text not null default '',
    entity_id text not null default '',
    data jsonb not null default '{}',
    ip text not null default ''
  );
  create index audit_org on audit_log (org_id, at desc);`,
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
    const { rows: n } = await c.query<{ n: number }>('select count(*)::int n from organizations');
    if (n[0].n === 0) await seedDemo(c);
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
