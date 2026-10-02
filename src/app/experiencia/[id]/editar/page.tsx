import { notFound,redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { loginHref } from "@/lib/auth/safe-next";
import { getExperience } from "@/lib/experiences/queries";
import { PageHeader } from "@/components/ui/page-header";
import { RouteMessages } from "@/components/route-messages";
import { ExperienceForm } from "@/components/experiences/experience-form";
import { MomentEditor } from "@/components/experiences/moment-editor";
import { HOME_TWO_COL,SHELL_APP } from "@/lib/ui/layout";
export const metadata={title:"Editar experiencia — Biblioshare"};
export const instant=false;
export default async function EditExperiencePage({params}:{params:Promise<{id:string}>}) {
  const {id}=await params;if(!await getCurrentUser()) redirect(loginHref(`/experiencia/${id}/editar`));
  const experience=await getExperience(id);if(!experience?.canEdit) notFound();
  const t=await getTranslations("experiences");
  return <RouteMessages ns={["experiences","sagaEditor"]}><div className={`mx-auto w-full ${SHELL_APP} space-y-6 px-4 py-6 pb-24 sm:px-6 lg:px-8`}><PageHeader title={t("edit")} backHref={`/experiencia/${id}`} backLabel={experience.title}/><div className={HOME_TWO_COL}><ExperienceForm key={experience.revision} experience={experience}/><div className="mt-6 lg:mt-0"><MomentEditor experience={experience}/></div></div></div></RouteMessages>;
}
