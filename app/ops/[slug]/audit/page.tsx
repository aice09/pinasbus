import type { Metadata } from 'next';
import { orgCtx } from '@/lib/tenancy';
import { AuditTable } from '@/components/AuditTable';

export const metadata: Metadata = { title: 'Audit log' };

export default async function Audit({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const c = await orgCtx(slug, 'audit.view');
  return (
    <>
      <h1 className="page-h">Audit log</h1>
      <p className="lead">Every change made in {c.org.name}&apos;s workspace and every automatic priority-seat release, newest first.</p>
      <AuditTable orgId={c.org.id} />
    </>
  );
}
