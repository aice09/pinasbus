// Demo data for development and the public demonstration. Every operator here is a real company used WITHOUT
// partnership: the UI labels all demo organizations as unaffiliated, and every route/schedule carries its source.
//   - Isarog Line, Peñafrancia Tours, Legaspi St. Jude, RSL Bus: trips, times and fares scraped from bicolisarog.com
//     (the operators' shared public booking site) on 2026-11-23 -> verified.
//   - Victory Liner: terminal names/addresses and bus classes from Wikipedia (2026-11-24). Victory Liner publishes no
//     readable schedules or fares, so its routes, times and fares are INDICATIVE demo values, flagged as such.
import type { PoolClient } from 'pg';
import raw from '../data/trips.json' with { type: 'json' };
import { layoutFor, type Seat } from './layouts.ts';
import { hashPassword } from './password.ts';
import type { Role } from './rbac.ts';

const BICOL_SRC = { url: 'https://bicolisarog.com/trip/schedules/1', verified_at: '2026-11-23', what: 'Trip codes, departure times, bus classes and fares from the public trip search', verified: true };
const VL_WIKI = { url: 'https://en.wikipedia.org/wiki/Victory_Liner', verified_at: '2026-11-24', what: 'Terminal names and addresses, bus classes', verified: true };
const VL_INDICATIVE = { url: 'https://www.victoryliner.com/TerminalGuide.aspx', verified_at: '2026-11-24', what: 'Fare & schedule page unavailable; times and fares here are indicative demo values, not official', verified: false };

export const CATEGORIES: [string, string, string][] = [
  ['city', 'City bus', 'Short urban routes, fares by distance'],
  ['provincial', 'Provincial and intercity', 'Long-distance routes between provinces'],
  ['p2p', 'Point-to-point (P2P)', 'Non-stop premium service between two hubs'],
  ['airport', 'Airport shuttle', 'Scheduled service to and from airports'],
  ['tourist', 'Tourist and charter', 'Chartered or tour services'],
  ['express', 'Express', 'Limited-stop intercity service'],
  ['premium', 'Premium and luxury coach', 'Sleeper and first-class coaches'],
  ['ordinary', 'Ordinary and regular', 'Ordinary and regular aircon/non-aircon buses'],
  ['school', 'School and institutional', 'Future expansion'],
];

export const AMENITIES = ['Air conditioning', 'Restroom / CR', 'Television', 'Wi-Fi', 'USB charging ports', 'Reclining seats', 'Leg rest',
  'Reading lights', 'Entertainment system', 'Sleeper seats', 'Premium seating', 'Wheelchair accessibility', 'Emergency equipment'];

type ClassDef = { id: string; name: string; seats: number; category: string; amenities: string[] };
const CLASS: Record<string, ClassDef> = {
  'Ultimate Sleeper Bus': { id: 'sleeper22', name: 'Ultimate Sleeper', seats: 22, category: 'premium', amenities: ['Air conditioning', 'Restroom / CR', 'Television', 'Sleeper seats', 'Reading lights', 'Emergency equipment'] },
  'Regular Sleeper Bus': { id: 'sleeper20', name: 'Regular Sleeper', seats: 20, category: 'premium', amenities: ['Air conditioning', 'Restroom / CR', 'Sleeper seats', 'Emergency equipment'] },
  'ELITE 26': { id: 'elite', name: 'Elite 26', seats: 25, category: 'premium', amenities: ['Air conditioning', 'Restroom / CR', 'Reclining seats', 'Leg rest', 'Emergency equipment'] },
  'SKYBUS WITH CR': { id: 'skybus', name: 'Skybus with CR', seats: 36, category: 'provincial', amenities: ['Air conditioning', 'Restroom / CR', 'Reclining seats', 'Emergency equipment'] },
  'REGULAR WITHOUT CR': { id: 'regular', name: 'Regular Aircon', seats: 47, category: 'ordinary', amenities: ['Air conditioning', 'Emergency equipment'] },
  'NON-AIRCON': { id: 'nonac', name: 'Non-Aircon', seats: 57, category: 'ordinary', amenities: ['Emergency equipment'] },
};

