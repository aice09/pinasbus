import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import QRCode from 'qrcode';
import { BAG_CATEGORIES, bagByTag } from '@/lib/baggage';
import { orgCtx } from '@/lib/tenancy';
import { PrintButton } from '@/components/PrintButton';

export const metadata: Metadata = { title: 'Bag tag' };

/** Printable tag. The QR holds the handler's lookup URL, so any phone camera opens the bag. */
export default async function Tag({ params }: { params: Promise<{ slug: string; tag: string }> }) {
  const { slug, tag } = await params;
  const c = await orgCtx(slug, 'baggage.manage');
  const bag = await bagByTag(tag);
  if (!bag || bag.org_id !== c.org.id) notFound();
  const url = `${process.env.PUBLIC_BASE_URL ?? 'https://pinasbus.phlopentech.org'}/ops/${slug}/baggage?tag=${bag.tag}`;
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 260, errorCorrectionLevel: 'M' });
  return (
    <article className="bagtag">
      <p className="bagtag-org">{c.org.name}</p>
      <p className="bagtag-route">{bag.pickup} → <strong>{bag.dropoff}</strong></p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qr} alt={`QR code for bag ${bag.tag}`} width={260} height={260} />
      <p className="bagtag-code mono">{bag.tag}</p>
      <p>{bag.passenger}, ticket {bag.ref}. {bag.weight_kg} kg, {BAG_CATEGORIES[bag.category]}.</p>
      <p className="no-print"><PrintButton label="Print tag" /></p>
    </article>
  );
}
