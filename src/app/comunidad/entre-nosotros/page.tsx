import type { Metadata } from 'next';
import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { createClient, getCurrentUser } from '@/lib/supabase/server';
import { loginHref } from '@/lib/auth/safe-next';
import { listCandidates, listGroups } from '@/lib/comparisons/groups';
import { Explorer } from '@/components/comparisons/explorer';
import { SkeletonLine } from '@/components/ui/skeleton';
import styles from '@/components/comparisons/explorer.module.css';

export const metadata: Metadata = { title: 'Entre nosotros — Biblioshare' };
export default function ComparisonPage() {
  return <Suspense fallback={<div className="mx-auto max-w-5xl px-4 py-8"><SkeletonLine className="h-8 w-48"/></div>}><ComparisonContent/></Suspense>;
}
async function ComparisonContent() {
  const user = await getCurrentUser();
  if (!user) redirect(loginHref('/comunidad/entre-nosotros'));
  const client = await createClient();
  const [initialGroups, candidates, t] = await Promise.all([listGroups(client), listCandidates(client, user.id), getTranslations('comparisons')]);
  return <div className={styles.page}>
    <Link href="/comunidad" className={styles.communityLink}>{t('backToCommunity')}</Link>
    <Explorer initialGroups={initialGroups} candidates={candidates} viewerId={user.id}/>
  </div>;
}