// Province of each station name used by the source data and Victory Liner's terminals.
const PROVINCE: Record<string, [string, string, string?]> = {
  'EDSA Cubao': ['Quezon City', 'Metro Manila'], 'Aurora Cubao': ['Quezon City', 'Metro Manila'], 'Arcovia Pasig': ['Pasig', 'Metro Manila'],
  Avenida: ['Manila', 'Metro Manila'], Ermita: ['Manila', 'Metro Manila'], PITX: ['Parañaque', 'Metro Manila'], Alabang: ['Muntinlupa', 'Metro Manila'],
  'Alabang Starmall': ['Muntinlupa', 'Metro Manila'], Turbina: ['Calamba', 'Laguna'],
  'Naga CBD': ['Naga', 'Camarines Sur'], 'Naga Puregold': ['Naga', 'Camarines Sur'], Sipocot: ['Sipocot', 'Camarines Sur'], Iriga: ['Iriga', 'Camarines Sur'],
  Lagonoy: ['Lagonoy', 'Camarines Sur'], Ocampo: ['Ocampo', 'Camarines Sur'], 'San Isidro Libmanan': ['Libmanan', 'Camarines Sur'],
  Legazpi: ['Legazpi', 'Albay'], Daraga: ['Daraga', 'Albay'], Tabaco: ['Tabaco', 'Albay'], 'Tabaco Pier': ['Tabaco', 'Albay', 'port'],
  Gubat: ['Gubat', 'Sorsogon'], Bulan: ['Bulan', 'Sorsogon'], Virac: ['Virac', 'Catanduanes'], 'San Andres': ['San Andres', 'Catanduanes', 'port'],
  'Masbate City': ['Masbate City', 'Masbate', 'port'], Tacloban: ['Tacloban', 'Leyte'], Allen: ['Allen', 'Northern Samar', 'port'],
};

const VL_TERMINALS: [string, string, string, string][] = [
  ['Victory Liner Cubao', '651 EDSA, Immaculate Conception', 'Quezon City', 'Metro Manila'],
  ['Victory Liner Kamias', '766 EDSA corner East Avenue, Pinyahan', 'Quezon City', 'Metro Manila'],
  ['Victory Liner Pasay', '712 EDSA', 'Pasay', 'Metro Manila'],
  ['Victory Liner Sampaloc', 'Sampaloc Bus Terminal, Earnshaw Street', 'Manila', 'Metro Manila'],
  ['Victory Liner Caloocan', 'Rizal Avenue Extension', 'Caloocan', 'Metro Manila'],
  ['Victory Liner San Fernando', 'Jose Abad Santos Avenue, Dolores', 'San Fernando', 'Pampanga'],
  ['Victory Liner Dau', 'Dau Bus Terminal', 'Mabalacat', 'Pampanga'],
  ['Victory Liner Olongapo', 'West Bajac-bajac', 'Olongapo', 'Zambales'],
  ['Victory Liner Iba', 'Palanginan', 'Iba', 'Zambales'],
  ['Victory Liner Tarlac', 'Zamora St', 'Tarlac City', 'Tarlac'],
  ['Victory Liner Dagupan', 'Perez Boulevard, Herrero-Perez', 'Dagupan', 'Pangasinan'],
  ['Victory Liner Alaminos', 'Quezon Avenue, Poblacion', 'Alaminos', 'Pangasinan'],
  ['Victory Liner Baguio', 'Upper Session Road, Marcoville', 'Baguio', 'Benguet'],
  ['Victory Liner Santiago', 'Calao East', 'Santiago', 'Isabela'],
  ['Victory Liner Tuguegarao', 'Maharlika Highway, Penge-Ruyu', 'Tuguegarao', 'Cagayan'],
];

