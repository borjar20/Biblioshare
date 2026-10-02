import { notFound } from "next/navigation";
import { getExperience } from "@/lib/experiences/queries";
import { RouteMessages } from "@/components/route-messages";
import { ExperienceDetail } from "@/components/experiences/experience-detail";
import { SHELL_APP } from "@/lib/ui/layout";
export const metadata={title:"Experiencia — Biblioshare"};
// Allow this RLS reader to block; the proxy checks access before HTTP streaming.
export const instant=false;
export default async function ExperiencePage({params}:{params:Promise<{id:string}>}) {
  const {id}=await params,experience=await getExperience(id);
  if(!experience) notFound();
  return <RouteMessages ns={["experiences","sagaEditor"]}><div className={`mx-auto w-full ${SHELL_APP} px-4 py-6 pb-24 sm:px-6 lg:px-8`}><ExperienceDetail experience={experience}/></div></RouteMessages>;
}
