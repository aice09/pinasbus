import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import type { Shipment } from '@/lib/padala';
import { ShipmentList } from '@/components/Lists';

export const metadata: Metadata = { title: 'Your Padala' };

export default async function Padala() {
  const u = await requireUser('/account/padala');
  const items = await q<Shipment>(`select * from shipments where user_id = $1 and status <> 'cancelled' order by created_at desc limit 200`, [u.id]);
  return (
    <>
      <h1 className="page-h">Your Padala</h1>
      <p className="lead">Packages sent while signed in. Track one for its full timeline, or use Send again to reuse the route and recipient.</p>
      <ShipmentList items={items} />
    </>
  );
}
