import type { Metadata } from 'next';
import { requirePlatformAdmin } from '@/lib/auth';
import { AuditTable } from '@/components/AuditTable';

export const metadata: Metadata = { title: 'Audit log' };

export default async function Audit() {
  await requirePlatformAdmin();
  return (
    <>
      <h1 className="page-h">Audit log</h1>
      <p className="lead">Every administrative change and automatic seat release across the platform, newest first.</p>
      <AuditTable />
    </>
  );
}
