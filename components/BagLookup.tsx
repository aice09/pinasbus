'use client';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { Scanner } from './Scanner';

/** Scan a bag tag QR (it encodes a URL ending in ?tag=BG…) or type the tag; navigates to that bag. */
export function BagLookup({ slug, initial = '' }: { slug: string; initial?: string }) {
  const router = useRouter();
  const [tag, setTag] = useState(initial);
  const go = useCallback((v: string) => {
    const t = (v.match(/BG[A-Z2-9]{8}/i)?.[0] ?? v).toUpperCase().trim();
    setTag(t); router.push(`/ops/${slug}/baggage?tag=${encodeURIComponent(t)}`);
  }, [router, slug]);
  return (
    <form className="inline-form" onSubmit={(e) => { e.preventDefault(); go(tag); }}>
      <label className="field grow">Bag tag<input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="BG… or scan the tag" autoFocus /></label>
      <button className="btn" type="submit">Find bag</button>
      <Scanner onCode={go} label="Scan tag" />
    </form>
  );
}