// Planned road itineraries (major roads only). Indicative: drawn from the road network, not from operators.
const SLEX = { type: 'expressway', name: 'South Luzon Expressway (SLEX)', from: 'Magallanes', to: 'Santo Tomas, Batangas', toll: true };
const MAHARLIKA_BICOL = { type: 'highway', name: 'Pan-Philippine Highway (Maharlika)', from: 'Santo Tomas, Batangas', to: 'Quezon and Camarines Sur', toll: false };
function bicolItinerary(dest: string[]) {
  const it: object[] = [SLEX, MAHARLIKA_BICOL];
  if (dest.some((d) => ['Virac', 'San Andres'].includes(d))) it.push({ type: 'ferry', name: 'Tabaco – San Andres ferry', from: 'Tabaco Pier', to: 'San Andres, Catanduanes', toll: false });
  if (dest.includes('Masbate City')) it.push({ type: 'ferry', name: 'Pilar – Masbate ferry', from: 'Pilar, Sorsogon', to: 'Masbate City port', toll: false });
  if (dest.includes('Tacloban')) it.push({ type: 'ferry', name: 'Matnog – Allen ferry', from: 'Matnog, Sorsogon', to: 'Allen, Northern Samar', toll: false });
  return it;
}

const ORGS: { slug: string; name: string; operator?: string; sources: object[] }[] = [
  { slug: 'bicol-isarog', name: 'Bicol Isarog Transport System (Isarog Line)', operator: 'Isarog Line', sources: [BICOL_SRC] },
  { slug: 'penafrancia-tours', name: 'Peñafrancia Tours', operator: 'Peñafrancia Tours', sources: [BICOL_SRC] },
  { slug: 'legaspi-st-jude', name: 'Legaspi St. Jude Transport Lines', operator: 'Legaspi St. Jude Transport Lines Inc.', sources: [BICOL_SRC] },
  { slug: 'rsl-bus', name: 'RSL Bus', operator: 'RSL Bus', sources: [BICOL_SRC] },
  { slug: 'victory-liner', name: 'Victory Liner', sources: [VL_WIKI, VL_INDICATIVE] },
];

// Victory Liner: indicative only. [code, name, stops [station, offset min, fare PHP], itinerary, times, class]
const VL_ROUTES: [string, string, [string, number, number][], object[], string[], keyof typeof CLASS | 'royal'][] = [
  ['VL-BAG', 'Cubao – Baguio', [['Victory Liner Cubao', 0, 0], ['Victory Liner Dau', 110, 350], ['Victory Liner Baguio', 330, 800]],
    [{ type: 'expressway', name: 'North Luzon Expressway (NLEX)', from: 'Balintawak', to: 'Santa Ines', toll: true }, { type: 'expressway', name: 'Subic–Clark–Tarlac Expressway (SCTEX)', from: 'Mabalacat', to: 'Tarlac City', toll: true }, { type: 'expressway', name: 'Tarlac–Pangasinan–La Union Expressway (TPLEX)', from: 'Tarlac City', to: 'Rosario', toll: true }, { type: 'highway', name: 'Marcos Highway', from: 'Agoo', to: 'Baguio', toll: false }],
    ['06:00', '10:00', '22:00'], 'royal'],
  ['VL-DAG', 'Kamias – Dagupan', [['Victory Liner Kamias', 0, 0], ['Victory Liner Tarlac', 140, 320], ['Victory Liner Dagupan', 260, 520]],
    [{ type: 'expressway', name: 'North Luzon Expressway (NLEX)', from: 'Balintawak', to: 'Santa Ines', toll: true }, { type: 'expressway', name: 'Subic–Clark–Tarlac Expressway (SCTEX)', from: 'Mabalacat', to: 'Tarlac City', toll: true }, { type: 'expressway', name: 'Tarlac–Pangasinan–La Union Expressway (TPLEX)', from: 'Tarlac City', to: 'Urdaneta', toll: true }],
    ['05:30', '09:30', '14:00'], 'REGULAR WITHOUT CR'],
  ['VL-OLO', 'Pasay – Olongapo', [['Victory Liner Pasay', 0, 0], ['Victory Liner San Fernando', 90, 220], ['Victory Liner Olongapo', 200, 400]],
    [{ type: 'expressway', name: 'North Luzon Expressway (NLEX)', from: 'Balintawak', to: 'San Fernando', toll: true }, { type: 'expressway', name: 'Subic–Clark–Tarlac Expressway (SCTEX)', from: 'Porac', to: 'Tipo', toll: true }],
    ['07:00', '12:00', '17:00'], 'REGULAR WITHOUT CR'],
  ['VL-TUG', 'Kamias – Tuguegarao', [['Victory Liner Kamias', 0, 0], ['Victory Liner Santiago', 420, 900], ['Victory Liner Tuguegarao', 600, 1150]],
    [{ type: 'expressway', name: 'North Luzon Expressway (NLEX)', from: 'Balintawak', to: 'Santa Ines', toll: true }, { type: 'expressway', name: 'Central Luzon Link Expressway (CLLEX)', from: 'Tarlac City', to: 'Cabanatuan', toll: true }, { type: 'highway', name: 'Pan-Philippine Highway (Maharlika)', from: 'Cabanatuan', to: 'Tuguegarao', toll: false }],
    ['19:00', '21:00'], 'ELITE 26'],
];

