"use client";
import Link from "next/link";
import Image from "next/image";
import { useId,useState,useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ActionMenu } from "@/components/ui/action-menu";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SheetShell } from "@/components/saga/sheet-shell";
import { HOME_TWO_COL } from "@/lib/ui/layout";
import { ArrowLeftIcon,CalendarIcon } from "@/components/ui/icons";
import { deleteExperience } from "@/lib/experiences/actions";
import type { ExperienceDetail as Detail,ExperienceError } from "@/lib/experiences/types";
import { ExperienceDate } from "./experience-date";
import {ExperienceParticipants} from "./experience-participants";
import {MomentAttendance} from "./moment-attendance";
import {MomentFavorite} from "./moment-favorite";
import {ExperienceGallery} from "./experience-gallery";
import {ExperiencePublication} from "./experience-publication";
import {ExperienceReport} from "./experience-report";
import {MomentReviews} from "./moment-reviews";
import {ExperienceRating} from "./experience-rating";
import {ExperienceLivedAction} from "./experience-lived-action";
import { ExperienceArtwork,ExperienceKindIcon,ExperiencePeople } from "./experience-artwork";
import { MomentEditor,MomentActions } from "./moment-editor";
import { getExperienceCompanionNames } from "./experience-companion-names";
export function ExperienceDetail({experience:e}:{experience:Detail}) {
  const t=useTranslations("experiences"),router=useRouter(),fieldId=useId();
  const [deleting,setDeleting]=useState(false),[error,setError]=useState<ExperienceError|null>(null),[pending,startTransition]=useTransition();
  const kind=e.moments[0]?.kind??"other";
  const people=getExperienceCompanionNames(e.participants,e.viewerId,t("companion"));
  return <div className="space-y-7">
    <div className="flex items-center justify-between gap-3"><Link href="/experiencias" className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeftIcon aria-hidden className="h-4 w-4"/>{t("back")}</Link>{e.canEdit&&<ActionMenu label={t("experienceActions")} items={[{key:"edit",label:t("edit"),onSelect:()=>router.push(`/experiencia/${e.id}/editar`)},{key:"delete",label:t("delete"),danger:true,onSelect:()=>{setError(null);setDeleting(true);}}]}/>}</div>
    <header className="grid overflow-hidden rounded-card border border-border bg-surface shadow-card md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
      <div className="relative min-h-48 overflow-hidden bg-surface-muted md:min-h-64">{e.coverPhotoId ? <Image src={`/api/experience-photos/${e.coverPhotoId}`} alt="" fill unoptimized className="object-cover" sizes="(min-width:768px) 45vw, 100vw"/> : <ExperienceArtwork kind={kind} className="h-full w-full"/>}</div>
      <div className="flex min-w-0 flex-col justify-center gap-4 p-5 sm:p-7"><div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1.5"><ExperienceKindIcon kind={kind} className="h-3.5 w-3.5"/>{e.shape==="trip" ? t("trip") : t(`kinds.${kind}`)}</span><span className="inline-flex items-center gap-1.5"><span aria-hidden className={`h-1.5 w-1.5 rounded-full ${e.state==="lived" ? "bg-green" : e.state==="cancelled" ? "bg-status-dropped" : "bg-gold"}`}/>{t(`states.${e.state}`)}</span></div>
        <h1 className="break-words font-serif text-2xl font-semibold leading-tight lg:text-[28px]">{e.title}</h1>
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"><CalendarIcon aria-hidden className="h-4 w-4"/><ExperienceDate startsOn={e.startsOn} endsOn={e.endsOn}/>{e.shape==="single"&&e.moments[0]?.placeLabel&&<><span aria-hidden>·</span><span>{e.moments[0].placeLabel}</span></>}</p>
        <ExperienceRating rating={e.rating} size="md"/>
        <ExperienceLivedAction experience={e}/>
        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4"><ExperiencePeople people={e.participants}/><span className="text-sm text-muted-foreground">{people.length ? t("with",{names:people.slice(0,3).join(", ")}) : t("personal")}</span></div>
      </div>
    </header>
    <div className={HOME_TWO_COL}>
      <div className="min-w-0 space-y-7">
        <section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-serif text-xl font-semibold">{t(e.shape==="trip" ? "album.journey" : "album.memory")}</h2>{e.shape==="trip"&&<p className="mt-1 text-xs text-muted-foreground">{t("album.journeyHint")}</p>}</div>{e.canEdit&&<MomentEditor experience={e} variant="inline"/>}</div>
        <ol className={e.shape==="trip" ? "space-y-5 border-l border-border pl-5" : "space-y-5"}>{e.moments.map((m,index)=>{const photo=e.photos.find(p=>p.momentId===m.id);return <li key={m.id} id={`moment-${m.id}`} className="relative min-w-0 scroll-mt-24 rounded-card border border-border bg-surface p-4 sm:p-5">
          {e.shape==="trip"&&<span aria-hidden className="absolute -left-8 top-6 grid h-6 w-6 place-items-center rounded-full border border-border bg-background text-xs">{index+1}</span>}
          <div className="flex items-start gap-3"><div className="min-w-0 flex-1"><p className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground"><ExperienceKindIcon kind={m.kind} className="h-4 w-4"/>{t(`kinds.${m.kind}`)}</p><h3 className="break-words font-serif text-xl font-semibold">{m.title}</h3>{m.placeLabel&&<p className="mt-2 text-sm text-muted-foreground">{m.placeLabel}</p>}<p className="mt-2 text-xs text-muted-foreground"><ExperienceDate startsOn={m.startsOn} endsOn={m.endsOn}/></p></div>{e.canEdit&&<MomentActions experience={e} moment={m} index={index}/>}</div>
          {photo&&<a href="#experience-photos" className="relative mt-4 block overflow-hidden rounded-cover"><Image src={`/api/experience-photos/${photo.id}`} alt={t("photoAlt",{name:m.title})} width={1000} height={700} unoptimized className="max-h-64 w-full object-cover"/></a>}
          <div className="mt-4 space-y-3 border-t border-border pt-4"><MomentAttendance experience={e} moment={m}/><MomentFavorite experience={e} moment={m}/><MomentReviews experience={e} moment={m}/></div>
        </li>;})}</ol></section>
        <ExperienceGallery experience={e}/>
      </div>
      <aside className="min-w-0 space-y-4 lg:sticky lg:top-20 lg:self-start">
        <ExperienceParticipants experience={e}/>
        <ExperiencePublication experience={e}/>
        {e.viewerId&&e.viewerId!==e.creatorId&&e.interactionTargetId&&<ExperienceReport id={e.id}/>}
      </aside>
    </div>
    {deleting&&<SheetShell title={t("delete")} onClose={()=>{setDeleting(false);setError(null);}}><form className="space-y-4" onSubmit={event=>{event.preventDefault();const confirmation=String(new FormData(event.currentTarget).get("confirmation")??"");setError(null);startTransition(async()=>{const result=await deleteExperience(e.id,confirmation);if(!result.ok) setError(result.error);else router.push("/experiencias");});}}>
      <p className="text-sm">{t("deleteConfirm",{name:e.title})}</p><Field label={t("confirmation")} htmlFor={fieldId}><Input id={fieldId} name="confirmation" required maxLength={160} className="min-h-11 w-full" autoComplete="off"/></Field>{error&&<p role="alert" className="text-sm text-status-dropped">{t(`errors.${error}`)}</p>}<Button variant="danger" disabled={pending} className="min-h-11 w-full" type="submit">{t("delete")}</Button>
    </form></SheetShell>}
  </div>;
}
