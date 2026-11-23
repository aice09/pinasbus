import pg from 'pg';
import { DEMO_VERSION, resetDemoData, seedDemo } from './demo.ts';

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

  `-- phase 2: baggage
  create table bags (
    id uuid primary key default gen_random_uuid(),
    tag text unique not null,
    org_id uuid not null references organizations(id) on delete cascade,
    booking_id uuid not null references bookings(id) on delete cascade,
    trip_id uuid not null references trips(id) on delete cascade,
    passenger text not null,
    description text not null,
    category text not null default 'regular' check (category in ('regular', 'fragile', 'oversized', 'sports', 'perishable')),
    weight_kg numeric(6,2) not null check (weight_kg > 0),
    fee_centavos integer not null default 0,
    fee_paid boolean not null default false,
    status text not null default 'registered',
    created_at timestamptz not null default now()
  );
  create index bags_trip on bags (trip_id);
  create index bags_booking on bags (booking_id);
  create table bag_events (
    id bigserial primary key,
    bag_id uuid not null references bags(id) on delete cascade,
    status text not null,
    location text not null default '',
    note text not null default '',
    actor_id uuid references users(id) on delete set null,
    created_at timestamptz not null default now()
  );
  -- phase 3: tracking
  alter table stations add column coord_source text not null default '';
  alter table routes add column geometry jsonb;
  alter table routes add column min_fare integer not null default 0 check (min_fare >= 0);
  create table gps_points (
    id bigserial primary key,
    trip_id uuid not null references trips(id) on delete cascade,
    at timestamptz not null default now(),
    lat double precision not null, lng double precision not null,
    speed_kph double precision, heading double precision,
    source text not null check (source in ('device', 'hardware')),
    actor_id uuid references users(id) on delete set null
  );
  create index gps_trip_at on gps_points (trip_id, at desc);
  create table trip_alerts (
    id bigserial primary key,
    trip_id uuid not null references trips(id) on delete cascade,
    org_id uuid not null references organizations(id) on delete cascade,
    kind text not null check (kind in ('speeding', 'deviation', 'unusual_stop')),
    detail text not null,
    at timestamptz not null default now(),
    acknowledged boolean not null default false
  );
  create index trip_alerts_org on trip_alerts (org_id, at desc);
  -- phase 4: ferries
  create table vessels (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references organizations(id) on delete cascade,
    name text not null,
    registration text not null default '',
    vehicle_slots integer not null default 10 check (vehicle_slots > 0),
    passenger_capacity integer,
    status text not null default 'in_service' check (status in ('in_service', 'maintenance', 'retired')),
    unique (org_id, name)
  );
  create table sailings (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references organizations(id) on delete cascade,
    vessel_id uuid not null references vessels(id) on delete cascade,
    from_port text not null,
    to_port text not null,
    departs_at timestamptz not null,
    arrives_at timestamptz not null,
    boarding_minutes integer not null default 60,
    status text not null default 'scheduled' check (status in ('scheduled', 'boarding', 'sailing', 'arrived', 'delayed', 'cancelled')),
    note text not null default '',
    unique (vessel_id, departs_at)
  );
  create index sailings_ports on sailings (from_port, departs_at);
  create table ferry_links (
    id uuid primary key default gen_random_uuid(),
    trip_id uuid not null references trips(id) on delete cascade,
    sailing_id uuid not null references sailings(id) on delete cascade,
    reference text unique not null,
    qr_token text unique not null,
    status text not null default 'reserved' check (status in ('reserved', 'approaching', 'waiting', 'boarding', 'on_vessel', 'sailing', 'disembarked', 'continuing', 'cancelled')),
    created_at timestamptz not null default now(),
    unique (trip_id, sailing_id)
  );
  create table ferry_events (
    id bigserial primary key,
    link_id uuid not null references ferry_links(id) on delete cascade,
    status text not null,
    note text not null default '',
    actor_id uuid references users(id) on delete set null,
    created_at timestamptz not null default now()
  );
  -- phase 5: stored-value cards (the issuer ledger is the issuer's system of record; PINASBUS calls it through an adapter)
  create table card_programs (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references organizations(id) on delete cascade,
    name text not null,
    prefix text not null check (prefix ~ '^[0-9]{4}$'),
    min_load_centavos integer not null default 10000,
    max_balance_centavos integer not null default 1000000,
    active boolean not null default true,
    unique (org_id, name)
  );
  create table cards (
    id uuid primary key default gen_random_uuid(),
    org_id uuid not null references organizations(id) on delete cascade,
    program_id uuid not null references card_programs(id) on delete cascade,
    number text unique not null check (number ~ '^[0-9]{16}$'),
    holder_name text not null default '',
    user_id uuid references users(id) on delete set null,
    status text not null default 'active' check (status in ('inventory', 'active', 'blocked')),
    balance_centavos integer not null default 0 check (balance_centavos >= 0),
    created_at timestamptz not null default now()
  );
  create index cards_user on cards (user_id);
  create table card_ledger (
    id bigserial primary key,
    card_id uuid not null references cards(id) on delete cascade,
    kind text not null check (kind in ('load', 'fare', 'refund', 'adjustment')),
    amount_centavos integer not null,
    balance_after integer not null,
    reference text not null,
    channel text not null default '',
    created_at timestamptz not null default now(),
    unique (kind, reference)
  );
  create table card_loads (
    id uuid primary key default gen_random_uuid(),
    ref text unique not null,
    card_id uuid not null references cards(id) on delete cascade,
    user_id uuid references users(id) on delete set null,
    amount_centavos integer not null check (amount_centavos > 0),
    status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
    checkout_id text unique,
    payment_id text,
    created_at timestamptz not null default now()
  );
  alter table bookings add column paid_with text not null default 'paymongo' check (paid_with in ('paymongo', 'card', 'cash'));
  alter table bookings add column card_id uuid references cards(id) on delete set null;
  -- phase 6: notifications, MFA, password reset, background jobs
  create table notifications (
    id bigserial primary key,
    user_id uuid not null references users(id) on delete cascade,
    kind text not null,
    title text not null,
    body text not null default '',
    link text not null default '',
    read_at timestamptz,
    emailed_at timestamptz,
    created_at timestamptz not null default now()
  );
  create index notifications_user on notifications (user_id, created_at desc);
  create table outbox (
    id bigserial primary key,
    to_email text not null,
    subject text not null,
    body text not null,
    attempts integer not null default 0,
    sent_at timestamptz,
    last_error text not null default '',
    created_at timestamptz not null default now()
  );
  create index outbox_pending on outbox (created_at) where sent_at is null;
  alter table users add column mfa_secret text;
  alter table users add column mfa_enabled boolean not null default false;
  create table password_resets (
    token_hash text primary key,
    user_id uuid not null references users(id) on delete cascade,
    expires_at timestamptz not null,
    used_at timestamptz
  );
  create table mfa_challenges (
    token_hash text primary key,
    user_id uuid not null references users(id) on delete cascade,
    next text not null default '/account',
    expires_at timestamptz not null
  );
  create table job_runs (name text primary key, last_run timestamptz not null);
  alter table bookings add column reminded_at timestamptz;`,
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
    else if (process.env.DEMO_AUTO_RESET !== 'false') {
      const { rows: v } = await c.query<{ value: number }>(`select value from settings where key = 'demo_version'`);
      if ((v[0]?.value ?? 1) !== DEMO_VERSION) await resetDemoData(c);
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
