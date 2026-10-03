import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { loginHref } from "@/lib/auth/safe-next";
import { ClubCreateToggle } from "@/components/clubs/club-create-toggle";
import { ClubSearch } from "@/components/clubs/club-search";
import { ClubLists } from "@/components/clubs/club-lists";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SkeletonCard, SkeletonLine } from "@/components/ui/skeleton";
import { SHELL_GRID } from "@/lib/ui/layout";
import { PeopleResults } from "@/app/buscar/people-results";

export const metadata: Metadata = { title: "Comunidad — Biblioshare" };
type CommunityProps = { searchParams: Promise<{ tab?: string; q?: string }> };

export default function CommunityPage(props: CommunityProps) {
  return <Suspense fallback={<CommunitySkeleton/>}><CommunityContent {...props}/></Suspense>;
}

async function CommunityContent({ searchParams }: CommunityProps) {
  const params = await searchParams;
  const user = await getCurrentUser();
  const people = params.tab === "personas";
  const query = typeof params.q === "string" ? params.q.trim() : "";
  if (!user) {
    const next = new URLSearchParams();
    if (people) next.set("tab", "personas");
    if (query) next.set("q", query);
    redirect(loginHref(`/comunidad${next.size ? `?${next}` : ""}`));
  }
  const t = await getTranslations("community");
  const tClub = await getTranslations("club");

  return <div className={`mx-auto flex w-full ${SHELL_GRID} flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8`}>
    {people ? <PageHeader title={t("title")}/> : <ClubCreateToggle userId={user.id} title={t("title")} createLabel={tClub("create")}/>}
    <nav aria-label={t("navigationLabel")} className="flex gap-5 border-b border-border">
      {([false, true] as const).map(isPeople => <Link key={String(isPeople)} href={isPeople ? "/comunidad?tab=personas" : "/comunidad"} aria-current={people === isPeople ? "page" : undefined} className={`inline-flex min-h-11 items-center border-b-2 py-2 font-serif text-base font-semibold ${people === isPeople ? "border-accent text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{t(isPeople ? "people" : "clubs")}</Link>)}
    </nav>
    {people ? <>
      <form key={query} action="/comunidad" className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <input type="hidden" name="tab" value="personas"/>
        <div className="flex min-w-0 flex-1 flex-col gap-2"><label htmlFor="community-person-search" className="text-sm font-medium">{t("findPeople")}</label><Input id="community-person-search" type="search" name="q" defaultValue={query} placeholder={t("searchPeoplePlaceholder")} maxLength={160} className="min-h-11 w-full"/></div>
        <Button type="submit" className="min-h-11">{t("searchPeople")}</Button>
      </form>
      <Suspense key={query} fallback={<SkeletonCard><SkeletonLine className="w-40"/></SkeletonCard>}><PeopleResults query={query}/></Suspense>
    </> : <>
      <ClubSearch placeholder={tClub("searchPlaceholder")} initialQuery={query} basePath="/comunidad"/>
      <Suspense key={query} fallback={<SkeletonCard><SkeletonLine className="w-40"/></SkeletonCard>}><ClubLists query={query}/></Suspense>
    </>}
  </div>;
}

function CommunitySkeleton() {
  return <div className={`mx-auto flex w-full ${SHELL_GRID} flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8`}><SkeletonLine className="h-7 w-40"/><SkeletonLine className="h-11 w-56"/><SkeletonCard><SkeletonLine className="w-48"/></SkeletonCard></div>;
}
