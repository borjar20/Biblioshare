"use client";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { CompassIcon } from "@/components/ui/icons";
import type { ExperiencePreview } from "@/lib/experiences/types";
import { ExperienceDate } from "./experience-date";
export function ExperienceCard({experience:e}:{experience:ExperiencePreview}) {
  const t=useTranslations("experiences");
  const people=e.participants.filter(p=>p.invitationState==="accepted"&&p.userId!==e.creatorId).map(p=>p.guestName??p.displayName??p.username).filter(Boolean);
  return <Link href={`/experiencia/${e.id}`} className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-surface transition-colors hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent">
    <div className="flex min-h-28 items-center justify-between bg-surface-muted px-5 py-4">
      <CompassIcon aria-hidden className="h-12 w-12 text-accent" />
      <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs">{e.shape==="trip" ? t("trip") : t(`kinds.${e.moments[0]?.kind??"other"}`)}</span>
    </div>
    <div className="flex flex-1 flex-col gap-3 p-5">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>{t(`states.${e.state}`)}</span><span aria-hidden>·</span><ExperienceDate startsOn={e.startsOn} endsOn={e.endsOn}/></div>
      <h2 className="font-serif text-xl font-semibold leading-snug group-hover:text-accent">{e.title}</h2>
      {e.shape==="trip"&&<p className="text-sm text-muted-foreground">{t("momentCount",{count:e.moments.length})}</p>}
      <p className="mt-auto pt-2 text-sm text-muted-foreground">{people.length ? t("with",{names:people.slice(0,3).join(", ")}) : t("personal")}</p>
    </div>
  </Link>;
}
