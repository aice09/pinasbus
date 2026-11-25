import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { longDay } from '@/lib/catalog';
import { tripById } from '@/lib/trips';
import { Itinerary } from '@/components/Itinerary';
import { TrackMap } from '@/components/TrackMap';
import { liveryOf } from '@/lib/livery';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Track the bus', robots: { index: false } };

export default async function Track({ params }: { params: Promise<{ trip: string }> }) {
  const t = await tripById((await params).trip);
  if (!t) notFound();
  return (
    <main>
      <p className="trip-org">{t.org_name}</p>
      <h1 className="page-h">{t.route_name}</h1>
      <p className="note" style={{ fontSize: '1rem' }}>{t.class_name}, trip {t.code}. {longDay(t.service_date)}. Status: {t.status}.</p>
      <TrackMap tripId={t.id} livery={liveryOf(t.org_slug, t.org_settings)} />
      <section className="section tight" aria-labelledby="plan-h"><h2 id="plan-h">Planned route</h2><Itinerary trip={t} /></section>
      <p className="note">Positions come from the crew&apos;s phone or the bus&apos;s GPS when they report. When they don&apos;t, the map shows a clearly marked simulation based on the timetable. <Link href="/help">How tracking works</Link></p>
    </main>
  );
}
