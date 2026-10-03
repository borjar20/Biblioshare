"use client";
import {useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {useTranslations} from "next-intl";
import {Button} from "@/components/ui/button";
import {UsersIcon} from "@/components/ui/icons";
import {respondInvitation} from "@/lib/experiences/participant-actions";
import type {ExperienceInvitation,ExperienceError} from "@/lib/experiences/types";
import {ExperienceDate} from "./experience-date";
export function ExperienceInvitations({invitations}:{invitations:ExperienceInvitation[]}) {
  const t=useTranslations("experiences");
  if(!invitations.length) return null;
  return <section className="space-y-3"><h2 className="flex items-center gap-2 font-serif text-xl font-semibold"><UsersIcon aria-hidden className="h-5 w-5"/>{t("album.invitedPlans")}</h2><div className="grid gap-3 sm:grid-cols-2">{invitations.map(invitation=><Invitation key={invitation.participantId} invitation={invitation}/>)}</div></section>;
}
function Invitation({invitation:i}:{invitation:ExperienceInvitation}) {
  const t=useTranslations("experiences"),router=useRouter();
  const [pending,start]=useTransition(),[error,setError]=useState<ExperienceError|null>(null);
  function respond(response:"accept"|"decline") {setError(null);start(async()=>{const result=await respondInvitation(i.participantId,response);if(!result.ok) setError(result.error);else router.refresh();});}
  return <article className="relative overflow-hidden rounded-card border border-border bg-surface p-5"><div aria-hidden className="absolute inset-y-0 left-0 w-1 bg-accent"/><p className="text-xs text-muted-foreground">{t("invitedBy",{name:i.organizer.name})}</p><h3 className="mt-2 break-words font-serif text-xl font-semibold">{i.title}</h3><p className="mt-2 text-xs text-muted-foreground"><ExperienceDate startsOn={i.startsOn} endsOn={i.endsOn}/></p><p className="mt-3 max-w-md text-xs text-muted-foreground">{t("attendanceHint")}</p><div className="mt-4 flex flex-wrap gap-2"><Button className="min-h-11" disabled={pending} onClick={()=>respond("accept")}>{t("acceptInvitation")}</Button><Button variant="ghost" className="min-h-11" disabled={pending} onClick={()=>respond("decline")}>{t("declineInvitation")}</Button></div>{error&&<p role="alert" className="mt-3 text-sm text-status-dropped">{t(`errors.${error}`)}</p>}</article>;
}