export const DEMO_ACCOUNTS: { email: string; name: string; org?: string; role?: Role; platform?: boolean; category?: string }[] = [
  { email: 'platform.admin@demo.pinasbus.test', name: 'Platform Administrator', platform: true },
  ...(['company_admin', 'operations_manager', 'dispatcher', 'ticketing_officer', 'cashier', 'driver', 'conductor', 'baggage_handler', 'finance_officer'] as Role[])
    .map((role) => ({ email: `${role.replace('_', '.')}@victory-liner.demo.pinasbus.test`, name: `VL ${role.replace(/_/g, ' ')}`, org: 'victory-liner', role })),
  ...(['company_admin', 'operations_manager', 'dispatcher', 'driver', 'conductor'] as Role[])
    .map((role) => ({ email: `${role.replace('_', '.')}@bicol-isarog.demo.pinasbus.test`, name: `Isarog ${role.replace(/_/g, ' ')}`, org: 'bicol-isarog', role })),
  { email: 'passenger.regular@demo.pinasbus.test', name: 'Juan Dela Cruz', category: 'regular' },
  { email: 'passenger.senior@demo.pinasbus.test', name: 'Lourdes Santos', category: 'senior' },
  { email: 'passenger.pwd@demo.pinasbus.test', name: 'Ramon Reyes', category: 'pwd' },
];

