import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { loginHref } from "@/lib/auth/safe-next";
import { PageHeader } from "@/components/ui/page-header";
import { SkeletonLine } from "@/components/ui/skeleton";
import { RouteMessages } from "@/components/route-messages";
import { ExperienceForm } from "@/components/experiences/experience-form";
import { MOMENT_KINDS, type MomentKind } from "@/lib/experiences/types";
export const metadata={title:"Nueva experiencia — Biblioshare"};
type SearchParams=Promise<{kind?:string|string[]}>;
export default function NewExperiencePage({searchParams}:{searchParams:SearchParams}) {return <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6 pb-24 sm:px-6"><Suspense fallback={<SkeletonLine className="h-64 w-full"/>}><Content searchParams={searchParams}/></Suspense></div>;}
async function Content({searchParams}:{searchParams:SearchParams}) {
  if(!await getCurrentUser()) redirect(loginHref("/experiencias/nueva"));
  const {kind}=await searchParams;
  const initialKind=typeof kind==="string"&&MOMENT_KINDS.includes(kind as MomentKind) ? kind as MomentKind : "other";
  const t=await getTranslations("experiences");
  return <RouteMessages ns={["experiences"]}><div className="space-y-6"><div className="space-y-3"><PageHeader title={t("new")} backHref="/experiencias" backLabel={t("back")}/><p className="max-w-lg text-sm leading-relaxed text-muted-foreground">{t("album.captureIntro")}</p></div><ExperienceForm initialKind={initialKind}/></div></RouteMessages>;
}
