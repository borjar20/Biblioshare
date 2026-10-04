"use client";
import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ChevronRightIcon } from "@/components/ui/icons";
import type { ExperiencePreview } from "@/lib/experiences/types";
import { RatingDots } from "@/components/ui/rating-dots";
import { ExperienceDate } from "./experience-date";
import { ExperienceRating } from "./experience-rating";
import { ExperienceArtwork,ExperienceKindIcon,ExperiencePeople } from "./experience-artwork";
export function ExperienceCard({experience:e,variant="album",excerpt}:{experience:ExperiencePreview;variant?:"album"|"feed";excerpt?:{momentId:string;rating:number|null;body:string|null}}) {
  const t=useTranslations("experiences");
  const people=e.participants.filter(p=>p.invitationState==="accepted"&&p.userId!==e.creatorId).map(p=>p.guestName??p.displayName??p.username).filter(Boolean);
  const kind=e.moments[0]?.kind??"other";
  return <Link href={`/experiencia/${e.id}`} className={`group flex h-full min-w-0 flex-col bg-surface transition-colors ${variant==="feed" ? "rounded-cover" : "rounded-card border border-border p-2 shadow-card hover:border-foreground-soft"}`}>
    <div className="relative aspect-[16/10] overflow-hidden rounded-cover bg-surface-muted">
      {e.coverPhotoId ? <Image src={`/api/experience-photos/${e.coverPhotoId}`} alt="" fill unoptimized className="object-cover" sizes="(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw"/> : <ExperienceArtwork kind={kind} className="absolute inset-0 h-full w-full"/>}
      <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground"><ExperienceKindIcon kind={kind} className="h-3.5 w-3.5"/>{e.shape==="trip" ? t("trip") : t(`kinds.${kind}`)}</span>
      {e.shape==="trip"&&<span className="absolute bottom-3 right-3 rounded-full border border-border bg-surface px-2.5 py-1.5 text-xs text-foreground">{t("momentCount",{count:e.moments.length})}</span>}
    </div>
    <div className="flex flex-1 flex-col gap-3 px-3 pb-3 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1.5"><span aria-hidden className={`h-1.5 w-1.5 rounded-full ${e.state==="lived" ? "bg-green" : e.state==="cancelled" ? "bg-status-dropped" : "bg-gold"}`}/>{t(`states.${e.state}`)}</span><ExperienceRating rating={e.rating}/><ExperienceDate startsOn={e.startsOn} endsOn={e.endsOn}/></div>
      <h2 className="break-words font-serif text-xl font-semibold leading-snug group-hover:text-accent">{e.title}</h2>
      {e.shape==="single"&&e.moments[0]?.placeLabel&&<p className="text-sm text-muted-foreground">{e.moments[0].placeLabel}</p>}
      {excerpt&&(excerpt.body||excerpt.rating!==null)&&<div className="space-y-1.5 border-l-2 border-border pl-3">{excerpt.rating!==null&&<RatingDots value={excerpt.rating} size="sm"/>}<p className="line-clamp-3 text-sm text-muted-foreground">{excerpt.body??t("ratedOnly")}</p></div>}
      <div className="mt-auto flex items-center gap-3 border-t border-border pt-3"><ExperiencePeople people={e.participants} size="sm"/><p className="min-w-0 flex-1 text-xs text-muted-foreground">{people.length ? t("with",{names:people.slice(0,3).join(", ")}) : t("personal")}</p><ChevronRightIcon aria-hidden className="h-4 w-4 shrink-0 text-muted-foreground"/></div>
    </div>
  </Link>;
}