export async function seedDemo(c: PoolClient) {
  for (const [i, [id, name, description]] of CATEGORIES.entries())
    await c.query('insert into categories (id, name, description, sort) values ($1,$2,$3,$4) on conflict (id) do nothing', [id, name, description, i]);
  for (const a of AMENITIES) await c.query('insert into amenities (org_id, name) values (null, $1) on conflict do nothing', [a]);
  const amen = new Map((await c.query<{ id: string; name: string }>('select id, name from amenities where org_id is null')).rows.map((r) => [r.name, r.id]));

  await c.query(`insert into organizations (kind, name, slug, is_demo) values ('platform', 'PINASBUS', 'pinasbus', false) on conflict (slug) do nothing`);

  for (const [name, [city, province, kind]] of Object.entries(PROVINCE))
    await c.query(`insert into stations (name, city, province, kind, source_url, verified_at) values ($1,$2,$3,$4,$5,'2026-11-23') on conflict (name) do nothing`,
      [name, city, province, kind ?? 'terminal', BICOL_SRC.url]);
  for (const [name, address, city, province] of VL_TERMINALS)
    await c.query(`insert into stations (name, address, city, province, kind, source_url, verified_at) values ($1,$2,$3,$4,'terminal',$5,'2026-11-24') on conflict (name) do nothing`,
      [name, address, city, province, VL_WIKI.url]);
  const station = new Map((await c.query<{ id: string; name: string }>('select id, name from stations')).rows.map((r) => [r.name, r.id]));

  for (const o of ORGS) {
    const { rows: [org] } = await c.query<{ id: string }>(
      `insert into organizations (kind, name, slug, is_demo, data_sources) values ('bus_operator', $1, $2, true, $3)
       on conflict (slug) do update set name = excluded.name returning id`, [o.name, o.slug, JSON.stringify(o.sources)]);
    const layouts = new Map<string, string>(), buses = new Map<string, string>();
    const layoutId = async (cls: ClassDef | { id: string; name: string; seats: number }) => {
      if (!layouts.has(cls.id)) {
        const seats: Seat[] = layoutFor(cls.id, cls.seats);
        const { rows: [l] } = await c.query<{ id: string }>('insert into seat_layouts (org_id, name, seats) values ($1,$2,$3) returning id', [org.id, cls.name, JSON.stringify(seats)]);
        layouts.set(cls.id, l.id);
        const n = buses.size + 1;
        const { rows: [b] } = await c.query<{ id: string }>(
          `insert into buses (org_id, code, plate, class_name, category_id, layout_id, decks, max_passengers, max_baggage_kg, amenity_ids, inspection_status)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Demo record')
           returning id`,
          [org.id, `${o.slug.slice(0, 3).toUpperCase()}-${100 + n}`, `DEMO ${1000 + n}`, cls.name, 'category' in cls ? cls.category : 'premium', l.id,
            seats.some((s) => s.deck === 1) ? 2 : 1, seats.filter((s) => s.kind !== 'driver' && s.kind !== 'conductor').length, 1500,
            ('amenities' in cls ? cls.amenities : ['Air conditioning', 'Restroom / CR', 'Sleeper seats']).map((a) => amen.get(a)).filter(Boolean)]);
        buses.set(cls.id, b.id);
      }
      return { layout: layouts.get(cls.id)!, bus: buses.get(cls.id)! };
    };

    if (o.operator) {
      for (const t of (raw as { operator: string; id: string; code: string; dir: string; bus: string; fare: number; pickups: { station: string; time: string }[]; dropoffs: string[] }[]).filter((x) => x.operator === o.operator)) {
        const cls = CLASS[t.bus];
        const first = t.pickups[0].time;
        const mins = (hhmm: string) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
        const stops = [
          ...t.pickups.map((p) => ({ station_id: station.get(p.station), name: p.station, offset_min: (mins(p.time) - mins(first) + 1440) % 1440, fare: 0, boarding: true, alighting: false })),
          ...t.dropoffs.map((d) => ({ station_id: station.get(d), name: d, offset_min: null, fare: t.fare, boarding: false, alighting: true })),
        ];
        const name = `${t.pickups[0].station} – ${t.dropoffs.join(' / ')}`;
        const { rows: [r] } = await c.query<{ id: string }>(
          `insert into routes (org_id, code, name, category_id, stops, itinerary, mode, data_sources) values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
          [org.id, `${t.code}-${t.dir === 'south' ? 'S' : 'N'}`, name, cls.category, JSON.stringify(stops), JSON.stringify(bicolItinerary([...t.dropoffs, t.pickups[0].station])),
            t.dropoffs.concat(t.pickups[0].station).some((d) => ['Virac', 'San Andres', 'Masbate City', 'Tacloban'].includes(d)) ? 'road_ferry' : 'road', JSON.stringify([BICOL_SRC])]);
        const { layout, bus } = await layoutId(cls);
        await c.query(
          `insert into schedules (org_id, route_id, code, departure, layout_id, bus_id, class_name, amenity_ids, legacy_trip_id, data_sources, valid_from)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'2026-11-01')`,
          [org.id, r.id, t.code, first, layout, bus, cls.name, cls.amenities.map((a) => amen.get(a)).filter(Boolean), t.id, JSON.stringify([BICOL_SRC])]);
      }
    } else {
      for (const [code, name, stops, itinerary, times, clsKey] of VL_ROUTES) {
        const cls = clsKey === 'royal' ? { id: 'royal', name: 'Royal Class', seats: 28, category: 'premium', amenities: ['Air conditioning', 'Restroom / CR', 'Sleeper seats', 'Television', 'Wi-Fi'] } : CLASS[clsKey];
        const s = stops.map(([st, off, fare], i) => ({ station_id: station.get(st), name: st, offset_min: off, fare, boarding: i < stops.length - 1, alighting: i > 0 }));
        const { rows: [r] } = await c.query<{ id: string }>(
          `insert into routes (org_id, code, name, category_id, stops, itinerary, data_sources) values ($1,$2,$3,$4,$5,$6,$7) returning id`,
          [org.id, code, name, cls.category, JSON.stringify(s), JSON.stringify(itinerary), JSON.stringify([VL_WIKI, VL_INDICATIVE])]);
        const { layout, bus } = await layoutId(cls);
        for (const time of times)
          await c.query(`insert into schedules (org_id, route_id, code, departure, layout_id, bus_id, class_name, amenity_ids, data_sources, valid_from) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'2026-11-01')`,
            [org.id, r.id, `${code}-${time.replace(':', '')}`, time, layout, bus, cls.name, cls.amenities.map((a) => amen.get(a)).filter(Boolean), JSON.stringify([VL_INDICATIVE])]);
      }
    }
  }
  await migrateLegacyBookings(c);
  await seedAccounts(c);
}

/** Moves BikolBus-era bookings onto the new trip instances so tickets and history keep working. */
async function migrateLegacyBookings(c: PoolClient) {
  const { rows } = await c.query<{ id: string; trip_id: string; travel_date: string; status: string }>('select id, trip_id, travel_date, status from bookings where trip_uuid is null');
  for (const b of rows) {
    const { rows: [s] } = await c.query<{ id: string; org_id: string; layout_id: string; bus_id: string; departure: string }>('select id, org_id, layout_id, bus_id, departure from schedules where legacy_trip_id = $1', [b.trip_id]);
    if (!s) continue;
    const { rows: [t] } = await c.query<{ id: string }>(
      `insert into trips (org_id, schedule_id, service_date, departs_at, bus_id, layout_id) values ($1,$2,$3, ($3::date + $4::time) at time zone 'Asia/Manila', $5, $6)
       on conflict (schedule_id, service_date) do update set org_id = excluded.org_id returning id`, [s.org_id, s.id, b.travel_date, s.departure, s.bus_id, s.layout_id]);
    await c.query('update bookings set trip_uuid = $2, org_id = $3 where id = $1', [b.id, t.id, s.org_id]);
    await c.query(`insert into trip_seats (trip_id, seat, booking_id) select $1, seat, booking_id from seat_locks where booking_id = $2 on conflict do nothing`, [t.id, b.id]);
  }
}

/**
 * Demo accounts, only when DEMO_PASSWORD is set (a Kubernetes Secret, never in git). All share that password and
 * must change it at first sign-in. The platform-admin demo account stays disabled unless DEMO_PLATFORM_ADMIN=true.
 */
export async function seedAccounts(c: PoolClient) {
  const pw = process.env.DEMO_PASSWORD;
  if (!pw || pw.length < 12) return;
  const hash = await hashPassword(pw);
  for (const a of DEMO_ACCOUNTS) {
    const { rows: [u] } = await c.query<{ id: string }>(
      `insert into users (email, name, phone, password_hash, platform_role, passenger_category, must_change_password, disabled)
       values ($1,$2,'09170000000',$3,$4,$5,true,$6) on conflict ((lower(email))) do update set name = excluded.name returning id`,
      [a.email, a.name, hash, a.platform ? 'platform_admin' : 'none', a.category ?? 'regular', !!a.platform && process.env.DEMO_PLATFORM_ADMIN !== 'true']);
    if (a.org && a.role) await c.query(`insert into memberships (user_id, org_id, role) select $1, id, $3 from organizations where slug = $2 on conflict do nothing`, [u.id, a.org, a.role]);
  }
}
