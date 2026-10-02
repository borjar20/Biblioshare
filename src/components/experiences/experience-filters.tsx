"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Select } from "@/components/ui/select";
import { MOMENT_KINDS,type ExperienceFilters,type ExperiencePerson } from "@/lib/experiences/types";
export function ExperienceFiltersBar({filters,people,basePath="/experiencias"}:{filters:ExperienceFilters;people:ExperiencePerson[];basePath?:string}) {
  const t=useTranslations("experiences"),router=useRouter();
  function href(change:Partial<ExperienceFilters>) {
    const values={...filters,...change,cursor:undefined},params=new URLSearchParams(basePath.split("?")[1]);
    for(const [key,value] of Object.entries(values)) if(value&&value!=="all") params.set(key,value);
    return `${basePath.split("?")[0]}${params.size ? `?${params}` : ""}`;
  }
  const companions=[...new Map(people.filter(p=>p.invitationState==="accepted").map(p=>[p.userId??p.id,p])).values()];
  return <div className="flex flex-col gap-3">
    <nav aria-label={t("state")} className="flex flex-wrap gap-2">
      {(["all","planned","lived","cancelled"] as const).map(state=><Link key={state} href={href({state})} aria-current={(filters.state??"all")===state ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm ${(filters.state??"all")===state ? "border-foreground bg-foreground text-background" : "border-border bg-surface hover:bg-surface-muted"}`}>{state==="lived" ? t("livedFilter") : state==="cancelled" ? t("cancelledFilter") : t(`states.${state}`)}</Link>)}
    </nav>
    <div className="flex flex-wrap gap-2">
      <Select aria-label={t("kind")} value={filters.kind??""} className="min-h-11 max-w-full" onChange={event=>router.push(href({kind:event.target.value as ExperienceFilters["kind"]}))}>
        <option value="">{t("allKinds")}</option>{MOMENT_KINDS.map(kind=><option key={kind} value={kind}>{t(`kinds.${kind}`)}</option>)}
      </Select>
      {companions.length>0&&<Select aria-label={t("companions")} value={filters.companion??""} className="min-h-11 max-w-full" onChange={event=>router.push(href({companion:event.target.value}))}>
        <option value="">{t("allCompanions")}</option>{companions.map(person=><option key={person.userId??person.id} value={person.userId??person.id}>{person.guestName??person.displayName??person.username??t("companion")}</option>)}
      </Select>}
    </div>
  </div>;
}
