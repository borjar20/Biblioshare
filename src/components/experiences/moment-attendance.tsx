"use client";
import {useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {useTranslations} from "next-intl";
import {Select} from "@/components/ui/select";
import {setMomentAttendance,setGuestAttendance} from "@/lib/experiences/participant-actions";
import type {ExperienceDetail,ExperienceMoment,ExperienceError,AttendanceState} from "@/lib/experiences/types";
export function MomentAttendance({experience:e,moment:m}:{experience:ExperienceDetail;moment:ExperienceMoment}) {
  const t=useTranslations("experiences"),router=useRouter(),[pending,start]=useTransition(),[error,setError]=useState<ExperienceError|null>(null);
  const own=e.participants.find(p=>p.userId===e.viewerId&&p.userId!==null),rows=e.attendance.filter(a=>a.momentId===m.id);
  function change(state:AttendanceState,guest?:string) {setError(null);start(async()=>{const result=guest ? await setGuestAttendance(m.id,guest,state) : await setMomentAttendance(m.id,state);if(!result.ok) setError(result.error);else router.refresh();});}
  return <div className="mt-4 space-y-3 border-t border-border pt-4">
    {e.canContribute&&own&&<label className="flex flex-wrap items-center justify-between gap-2 text-sm"><span>{t("ownAttendance",{name:m.title})}</span><Select aria-label={t("ownAttendance",{name:m.title})} value={rows.find(a=>a.participantId===own.id)?.state??"planned"} disabled={pending} className="min-h-11" onChange={event=>change(event.target.value as AttendanceState)}>{(["planned","attended","skipped"] as const).map(state=><option key={state} value={state}>{t(`attendance.${state}`)}</option>)}</Select></label>}
    <ul className="space-y-2 text-sm">{e.participants.filter(p=>p.id!==own?.id&&p.invitationState==="accepted").map(p=>{const state=rows.find(a=>a.participantId===p.id)?.state;if(!state) return null;const name=p.guestName??p.displayName??p.username??t("companion");return <li key={p.id} className="flex flex-wrap items-center justify-between gap-2"><span>{name}</span>{e.canEdit&&p.userId===null ? <Select aria-label={t("guestAttendance",{person:name,name:m.title})} value={state} disabled={pending} className="min-h-11" onChange={event=>change(event.target.value as AttendanceState,p.id)}>{(["planned","attended","skipped"] as const).map(s=><option key={s} value={s}>{t(`attendance.${s}`)}</option>)}</Select> : <span className="text-muted-foreground">{t(`attendance.${state}`)}</span>}</li>;})}</ul>
    {error&&<p role="alert" className="text-sm text-status-dropped">{t(`errors.${error}`)}</p>}
  </div>;
}
