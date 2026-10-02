import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { loginHref } from "@/lib/auth/safe-next";
import { PageHeader } from "@/components/ui/page-header";
import { SkeletonLine } from "@/components/ui/skeleton";
import { RouteMessages } from "@/components/route-messages";
import { ExperienceForm } from "@/components/experiences/experience-form";
export const metadata={title:"Nueva experiencia — Biblioshare"};
export default function NewExperiencePage() {return <div className="mx-auto w-full max-w-2xl space-y-6 px-4 py-6 pb-24 sm:px-6"><Suspense fallback={<SkeletonLine className="h-64 w-full"/>}><Content/></Suspense></div>;}
async function Content() {
  if(!await getCurrentUser()) redirect(loginHref("/experiencias/nueva"));
  const t=await getTranslations("experiences");
  return <RouteMessages ns={["experiences"]}><div className="space-y-6"><PageHeader title={t("new")} backHref="/experiencias" backLabel={t("back")}/><ExperienceForm/></div></RouteMessages>;
}
