// Multimodal trips: bus trips linked to ferry sailings run by shipping operators. The bus side and the shipping side
// only meet through ferry_links, so more shipping companies can join without touching the bus modules.
import { randomBytes } from 'node:crypto';
import { q, tx } from './db.ts';
import { notify } from './notify.ts';

export const LINK_STATUSES = {
  reserved: 'Ferry booked',
  approaching: 'Approaching the port',
  waiting: 'Waiting to board',
  boarding: 'Boarding the vessel',
  on_vessel: 'On the vessel',
  sailing: 'Sailing',
  disembarked: 'Off the vessel',
  continuing: 'Continuing by road',
  cancelled: 'Cancelled',
} as const;
export type LinkStatus = keyof typeof LINK_STATUSES;

/** Who may move a link to which status: bus crew around the port, shipping staff on board. */
export const CREW_STEPS: LinkStatus[] = ['approaching', 'waiting', 'continuing'];
export const SHIP_STEPS: LinkStatus[] = ['waiting', 'boarding', 'on_vessel', 'sailing', 'disembarked', 'cancelled'];
export const nextSteps = (s: LinkStatus): LinkStatus[] => {
  const order: LinkStatus[] = ['reserved', 'approaching', 'waiting', 'boarding', 'on_vessel', 'sailing', 'disembarked', 'continuing'];
  const i = order.indexOf(s);
  return i < 0 ? [] : order.slice(i + 1, i + 3);
};

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const code = (n: number) => [...randomBytes(n)].map((b) => ALPHABET[b % 32]).join('');

export type Link = { id: string; trip_id: string; sailing_id: string; reference: string; qr_token: string; status: LinkStatus;
  vessel: string; from_port: string; to_port: string; departs_at: Date; arrives_at: Date; sailing_status: string; ship_org_id: string; ship_org: string;
  bus_org_id: string; bus_org: string; route: string; trip_code: string; plate: string | null; driver_id: string | null; conductor_id: string | null };

const LINK_SQL = `
  select l.id, l.trip_id, l.sailing_id, l.reference, l.qr_token, l.status, v.name vessel, s.from_port, s.to_port, s.departs_at, s.arrives_at,
         s.status sailing_status, s.org_id ship_org_id, so.name ship_org, t.org_id bus_org_id, bo.name bus_org, r.name route, sc.code trip_code,
         b.plate, t.driver_id, t.conductor_id
    from ferry_links l join sailings s on s.id = l.sailing_id join vessels v on v.id = s.vessel_id join organizations so on so.id = s.org_id
    join trips t on t.id = l.trip_id join organizations bo on bo.id = t.org_id join schedules sc on sc.id = t.schedule_id join routes r on r.id = sc.route_id
    left join buses b on b.id = t.bus_id`;

export const linkByToken = async (token: string) => (await q<Link>(`${LINK_SQL} where l.qr_token = $1`, [token]))[0] ?? null;
export const linksForTrip = (tripId: string) => q<Link>(`${LINK_SQL} where l.trip_id = $1 order by s.departs_at`, [tripId]);
export const linksForSailing = (sailingId: string) => q<Link>(`${LINK_SQL} where l.sailing_id = $1 order by l.created_at`, [sailingId]);

/** Sailings a trip could connect to: same departure port as the route's ferry leg, after the bus leaves, with deck space. */
export async function candidateSailings(trip: { departs_at: Date; itinerary: { type: string; from: string }[] }) {
  const ports = trip.itinerary.filter((l) => l.type === 'ferry').map((l) => l.from);
  if (!ports.length) return [];
  return q<{ id: string; vessel: string; operator: string; from_port: string; to_port: string; departs_at: Date; free: number }>(
    `select s.id, v.name vessel, o.name operator, s.from_port, s.to_port, s.departs_at,
            v.vehicle_slots - (select count(*) from ferry_links l where l.sailing_id = s.id and l.status <> 'cancelled')::int free
       from sailings s join vessels v on v.id = s.vessel_id join organizations o on o.id = s.org_id
      where s.from_port = any($1) and s.status in ('scheduled', 'delayed') and o.status = 'active'
        and s.departs_at between $2::timestamptz and $2::timestamptz + interval '36 hours' order by s.departs_at`, [ports, trip.departs_at]);
}

