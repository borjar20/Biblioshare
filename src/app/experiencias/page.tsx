import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { loginHref } from "@/lib/auth/safe-next";
import { getExperiences,getExperienceInvitations,getExperienceOwnPhotos,getExperienceCompanions,getExperienceOwnMemberships,parseExperienceFilters } from "@/lib/experiences/queries";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { CompassIcon,PlusIcon } from "@/components/ui/icons";
import { buttonVariants } from "@/components/ui/button";
import { SkeletonLine } from "@/components/ui/skeleton";
import { RouteMessages } from "@/components/route-messages";
import { ExperienceCard } from "@/components/experiences/experience-card";
import { ExperienceArtwork } from "@/components/experiences/experience-artwork";
import { MOMENT_KINDS } from "@/lib/experiences/types";
import { ExperienceFiltersBar } from "@/components/experiences/experience-filters";
import {ExperienceInvitations} from "@/components/experiences/experience-invitations";
import {ExperienceOwnPhotos} from "@/components/experiences/experience-own-photos";
import {ExperienceOwnMemberships} from "@/components/experiences/experience-own-memberships";
import { SHELL_APP } from "@/lib/ui/layout";
export const metadata:Metadata={title:"Experiencias — Biblioshare"};
export default function ExperiencesPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  return <div className={`mx-auto w-full ${SHELL_APP} px-4 py-6 pb-24 sm:px-6 lg:px-8`}><Suspense fallback={<SkeletonLine className="h-64 w-full"/>}><Content searchParams={searchParams}/></Suspense></div>;
}
async function Content({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const user=await getCurrentUser();if(!user) redirect(loginHref("/experiencias"));
  const [params,t]=await Promise.all([searchParams,getTranslations("experiences")]);
  const filters=parseExperienceFilters(params),[page,invitations,ownPhotos,companions,memberships]=await Promise.all([getExperiences(filters),getExperienceInvitations(),getExperienceOwnPhotos(typeof params.photosCursor==="string" ? params.photosCursor : undefined),getExperienceCompanions(),getExperienceOwnMemberships()]);
  const filtered=filters.state!=="all"||Boolean(filters.kind||filters.companion);
  const more=new URLSearchParams();for(const [key,value] of Object.entries({...filters,cursor:page.nextCursor})) if(value&&value!=="all") more.set(key,value);
  return <RouteMessages ns={["experiences","sagaEditor"]}><div className="space-y-7"><div className="space-y-3"><PageHeader title={t("title")} action={<Link href="/experiencias/nueva" className={buttonVariants("primary","min-h-11")}><PlusIcon aria-hidden className="h-4 w-4"/>{t("new")}</Link>}/><p className="max-w-xl text-sm text-muted-foreground">{t("intro")}</p></div>
    <ExperienceInvitations invitations={invitations}/>
    <section aria-labelledby="experience-start-title" className="space-y-3"><div><h2 id="experience-start-title" className="font-serif text-xl font-semibold">{t("album.startPrompt")}</h2><p className="mt-1 text-xs text-muted-foreground">{t("album.startHint")}</p></div><div className="grid grid-cols-3 gap-2 sm:grid-cols-6">{MOMENT_KINDS.map(kind=><Link key={kind} href={`/experiencias/nueva?kind=${kind}`} className="group min-w-0 overflow-hidden rounded-cover border border-border bg-surface transition-colors hover:border-foreground-soft"><ExperienceArtwork kind={kind} compact className="h-20"/><span className="flex min-h-11 items-center justify-center px-2 text-center text-xs font-medium group-hover:text-accent">{t(`kinds.${kind}`)}</span></Link>)}</div></section>
    <ExperienceFiltersBar filters={filters} people={companions}/>
    {page.items.length ? <div className="grid items-stretch gap-5 sm:grid-cols-2 lg:grid-cols-3">{page.items.map(experience=><ExperienceCard key={experience.id} experience={experience}/>)}</div> : <EmptyState glyph={<CompassIcon className="h-7 w-7"/>} title={filtered ? t("filteredEmpty") : t("emptyTitle")} message={!filtered ? t("emptyMessage") : undefined} action={filtered ? <Link href="/experiencias" className={buttonVariants("secondary","min-h-11")}>{t("clearFilters")}</Link> : undefined}/>}
    {page.nextCursor&&<div className="text-center"><Link href={`/experiencias?${more}`} className={buttonVariants("secondary","min-h-11")}>{t("more")}</Link></div>}
    <div className="space-y-3"><ExperienceOwnMemberships memberships={memberships}/><ExperienceOwnPhotos page={ownPhotos}/></div>
  </div></RouteMessages>;
}
