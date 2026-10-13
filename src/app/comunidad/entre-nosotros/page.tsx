import type { Metadata } from 'next';
import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { createClient, getCurrentUser } from '@/lib/supabase/server';
import { loginHref } from '@/lib/auth/safe-next';
import { listEntry } from '@/lib/comparisons/groups';
import { Explorer } from '@/components/comparisons/explorer';
import { SkeletonLine } from '@/components/ui/skeleton';

export const metadata: Metadata = { title: 'Entre nosotros — Biblioshare' };
export default function ComparisonPage() {
  return <Suspense fallback={<div className="dark fixed inset-0 bg-[#1d1713] p-6"><SkeletonLine className="h-8 w-48"/></div>}><ComparisonContent/></Suspense>;
}
async function ComparisonContent() {
  const user = await getCurrentUser();
  if (!user) redirect(loginHref('/comunidad/entre-nosotros'));
  const client = await createClient();
  const { groups: initialGroups, candidates } = await listEntry(client, user.id);
  return <Explorer initialGroups={initialGroups} candidates={candidates} viewerId={user.id}/>;
}
