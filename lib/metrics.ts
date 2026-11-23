// Prometheus metrics. Business totals are read from Postgres at scrape time, so every replica reports the same
// numbers (use max() across pods in PromQL). Process metrics and PayMongo API metering are per pod (use sum()).
import client from 'prom-client';
import { q } from './db.ts';

const g = globalThis as unknown as { __registry?: client.Registry; __paymongo?: client.Counter<'op' | 'status'> };

function build() {
  const registry = new client.Registry();
  client.collectDefaultMetrics({ register: registry, prefix: 'bikolbus_' });

  const paymongo = new client.Counter({ name: 'bikolbus_paymongo_requests_total', help: 'PayMongo API calls made by this pod (metering)', labelNames: ['op', 'status'] as const, registers: [registry] });

  const gauge = (name: string, help: string, labelNames: string[], fill: (set: (labels: Record<string, string>, v: number) => void) => Promise<void>) =>
    new client.Gauge({
      name, help, labelNames, registers: [registry],
      async collect() { this.reset(); await fill((l, v) => this.set(l, v)); },
    });

  gauge('bikolbus_bookings', 'Bookings by status', ['status'], async (set) => {
    for (const r of await q<{ status: string; n: number }>('select status, count(*)::int n from bookings group by 1')) set({ status: r.status }, r.n);
  });
  gauge('bikolbus_seats_sold', 'Seats on paid bookings (all time)', [], async (set) => {
    const [r] = await q<{ n: number }>(`select coalesce(sum(cardinality(seats)), 0)::int n from bookings where status = 'paid'`);
    set({}, r.n);
  });
  gauge('bikolbus_revenue_centavos', 'Collected online, by component (all time)', ['kind'], async (set) => {
    const [b] = await q<{ fare: number; fee: number }>(`select coalesce(sum(fare_centavos),0)::bigint fare, coalesce(sum(fee_centavos),0)::bigint fee from bookings where status = 'paid'`);
    const [s] = await q<{ v: number }>(`select coalesce(sum(fee_centavos),0)::bigint v from shipments where status not in ('pending_payment','cancelled')`);
    set({ kind: 'fare' }, b.fare); set({ kind: 'convenience_fee' }, b.fee); set({ kind: 'padala' }, s.v);
  });
  gauge('bikolbus_route_seats_sold', 'Seats sold per trip (all time)', ['trip'], async (set) => {
    for (const r of await q<{ trip_id: string; n: number }>(`select trip_id, sum(cardinality(seats))::int n from bookings where status = 'paid' group by 1`)) set({ trip: r.trip_id }, r.n);
  });
  gauge('bikolbus_shipments', 'Padala shipments by status', ['status'], async (set) => {
    for (const r of await q<{ status: string; n: number }>('select status, count(*)::int n from shipments group by 1')) set({ status: r.status }, r.n);
  });
  gauge('bikolbus_users', 'Accounts by role', ['role'], async (set) => {
    for (const r of await q<{ role: string; n: number }>('select role, count(*)::int n from users group by 1')) set({ role: r.role }, r.n);
  });
  gauge('bikolbus_passenger_profiles', 'Saved passenger profiles', [], async (set) => {
    const [r] = await q<{ n: number }>('select count(*)::int n from passengers'); set({}, r.n);
  });
  gauge('bikolbus_active_sessions', 'Signed-in sessions not yet expired', [], async (set) => {
    const [r] = await q<{ n: number }>('select count(*)::int n from sessions where expires_at > now()'); set({}, r.n);
  });
  return { registry, paymongo };
}

export function metrics() {
  if (!g.__registry) { const b = build(); g.__registry = b.registry; g.__paymongo = b.paymongo; }
  return { registry: g.__registry, paymongo: g.__paymongo! };
}
