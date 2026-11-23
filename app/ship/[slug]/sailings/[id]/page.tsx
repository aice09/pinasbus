import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { q } from '@/lib/db';
import { LINK_STATUSES, linksForSailing } from '@/lib/ferry';
import { orgCtx } from '@/lib/tenancy';

export const metadata: Metadata = { title: 'Vehicle manifest' };

export default async function Manifest({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const c = await orgCtx(slug);
  const [s] = await q<{ from_port: string; to_port: string; departs_at: Date; status: string; vessel: string }>(
    'select s.from_port, s.to_port, s.departs_at, s.status, v.name vessel from sailings s join vessels v on v.id = s.vessel_id where s.id = $1 and s.org_id = $2', [id, c.org.id]);
  if (!s) notFound();
  const links = await linksForSailing(id);
  const pax = links.length ? await q<{ trip_uuid: string; n: number }>(`select trip_uuid, sum(cardinality(seats))::int n from bookings where trip_uuid = any($1) and status = 'paid' group by 1`, [links.map((l) => l.trip_id)]) : [];
  return (
    <>
      <p className="note"><Link href={`/ship/${slug}`}>Back to sailings</Link></p>
      <h1 className="page-h">{s.vessel}: {s.from_port} → {s.to_port}</h1>
      <p className="note">{s.departs_at.toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}, {s.status}.</p>
      <div className="table-wrap">
        <table className="fares small">
          <thead><tr><th scope="col">Reservation</th><th scope="col">Bus company</th><th scope="col">Trip</th><th scope="col">Plate</th><th scope="col">Passengers</th><th scope="col">Status</th><th scope="col"><span className="sr-only">Scan</span></th></tr></thead>
          <tbody>{links.map((l) => (
            <tr key={l.id}><td className="mono">{l.reference}</td><td>{l.bus_org}</td><td>{l.trip_code}<br /><span className="note">{l.route}</span></td><td>{l.plate ?? 'unassigned'}</td>
              <td className="num">{pax.find((p) => p.trip_uuid === l.trip_id)?.n ?? 0}</td><td>{LINK_STATUSES[l.status]}</td>
              <td>{c.can('ships.operate') && <Link href={`/ferry/scan?token=${l.qr_token}`}>Record step</Link>}</td></tr>
          ))}</tbody>
        </table>
      </div>
      {links.length === 0 && <p className="note">No buses booked on this sailing yet.</p>}
      <p className="note">At the port, scan the bus&apos;s reservation QR with your phone camera to open it and record boarding, loading and unloading.</p>
    </>
  );
}
