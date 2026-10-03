"use client";
import {useId,useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {useTranslations} from "next-intl";
import {CheckIcon} from "@/components/ui/icons";
import {setMomentAttendance,setGuestAttendance} from "@/lib/experiences/participant-actions";
import type {ExperienceDetail,ExperienceMoment,ExperienceError,AttendanceState} from "@/lib/experiences/types";
function AttendanceChoices({label,value,disabled,onChange}:{label:string;value:AttendanceState;disabled:boolean;onChange:(state:AttendanceState)=>void}) {
  const t=useTranslations("experiences"),name=useId();
  return <fieldset disabled={disabled} className="min-w-0"><legend className="mb-2 text-xs text-muted-foreground">{label}</legend>
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">{(["planned","attended","skipped"] as const).map(state=><label key={state} className="relative cursor-pointer">
      <input type="radio" name={name} value={state} checked={value===state} onChange={()=>onChange(state)} className="peer sr-only"/>
      <span className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent peer-disabled:cursor-wait peer-disabled:opacity-60 ${value===state ? "border-foreground bg-foreground text-background" : "border-border bg-surface hover:bg-surface-muted"}`}>
        {value===state&&<CheckIcon aria-hidden className="h-3.5 w-3.5"/>}{t(`attendance.${state}`)}
      </span>
    </label>)}</div>
  </fieldset>;
}
export function MomentAttendance({experience:e,moment:m}:{experience:ExperienceDetail;moment:ExperienceMoment}) {
  const t=useTranslations("experiences"),router=useRouter(),[pending,start]=useTransition(),[error,setError]=useState<ExperienceError|null>(null);
  const own=e.participants.find(p=>p.userId===e.viewerId&&p.userId!==null),rows=e.attendance.filter(a=>a.momentId===m.id);
  function change(state:AttendanceState,guest?:string) {setError(null);start(async()=>{const result=guest ? await setGuestAttendance(m.id,guest,state) : await setMomentAttendance(m.id,state);if(!result.ok) setError(result.error);else router.refresh();});}
  return <div className="space-y-3">
    {e.canContribute&&own&&<AttendanceChoices label={t("ownAttendance",{name:m.title})} value={rows.find(a=>a.participantId===own.id)?.state??"planned"} disabled={pending} onChange={state=>change(state)}/>}
    <ul className="flex flex-wrap gap-x-4 gap-y-3 text-xs">{e.participants.filter(p=>p.id!==own?.id&&p.invitationState==="accepted").map(p=>{const state=rows.find(a=>a.participantId===p.id)?.state;if(!state) return null;const name=p.guestName??p.displayName??p.username??t("companion");return <li key={p.id} className="min-w-0">{e.canEdit&&p.userId===null ? <AttendanceChoices label={t("guestAttendance",{person:name,name:m.title})} value={state} disabled={pending} onChange={value=>change(value,p.id)}/> : <span className="inline-flex items-center gap-1.5 text-muted-foreground">{state==="attended"&&<CheckIcon aria-hidden className="h-3.5 w-3.5 text-green"/>}<span>{name}</span><span aria-hidden>·</span><span>{t(`attendance.${state}`)}</span></span>}</li>;})}</ul>
    {error&&<p role="alert" className="text-sm text-status-dropped">{t(`errors.${error}`)}</p>}
  </div>;
}
