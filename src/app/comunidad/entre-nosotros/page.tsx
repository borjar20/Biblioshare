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
import { SHELL_GRID } from '@/lib/ui/layout';

export const metadata: Metadata = { title: 'Entre nosotros — Biblioshare' };
export default function ComparisonPage() {
  return <Suspense fallback={<div className="mx-auto max-w-5xl px-4 py-8"><SkeletonLine className="h-8 w-48"/></div>}><ComparisonContent/></Suspense>;
}
async function ComparisonContent() {
  const user = await getCurrentUser();
  if (!user) redirect(loginHref('/comunidad/entre-nosotros'));
  const client = await createClient();
  const [initialGroups, candidates, t] = await Promise.all([listGroups(client), listCandidates(client, user.id), getTranslations('comparisons')]);
  return <div className={`mx-auto flex w-full ${SHELL_GRID} flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8`}>
    <Link href="/comunidad" className="self-start text-sm text-muted-foreground hover:text-foreground">{t('backToCommunity')}</Link>
    <header><h1 className="font-serif text-3xl font-semibold">{t('title')}</h1><p className="mt-2 max-w-2xl text-muted-foreground">{t('intro')}</p></header>
    <Explorer initialGroups={initialGroups} candidates={candidates} viewerId={user.id}/>
  </div>;
}
