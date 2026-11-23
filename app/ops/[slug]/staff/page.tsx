import type { Metadata } from 'next';
import { StaffManager } from '@/components/StaffManager';

export const metadata: Metadata = { title: 'Staff and roles' };

export default async function Staff({ params }: { params: Promise<{ slug: string }> }) {
  return <StaffManager slug={(await params).slug} />;
}
