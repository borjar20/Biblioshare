import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { loginHref } from "@/lib/auth/safe-next";
import { getExperiences,getExperienceInvitations,parseExperienceFilters } from "@/lib/experiences/queries";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { CompassIcon } from "@/components/ui/icons";
import { buttonVariants } from "@/components/ui/button";
import { SkeletonLine } from "@/components/ui/skeleton";
import { RouteMessages } from "@/components/route-messages";
import { ExperienceCard } from "@/components/experiences/experience-card";
import { ExperienceFiltersBar } from "@/components/experiences/experience-filters";
import {ExperienceInvitations} from "@/components/experiences/experience-invitations";
import { SHELL_APP } from "@/lib/ui/layout";
export const metadata:Metadata={title:"Experiencias — Biblioshare"};
export default function ExperiencesPage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  return <div className={`mx-auto w-full ${SHELL_APP} px-4 py-6 pb-24 sm:px-6 lg:px-8`}><Suspense fallback={<SkeletonLine className="h-64 w-full"/>}><Content searchParams={searchParams}/></Suspense></div>;
}
async function Content({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const user=await getCurrentUser();if(!user) redirect(loginHref("/experiencias"));
  const [params,t]=await Promise.all([searchParams,getTranslations("experiences")]);
  const filters=parseExperienceFilters(params),[page,invitations]=await Promise.all([getExperiences(filters),getExperienceInvitations()]);
  const filtered=filters.state!=="all"||Boolean(filters.kind||filters.companion);
  const more=new URLSearchParams();for(const [key,value] of Object.entries({...filters,cursor:page.nextCursor})) if(value&&value!=="all") more.set(key,value);
  return <RouteMessages ns={["experiences","sagaEditor"]}><div className="space-y-6"><PageHeader title={t("title")} action={<Link href="/experiencias/nueva" className={buttonVariants("primary","min-h-11")}>{t("new")}</Link>}/><p className="max-w-xl text-sm text-muted-foreground">{t("intro")}</p><ExperienceFiltersBar filters={filters} people={page.items.flatMap(e=>e.participants).filter(p=>p.userId!==user.id)}/>
    {page.items.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{page.items.map(experience=><ExperienceCard key={experience.id} experience={experience}/>)}</div> : <EmptyState glyph={<CompassIcon className="h-7 w-7"/>} title={filtered ? t("filteredEmpty") : t("emptyTitle")} message={!filtered ? t("emptyMessage") : undefined} action={<Link href={filtered ? "/experiencias" : "/experiencias/nueva"} className={buttonVariants("secondary","min-h-11")}>{filtered ? t("clearFilters") : t("new")}</Link>}/>}
    <ExperienceInvitations invitations={invitations}/>
    {page.nextCursor&&<div className="text-center"><Link href={`/experiencias?${more}`} className={buttonVariants("secondary","min-h-11")}>{t("more")}</Link></div>}
  </div></RouteMessages>;
}
