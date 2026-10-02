"use client";
import Link from "next/link";
import { useId,useState,useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Button,buttonVariants } from "@/components/ui/button";
import { ActionMenu } from "@/components/ui/action-menu";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SheetShell } from "@/components/saga/sheet-shell";
import { HOME_TWO_COL } from "@/lib/ui/layout";
import { deleteExperience } from "@/lib/experiences/actions";
import type { ExperienceDetail as Detail,ExperienceError } from "@/lib/experiences/types";
import { ExperienceDate } from "./experience-date";
import {ExperienceParticipants} from "./experience-participants";
import {MomentAttendance} from "./moment-attendance";
import {MomentFavorite} from "./moment-favorite";
import {ExperienceGallery} from "./experience-gallery";
export function ExperienceDetail({experience:e}:{experience:Detail}) {
  const t=useTranslations("experiences"),router=useRouter(),fieldId=useId();
  const [deleting,setDeleting]=useState(false),[error,setError]=useState<ExperienceError|null>(null),[pending,startTransition]=useTransition();
  return <div className="space-y-6">
    <PageHeader title={e.title} backHref="/experiencias" backLabel={t("back")} action={e.canEdit&&<ActionMenu label={t("experienceActions")} items={[{key:"delete",label:t("delete"),danger:true,onSelect:()=>setDeleting(true)}]}/>}/>
    <div className={HOME_TWO_COL}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground"><span className="rounded-full border border-border bg-surface px-3 py-1">{t(`states.${e.state}`)}</span><ExperienceDate startsOn={e.startsOn} endsOn={e.endsOn}/>{e.shape==="trip"&&<span>{t("trip")}</span>}</div>
        <ol className={e.shape==="trip" ? "space-y-5 border-l border-border pl-5" : "space-y-5"}>{e.moments.map((m,index)=><li key={m.id} className="relative rounded-2xl border border-border bg-surface p-5 sm:p-6">
          {e.shape==="trip"&&<span aria-hidden className="absolute -left-8 top-6 grid h-6 w-6 place-items-center rounded-full border border-border bg-background text-xs">{index+1}</span>}
          <p className="mb-2 text-xs text-muted-foreground">{t(`kinds.${m.kind}`)}</p><h2 className="font-serif text-xl font-semibold">{m.title}</h2>{m.placeLabel&&<p className="mt-2 text-sm">{m.placeLabel}</p>}<p className="mt-3 text-sm text-muted-foreground"><ExperienceDate startsOn={m.startsOn} endsOn={m.endsOn}/></p>
          <MomentAttendance experience={e} moment={m}/><MomentFavorite experience={e} moment={m}/>
        </li>)}</ol>
        <ExperienceGallery experience={e}/>
      </div>
      <aside className="mt-6 space-y-4 lg:sticky lg:top-20 lg:mt-0">
        {e.canEdit&&<Link href={`/experiencia/${e.id}/editar`} className={buttonVariants("secondary","min-h-11 w-full")}>{t("edit")}</Link>}
        <ExperienceParticipants experience={e}/>
      </aside>
    </div>
    {deleting&&<SheetShell title={t("delete")} onClose={()=>{setDeleting(false);setError(null);}}><form className="space-y-4" onSubmit={event=>{event.preventDefault();const confirmation=String(new FormData(event.currentTarget).get("confirmation")??"");setError(null);startTransition(async()=>{const result=await deleteExperience(e.id,confirmation);if(!result.ok) setError(result.error);else router.push("/experiencias");});}}>
      <p className="text-sm">{t("deleteConfirm",{name:e.title})}</p><Field label={t("confirmation")} htmlFor={fieldId}><Input id={fieldId} name="confirmation" required maxLength={160} className="min-h-11 w-full" autoComplete="off"/></Field>{error&&<p role="alert" className="text-sm text-status-dropped">{t(`errors.${error}`)}</p>}<Button variant="danger" disabled={pending} className="min-h-11 w-full" type="submit">{t("delete")}</Button>
    </form></SheetShell>}
  </div>;
}
