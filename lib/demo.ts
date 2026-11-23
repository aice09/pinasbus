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
  'Pilar Port': ['Pilar', 'Sorsogon', 'port'], 'Matnog Port': ['Matnog', 'Sorsogon', 'port'],
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
  if (dest.some((d) => ['Virac', 'San Andres'].includes(d))) it.push({ type: 'ferry', name: 'Tabaco – San Andres ferry', from: 'Tabaco Pier', to: 'San Andres', toll: false });
  if (dest.includes('Masbate City')) it.push({ type: 'ferry', name: 'Pilar – Masbate ferry', from: 'Pilar Port', to: 'Masbate City', toll: false });
  if (dest.includes('Tacloban')) it.push({ type: 'ferry', name: 'Matnog – Allen ferry', from: 'Matnog Port', to: 'Allen', toll: false });
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
  await seedDemoV2(c);
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

// ---------------------------------------------------------------------------------------------------------------
// Phase 2–6 demo data (seed version 2).

/** Bump when the demo seed changes; startup reloads demo companies (never real ones) when it differs. */
export const DEMO_VERSION = 2;

/**
 * Approximate station coordinates for the maps (city or terminal level, not surveyed). Stored with
 * coord_source 'approximate'. Operators can correct them; tracking falls back gracefully.
 */
export const COORDS: Record<string, [number, number]> = {
  'EDSA Cubao': [14.6197, 121.0532], 'Aurora Cubao': [14.6230, 121.0548], 'Arcovia Pasig': [14.5940, 121.0790], Avenida: [14.6090, 120.9830],
  Ermita: [14.5830, 120.9840], PITX: [14.5098, 120.9917], Alabang: [14.4199, 121.0430], 'Alabang Starmall': [14.4245, 121.0447], Turbina: [14.1915, 121.1380],
  'Naga CBD': [13.6233, 123.1853], 'Naga Puregold': [13.6260, 123.1880], Sipocot: [13.7685, 122.9785], Iriga: [13.4210, 123.4115], Lagonoy: [13.7360, 123.5210],
  Ocampo: [13.5600, 123.3730], 'San Isidro Libmanan': [13.6960, 123.0600], Legazpi: [13.1391, 123.7438], Daraga: [13.1480, 123.7130], Tabaco: [13.3590, 123.7330],
  'Tabaco Pier': [13.3600, 123.7410], Gubat: [12.9189, 124.1229], Bulan: [12.6690, 123.8760], Virac: [13.5840, 124.2320], 'San Andres': [13.5980, 124.0960],
  'Masbate City': [12.3700, 123.6200], Tacloban: [11.2440, 125.0039], Allen: [12.5000, 124.2830], 'Pilar Port': [12.9230, 123.6750], 'Matnog Port': [12.5860, 124.0860],
  'Victory Liner Cubao': [14.6195, 121.0550], 'Victory Liner Kamias': [14.6337, 121.0450], 'Victory Liner Pasay': [14.5375, 121.0010], 'Victory Liner Sampaloc': [14.6100, 120.9940],
  'Victory Liner Caloocan': [14.6560, 120.9840], 'Victory Liner San Fernando': [15.0300, 120.6890], 'Victory Liner Dau': [15.1780, 120.5900], 'Victory Liner Olongapo': [14.8300, 120.2830],
  'Victory Liner Iba': [15.3270, 119.9780], 'Victory Liner Tarlac': [15.4860, 120.5900], 'Victory Liner Dagupan': [16.0430, 120.3330], 'Victory Liner Alaminos': [16.1560, 119.9800],
  'Victory Liner Baguio': [16.4120, 120.5960], 'Victory Liner Santiago': [16.6880, 121.5480], 'Victory Liner Tuguegarao': [17.6130, 121.7270],
  'Partas Cubao': [14.6210, 121.0520], 'Partas Pasay': [14.5380, 121.0000], 'Partas Candon': [17.1940, 120.4500], 'Partas Vigan': [17.5750, 120.3870],
  'Partas Laoag': [18.1980, 120.5930], 'Partas Pagudpud': [18.5600, 120.7870], 'Partas Baguio': [16.4100, 120.5990], 'Partas San Fernando La Union': [16.6160, 120.3170],
  Monumento: [14.6543, 120.9839], 'Bagong Barrio': [14.6576, 120.9963], Balintawak: [14.6575, 121.0036], 'Kaingin Road': [14.6560, 121.0120], Roosevelt: [14.6570, 121.0210],
  'SM North EDSA': [14.6563, 121.0296], 'North Avenue': [14.6520, 121.0330], 'Quezon Avenue': [14.6425, 121.0380], 'Philam QC': [14.6390, 121.0410], Kamuning: [14.6340, 121.0435],
  'Nepa Q-Mart': [14.6265, 121.0485], 'Main Avenue': [14.6175, 121.0555], Santolan: [14.6080, 121.0565], Ortigas: [14.5880, 121.0565], Guadalupe: [14.5670, 121.0450],
  Buendia: [14.5545, 121.0340], Ayala: [14.5490, 121.0280], Tramo: [14.5425, 121.0010], 'Taft Avenue': [14.5375, 121.0015], 'Roxas Boulevard': [14.5360, 120.9935],
  'SM Mall of Asia': [14.5350, 120.9830],
};
const PROV2: Record<string, [string, string, string?]> = {
  'Partas Cubao': ['Quezon City', 'Metro Manila'], 'Partas Pasay': ['Pasay', 'Metro Manila'], 'Partas Candon': ['Candon', 'Ilocos Sur'], 'Partas Vigan': ['Vigan', 'Ilocos Sur'],
  'Partas Laoag': ['Laoag', 'Ilocos Norte'], 'Partas Pagudpud': ['Pagudpud', 'Ilocos Norte'], 'Partas Baguio': ['Baguio', 'Benguet'], 'Partas San Fernando La Union': ['San Fernando', 'La Union'],
  'Pilar Port': ['Pilar', 'Sorsogon', 'port'], 'Matnog Port': ['Matnog', 'Sorsogon', 'port'],
};
const CAROUSEL = ['Monumento', 'Bagong Barrio', 'Balintawak', 'Kaingin Road', 'Roosevelt', 'SM North EDSA', 'North Avenue', 'Quezon Avenue', 'Philam QC', 'Kamuning',
  'Nepa Q-Mart', 'Main Avenue', 'Santolan', 'Ortigas', 'Guadalupe', 'Buendia', 'Ayala', 'Tramo', 'Taft Avenue', 'Roxas Boulevard', 'SM Mall of Asia', 'PITX'];
