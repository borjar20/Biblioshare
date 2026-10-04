import Link from "next/link";
import {getTranslations} from "next-intl/server";
import {RouteMessages} from "@/components/route-messages";
import {getProfileExperiences,parseExperienceFilters} from "@/lib/experiences/queries";
import {ExperienceCard} from "@/components/experiences/experience-card";
import {ExperienceFiltersBar} from "@/components/experiences/experience-filters";
import {EmptyState} from "@/components/ui/empty-state";
import {buttonVariants} from "@/components/ui/button";
import {CompassIcon} from "@/components/ui/icons";
export async function ExperiencesTab({userId,viewerId,basePath,params,isOwner}:{userId:string;viewerId:string|null;basePath:string;params:Record<string,string|undefined>;isOwner:boolean}) {
  const t=await getTranslations("experiences"),filters=parseExperienceFilters(params),page=await getProfileExperiences(userId,{...filters,companion:undefined}),path=`${basePath}?tab=experiencias`;
  const more=new URLSearchParams({tab:"experiencias"});if(page.nextCursor)more.set("cursor",page.nextCursor);if(filters.kind)more.set("kind",filters.kind);if(filters.state&&filters.state!=="all")more.set("state",filters.state);
  return <RouteMessages ns={["experiences"]}><div className="space-y-6"><ExperienceFiltersBar filters={filters} people={[]} basePath={path}/>{page.items.length?<div className="grid items-stretch gap-5 sm:grid-cols-2">{page.items.map(e=><ExperienceCard key={e.id} experience={e} viewerId={viewerId}/>)}</div>:<EmptyState glyph={<CompassIcon className="h-7 w-7"/>} title={t("profileEmptyTitle")} message={t("profileEmptyMessage")} action={isOwner?<Link href="/experiencias/nueva" className={buttonVariants("primary","min-h-11")}>{t("new")}</Link>:undefined}/>} {page.nextCursor&&<Link href={`${basePath}?${more}`} className={buttonVariants("secondary","min-h-11")}>{t("more")}</Link>}</div></RouteMessages>;
}
