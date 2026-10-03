"use client";
import {useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {useTranslations} from "next-intl";
import {Button} from "@/components/ui/button";
import {ChevronDownIcon,UsersIcon} from "@/components/ui/icons";
import {SheetShell} from "@/components/saga/sheet-shell";
import {removeParticipant,setShareIdentity} from "@/lib/experiences/participant-actions";
import type {ExperienceOwnMembership,ExperienceError,ExperienceResult} from "@/lib/experiences/types";
export function ExperienceOwnMemberships({memberships}:{memberships:ExperienceOwnMembership[]}) {
  const t=useTranslations("experiences"),router=useRouter(),[leaving,setLeaving]=useState<ExperienceOwnMembership|null>(null),[pending,start]=useTransition(),[error,setError]=useState<ExperienceError|null>(null);
  if(!memberships.length)return null;
  function run(work:()=>Promise<ExperienceResult<unknown>>,done?:()=>void) {setError(null);start(async()=>{const result=await work();if(!result.ok)setError(result.error);else{done?.();router.refresh();}});}
  return <details className="group rounded-card border border-border bg-surface"><summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 p-4 text-sm"><UsersIcon aria-hidden className="h-4 w-4 shrink-0"/><span className="min-w-0 flex-1 font-medium">{t("album.manageMemberships")}</span><ChevronDownIcon aria-hidden className="h-4 w-4 shrink-0 group-open:rotate-180"/></summary><section className="space-y-4 px-5 pb-5"><h2 className="font-serif text-lg font-semibold">{t("outsideMemberships")}</h2><p className="text-sm text-muted-foreground">{t("outsideMembershipHint")}</p><ul className="divide-y divide-border">{memberships.map(m=><li key={m.participantId} className="space-y-3 py-4"><p className="font-medium">{m.title}</p><div className="flex flex-wrap gap-2">{m.shareIdentity&&<Button disabled={pending} variant="secondary" className="min-h-11" onClick={()=>run(()=>setShareIdentity(m.experienceId,false))}>{t("withdrawIdentity")}</Button>}<Button disabled={pending} variant="secondary" className="min-h-11" onClick={()=>{setError(null);setLeaving(m);}}>{t("leave")}</Button></div></li>)}</ul>{error&&!leaving&&<p role="alert" className="text-sm text-status-dropped">{t(`errors.${error}`)}</p>}{leaving&&<SheetShell title={t("leave")} onClose={()=>setLeaving(null)}><div className="space-y-4"><p className="font-medium">{leaving.title}</p><p>{t("outsideLeaveConfirm")}</p>{error&&<p role="alert" className="text-sm text-status-dropped">{t(`errors.${error}`)}</p>}<Button disabled={pending} variant="danger" className="min-h-11 w-full" onClick={()=>run(()=>removeParticipant(leaving.participantId),()=>setLeaving(null))}>{t("leave")}</Button></div></SheetShell>}</section></details>;
}