const CAROUSEL_SRC = { url: 'https://en.wikipedia.org/wiki/EDSA_Carousel', verified_at: '2026-11-24', what: 'Stop list (Monumento to PITX), 24/7 operation and operators', verified: true };
const CAROUSEL_IND = { url: 'https://en.wikipedia.org/wiki/EDSA_Carousel', verified_at: '2026-11-24', what: 'No published fare or headway on the source; fares and the 30-minute timetable here are indicative', verified: false };
const PARTAS_SRC = { url: 'https://en.wikipedia.org/wiki/Partas', verified_at: '2026-11-24', what: 'Terminals, destinations and bus classes (Luxury 28, Deluxe 45, Regular 49 seats)', verified: true };
const PARTAS_IND = { url: 'https://en.wikipedia.org/wiki/Partas', verified_at: '2026-11-24', what: 'No departure times or fares on the source; times and fares here are indicative', verified: false };

async function seedV2(c: PoolClient) {
  for (const [name, [city, province, kind]] of Object.entries(PROV2))
    await c.query(`insert into stations (name, city, province, kind) values ($1,$2,$3,$4) on conflict (name) do nothing`, [name, city, province, kind ?? 'terminal']);
  for (const name of CAROUSEL)
    await c.query(`insert into stations (name, city, province, kind, source_url, verified_at) values ($1,'','Metro Manila','stop',$2,'2026-11-24') on conflict (name) do nothing`, [name, CAROUSEL_SRC.url]);
  for (const [name, [lat, lng]] of Object.entries(COORDS))
    await c.query(`update stations set lat = $2, lng = $3, coord_source = 'approximate' where name = $1 and lat is null`, [name, lat, lng]);
  await c.query(`update categories set rules = '{"bookable": false, "note": "Walk-up service: pay on board, no seat reservations"}' where id = 'city'`);
  const amen = new Map((await c.query<{ id: string; name: string }>('select id, name from amenities where org_id is null')).rows.map((r) => [r.name, r.id]));
  const ids = (names: string[]) => names.map((n) => amen.get(n)).filter(Boolean);

  // Partas (Ilocos): verified terminals and classes, indicative times and fares.
  const { rows: [partas] } = await c.query<{ id: string }>(`insert into organizations (kind, name, slug, is_demo, data_sources) values ('bus_operator','Partas Transportation Co.','partas',true,$1)
     on conflict (slug) do update set name = excluded.name returning id`, [JSON.stringify([PARTAS_SRC, PARTAS_IND])]);
  const pl = async (name: string, cls: string, seats: number) => (await c.query<{ id: string }>(`insert into seat_layouts (org_id, name, seats) values ($1,$2,$3) on conflict (org_id, name) do update set name = excluded.name returning id`,
    [partas.id, name, JSON.stringify(layoutFor(cls, seats))])).rows[0].id;
  const lux = await pl('Luxury 2+1, 28 seats', 'elite', 28), dlx = await pl('Deluxe 2+2, 45 seats', 'regular', 45);
  const TPLEX = [{ type: 'expressway', name: 'North Luzon Expressway (NLEX)', from: 'Balintawak', to: 'Santa Ines', toll: true }, { type: 'expressway', name: 'Subic–Clark–Tarlac Expressway (SCTEX)', from: 'Mabalacat', to: 'Tarlac City', toll: true },
    { type: 'expressway', name: 'Tarlac–Pangasinan–La Union Expressway (TPLEX)', from: 'Tarlac City', to: 'Rosario', toll: true }, { type: 'highway', name: 'Manila North Road (MacArthur Highway)', from: 'Rosario', to: 'Laoag', toll: false }];
  for (const [code, name, stops, times, layout, cls, amenities] of [
    ['PT-LAO', 'Cubao – Vigan – Laoag', [['Partas Cubao', 0, 0], ['Partas Candon', 450, 850], ['Partas Vigan', 520, 950], ['Partas Laoag', 610, 1100]], ['19:00', '21:30'], lux, 'Luxury', ['Air conditioning', 'Restroom / CR', 'USB charging ports', 'Reclining seats', 'Leg rest', 'Emergency equipment']],
    ['PT-PAG', 'Pasay – Pagudpud', [['Partas Pasay', 0, 0], ['Partas Vigan', 560, 950], ['Partas Laoag', 650, 1100], ['Partas Pagudpud', 740, 1250]], ['18:00'], dlx, 'Deluxe', ['Air conditioning', 'Restroom / CR', 'USB charging ports', 'Emergency equipment']],
    ['PT-BAG', 'Cubao – Baguio', [['Partas Cubao', 0, 0], ['Partas Baguio', 300, 760]], ['06:00', '13:00'], dlx, 'Deluxe', ['Air conditioning', 'Restroom / CR', 'USB charging ports', 'Emergency equipment']],
  ] as [string, string, [string, number, number][], string[], string, string, string[]][]) {
    const st = stops.map(([n, off, fare], i) => ({ station_id: null, name: n, offset_min: off, fare, boarding: i < stops.length - 1, alighting: i > 0 }));
    const { rows: [r] } = await c.query<{ id: string }>(`insert into routes (org_id, code, name, category_id, stops, itinerary, data_sources) values ($1,$2,$3,'provincial',$4,$5,$6) returning id`,
      [partas.id, code, name, JSON.stringify(st), JSON.stringify(code === 'PT-BAG' ? TPLEX.slice(0, 3) : TPLEX), JSON.stringify([PARTAS_SRC, PARTAS_IND])]);
    for (const t of times) await c.query(`insert into schedules (org_id, route_id, code, departure, layout_id, class_name, amenity_ids, data_sources, valid_from) values ($1,$2,$3,$4,$5,$6,$7,$8,'2026-11-01')`,
      [partas.id, r.id, `${code}-${t.replace(':', '')}`, t, layout, cls, ids(amenities), JSON.stringify([PARTAS_IND])]);
  }

  // EDSA Carousel: a city busway. Walk-up only; shown as a train-style line.
  const { rows: [ec] } = await c.query<{ id: string }>(`insert into organizations (kind, name, slug, is_demo, data_sources) values ('bus_operator','EDSA Carousel (busway consortia)','edsa-carousel',true,$1)
     on conflict (slug) do update set name = excluded.name returning id`, [JSON.stringify([CAROUSEL_SRC, CAROUSEL_IND])]);
  const { rows: [ecl] } = await c.query<{ id: string }>(`insert into seat_layouts (org_id, name, seats) values ($1,'City bus 2+2, 45 seats',$2) on conflict (org_id, name) do update set name = excluded.name returning id`, [ec.id, JSON.stringify(layoutFor('regular', 45))]);
  const cstops = CAROUSEL.map((n, i) => ({ station_id: null, name: n, offset_min: i * 4, fare: Math.round(i * 2.6), boarding: i < CAROUSEL.length - 1, alighting: i > 0 }));
  const { rows: [cr] } = await c.query<{ id: string }>(`insert into routes (org_id, code, name, category_id, stops, itinerary, data_sources, min_fare) values ($1,'C1','EDSA Carousel (Route 1): Monumento – PITX','city',$2,$3,$4,15) returning id`,
    [ec.id, JSON.stringify(cstops), JSON.stringify([{ type: 'city', name: 'EDSA Busway (median lane)', from: 'Monumento', to: 'Taft Avenue', toll: false }, { type: 'city', name: 'Macapagal Boulevard', from: 'Roxas Boulevard', to: 'PITX', toll: false }]), JSON.stringify([CAROUSEL_SRC, CAROUSEL_IND])]);
  for (let m = 0; m < 24 * 60; m += 30) {
    const t = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    await c.query(`insert into schedules (org_id, route_id, code, departure, layout_id, class_name, amenity_ids, data_sources, valid_from) values ($1,$2,$3,$4,$5,'City bus (aircon)',$6,$7,'2026-11-01')`,
      [ec.id, cr.id, `C1-${t.replace(':', '')}`, t, ecl.id, ids(['Air conditioning', 'Emergency equipment']), JSON.stringify([CAROUSEL_IND])]);
  }

  // Demo shipping operator (fictional) with daily sailings for 30 days from seeding.
  const { rows: [ship] } = await c.query<{ id: string }>(`insert into organizations (kind, name, slug, is_demo, data_sources) values ('shipping_operator','PINASBUS Demo Ferries','demo-ferries',true,$1)
     on conflict (slug) do update set name = excluded.name returning id`, [JSON.stringify([{ url: '', verified_at: '2026-11-24', what: 'Fictional operator; vessels and sailings are demonstration data', verified: false }])]);
  for (const [vname, slots, from, to, times, minutes] of [
    ['MV Demo Catanduanes', 12, 'Tabaco Pier', 'San Andres', ['05:00', '12:30'], 210], ['MV Demo Masbate', 10, 'Pilar Port', 'Masbate City', ['04:00', '12:00'], 180],
    ['MV Demo Samar', 16, 'Matnog Port', 'Allen', ['02:00', '06:00', '10:00', '14:00', '18:00', '22:00'], 90],
  ] as [string, number, string, string, string[], number][]) {
    const { rows: [v] } = await c.query<{ id: string }>(`insert into vessels (org_id, name, registration, vehicle_slots, passenger_capacity) values ($1,$2,'DEMO',$3,400) returning id`, [ship.id, vname, slots]);
    for (const t of times)
      await c.query(`insert into sailings (org_id, vessel_id, from_port, to_port, departs_at, arrives_at)
         select $1, $2, $3, $4, ((current_date + n) + $5::time) at time zone 'Asia/Manila', ((current_date + n) + $5::time) at time zone 'Asia/Manila' + make_interval(mins => $6)
           from generate_series(0, 29) n on conflict do nothing`, [ship.id, v.id, from, to, t, minutes]);
  }

  // Demo card issuer (fictional) with a program and inventory.
  const { rows: [iss] } = await c.query<{ id: string }>(`insert into organizations (kind, name, slug, is_demo, data_sources) values ('card_issuer','PINAS Card (demo issuer)','pinas-card',true,$1)
     on conflict (slug) do update set name = excluded.name returning id`, [JSON.stringify([{ url: '', verified_at: '2026-11-24', what: 'Fictional card issuer for demonstration', verified: false }])]);
  const { rows: [prog] } = await c.query<{ id: string }>(`insert into card_programs (org_id, name, prefix, min_load_centavos, max_balance_centavos) values ($1,'Commuter card','8800',10000,1000000) returning id`, [iss.id]);
  const { newCardNumber } = await import('./cards.ts');
  for (let i = 0; i < 30; i++) await c.query(`insert into cards (org_id, program_id, number, status) values ($1,$2,$3,'inventory') on conflict do nothing`, [iss.id, prog.id, newCardNumber('8800')]);
}

