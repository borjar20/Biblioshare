"use client";
import Link from "next/link";
import { useId,useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Select } from "@/components/ui/select";
import { ChevronDownIcon,SearchIcon } from "@/components/ui/icons";
import { MOMENT_KINDS,type ExperienceFilters,type ExperienceCompanion } from "@/lib/experiences/types";
export function ExperienceFiltersBar({filters,people,basePath="/experiencias"}:{filters:ExperienceFilters;people:ExperienceCompanion[];basePath?:string}) {
  const t=useTranslations("experiences"),router=useRouter(),panelId=useId();
  const [expanded,setExpanded]=useState(Boolean(filters.kind||filters.companion));
  function href(change:Partial<ExperienceFilters>) {
    const values={...filters,...change,cursor:undefined},params=new URLSearchParams(basePath.split("?")[1]);
    for(const [key,value] of Object.entries(values)) {params.delete(key);if(value&&value!=="all") params.set(key,String(value));}
    return `${basePath.split("?")[0]}${params.size ? `?${params}` : ""}`;
  }
  const companions=[...new Map(people.map(p=>[p.userId??p.id,p])).values()];
  return <div className="space-y-3 border-y border-border py-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><nav aria-label={t("state")} className="flex flex-wrap gap-1">
      {(["all","planned","lived","cancelled"] as const).map(state=><Link key={state} href={href({state})} aria-current={(filters.state??"all")===state ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-full px-3 text-sm ${(filters.state??"all")===state ? "bg-foreground text-background" : "text-muted-foreground hover:bg-surface-muted hover:text-foreground"}`}>{state==="lived" ? t("livedFilter") : state==="cancelled" ? t("cancelledFilter") : t(`states.${state}`)}</Link>)}
    </nav><button type="button" aria-expanded={expanded} aria-controls={panelId} onClick={()=>setExpanded(value=>!value)} className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm text-muted-foreground hover:bg-surface-muted hover:text-foreground"><SearchIcon aria-hidden className="h-4 w-4"/>{t("album.filterDetails")}<ChevronDownIcon aria-hidden className={`h-4 w-4 ${expanded ? "rotate-180" : ""}`}/></button></div>
    {expanded&&<div id={panelId} className="flex flex-wrap gap-2 pb-1">
      <Select aria-label={t("kind")} value={filters.kind??""} className="min-h-11 max-w-full" onChange={event=>router.push(href({kind:event.target.value as ExperienceFilters["kind"]}))}>
        <option value="">{t("allKinds")}</option>{MOMENT_KINDS.map(kind=><option key={kind} value={kind}>{t(`kinds.${kind}`)}</option>)}
      </Select>
      {(companions.length>0||filters.companion)&&<Select aria-label={t("companions")} value={filters.companion??""} className="min-h-11 max-w-full" onChange={event=>router.push(href({companion:event.target.value}))}>
        <option value="">{t("allCompanions")}</option>{companions.map(person=><option key={person.userId??person.id} value={person.userId??person.id}>{person.guestName??person.displayName??person.username??t("companion")}</option>)}
        {filters.companion&&!companions.some(p=>(p.userId??p.id)===filters.companion)&&<option value={filters.companion}>{t("companion")}</option>}
      </Select>}
      {(filters.kind||filters.companion)&&<Link href={href({kind:undefined,companion:undefined})} className="inline-flex min-h-11 items-center px-3 text-sm underline decoration-border underline-offset-4">{t("clearFilters")}</Link>}
    </div>}
  </div>;
}