export async function linkSailing(tripId: string, sailingId: string, actorId: string) {
  return tx(async (c) => {
    // lock the sailing row so two dispatchers can't take the last deck slot
    const { rows: [s] } = await c.query<{ slots: number; used: number }>(
      `select v.vehicle_slots slots, (select count(*) from ferry_links l where l.sailing_id = s.id and l.status <> 'cancelled')::int used
         from sailings s join vessels v on v.id = s.vessel_id where s.id = $1 for update of s`, [sailingId]);
    if (!s) return { error: 'Sailing not found.' };
    if (s.used >= s.slots) return { error: 'No vehicle space left on that sailing.' };
    const { rows: [l] } = await c.query<{ id: string; reference: string }>(
      `insert into ferry_links (trip_id, sailing_id, reference, qr_token) values ($1,$2,$3,$4) on conflict (trip_id, sailing_id) do nothing returning id, reference`,
      [tripId, sailingId, 'FR' + code(8), randomBytes(24).toString('base64url')]);
    if (!l) return { error: 'This trip is already booked on that sailing.' };
    await c.query(`insert into ferry_events (link_id, status, note, actor_id) values ($1, 'reserved', 'Reservation made', $2)`, [l.id, actorId]);
    return { reference: l.reference };
  });
}

export async function setLinkStatus(link: Link, status: LinkStatus, note: string, actorId: string | null) {
  await q('update ferry_links set status = $2 where id = $1', [link.id, status]);
  await q('insert into ferry_events (link_id, status, note, actor_id) values ($1,$2,$3,$4)', [link.id, status, note.slice(0, 200), actorId]);
  await q(`insert into audit_log (actor_id, org_id, action, entity, entity_id, data) values ($1,$2,'ferry.status','ferry_link',$3,$4), ($1,$5,'ferry.status','ferry_link',$3,$4)`,
    [actorId, link.bus_org_id, link.reference, JSON.stringify({ status, note }), link.ship_org_id]);
  if (['boarding', 'sailing', 'disembarked', 'cancelled'].includes(status)) await notifyTrip(link.trip_id, `Ferry update: ${LINK_STATUSES[status]}`, `${link.vessel}, ${link.from_port} to ${link.to_port}.${note ? ` ${note}` : ''}`);
}

/** Tell every paid passenger of a trip (in-app and email). */
export async function notifyTrip(tripId: string, title: string, body: string) {
  const rows = await q<{ user_id: string | null; email: string; ref: string }>(`select user_id, email, ref from bookings where trip_uuid = $1 and status = 'paid'`, [tripId]);
  for (const b of rows) await notify({ userIds: [b.user_id], emails: [b.email] }, { kind: 'trip.update', title, body, link: `/track/${tripId}` });
}

/** A sailing status change moves its buses along and tells their passengers. */
export async function setSailingStatus(sailingId: string, orgId: string, status: string, note: string, actorId: string) {
  const r = await q(`update sailings set status = $3, note = $4 where id = $1 and org_id = $2 returning id`, [sailingId, orgId, status, note.slice(0, 200)]);
  if (!r.length) return false;
  const links = await linksForSailing(sailingId);
  const map: Record<string, LinkStatus | null> = { boarding: 'boarding', sailing: 'sailing', arrived: 'disembarked', cancelled: 'cancelled', delayed: null, scheduled: null };
  for (const l of links) {
    if (l.status === 'cancelled' || l.status === 'continuing') continue;
    const next = map[status];
    if (status === 'sailing' && !['on_vessel', 'boarding'].includes(l.status)) continue; // a bus left on the pier doesn't sail
    if (next) await setLinkStatus(l, next, note, actorId);
    else if (status === 'delayed') await notifyTrip(l.trip_id, `Ferry delayed: ${l.vessel}`, `${l.from_port} to ${l.to_port}.${note ? ` ${note}` : ''}`);
  }
  return true;
}