const DEMO_ACCOUNTS_V2: { email: string; name: string; org: string; role: Role }[] = [
  { email: 'shipping.admin@demo-ferries.demo.pinasbus.test', name: 'Ferries shipping admin', org: 'demo-ferries', role: 'shipping_admin' },
  { email: 'vessel.operator@demo-ferries.demo.pinasbus.test', name: 'Ferries vessel operator', org: 'demo-ferries', role: 'vessel_operator' },
  { email: 'card.admin@pinas-card.demo.pinasbus.test', name: 'PINAS Card admin', org: 'pinas-card', role: 'card_admin' },
  { email: 'company.admin@partas.demo.pinasbus.test', name: 'Partas company admin', org: 'partas', role: 'company_admin' },
  { email: 'company.admin@edsa-carousel.demo.pinasbus.test', name: 'Carousel company admin', org: 'edsa-carousel', role: 'company_admin' },
];

async function seedAccountsV2(c: PoolClient) {
  const pw = process.env.DEMO_PASSWORD;
  if (!pw || pw.length < 12) return;
  const hash = await hashPassword(pw);
  for (const a of DEMO_ACCOUNTS_V2) {
    const { rows: [u] } = await c.query<{ id: string }>(`insert into users (email, name, phone, password_hash, must_change_password) values ($1,$2,'09170000000',$3,true)
      on conflict ((lower(email))) do update set name = excluded.name returning id`, [a.email, a.name, hash]);
    await c.query(`insert into memberships (user_id, org_id, role) select $1, id, $3 from organizations where slug = $2 on conflict do nothing`, [u.id, a.org, a.role]);
  }
  // Give the regular demo passenger a loaded card.
  const { rows: [p] } = await c.query<{ id: string; name: string }>(`select id, name from users where email = 'passenger.regular@demo.pinasbus.test'`);
  if (p) {
    const { rows: [card] } = await c.query<{ id: string }>(`update cards set user_id = $1, holder_name = $2, status = 'active', balance_centavos = 100000
       where id = (select id from cards where status = 'inventory' and org_id = (select id from organizations where slug = 'pinas-card') limit 1) returning id`, [p.id, p.name]);
    if (card) await c.query(`insert into card_ledger (card_id, kind, amount_centavos, balance_after, reference, channel) values ($1,'adjustment',100000,100000,'DEMO-OPENING','demo opening balance')`, [card.id]);
  }
}

/** Deletes demo companies (with their trips, bookings, fleets) and demo accounts, then seeds everything again. */
export async function resetDemoData(c: PoolClient) {
  await c.query(`delete from bookings where org_id in (select id from organizations where is_demo)`);
  await c.query(`delete from ferry_links l using sailings s where s.id = l.sailing_id and s.org_id in (select id from organizations where is_demo)`);
  await c.query(`delete from users where email like '%.demo.pinasbus.test' or email like '%@demo.pinasbus.test'`);
  await c.query(`delete from organizations where is_demo`);
  await seedDemo(c);
}

export async function seedDemoV2(c: PoolClient) {
  await seedV2(c);
  await seedAccountsV2(c);
  await c.query(`insert into settings (key, value) values ('demo_version', $1) on conflict (key) do update set value = $1`, [JSON.stringify(DEMO_VERSION)]);
}
