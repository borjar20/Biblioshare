"use client";
import {useId,useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {useTranslations} from "next-intl";
import {CheckIcon} from "@/components/ui/icons";
import {Button} from "@/components/ui/button";
import {SheetShell} from "@/components/saga/sheet-shell";
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
  // Retirar la presencia de un momento reseñado borra la reseña: se confirma antes.
  // El servidor responde `conflict` (PT409) si existe una reseña propia que la RLS
  // aún oculta (experiencia no vivida) u otra pestaña la creó: mismo diálogo.
  const [pendingState,setPendingState]=useState<AttendanceState|null>(null),[dropError,setDropError]=useState<ExperienceError|null>(null);
  const ownReview=e.reviews.some(r=>r.isAuthor&&r.momentId===m.id);
  function change(state:AttendanceState,guest?:string) {
    setError(null);
    if(!guest&&state!=="attended"&&ownReview){setDropError(null);setPendingState(state);return;}
    start(async()=>{const result=guest ? await setGuestAttendance(m.id,guest,state) : await setMomentAttendance(m.id,state);if(result.ok) router.refresh();else if(!guest&&state!=="attended"&&result.error==="conflict"){setDropError(null);setPendingState(state);}else setError(result.error);});
  }
  function confirmDrop() {
    if(!pendingState) return;
    const state=pendingState;setDropError(null);
    start(async()=>{const result=await setMomentAttendance(m.id,state,true);if(result.ok){setPendingState(null);router.refresh();}else setDropError(result.error);});
  }
  return <div className="space-y-3">
    {e.canContribute&&own&&e.state==="lived"&&(rows.find(a=>a.participantId===own.id)?.state??"planned")==="planned"&&<p className="text-xs font-medium">{t("lived.confirmAttendance")}</p>}
    {e.canContribute&&own&&<AttendanceChoices label={t("ownAttendance",{name:m.title})} value={rows.find(a=>a.participantId===own.id)?.state??"planned"} disabled={pending} onChange={state=>change(state)}/>}
    <ul className="flex flex-wrap gap-x-4 gap-y-3 text-xs">{e.participants.filter(p=>p.id!==own?.id&&p.invitationState==="accepted").map(p=>{const state=rows.find(a=>a.participantId===p.id)?.state;if(!state) return null;const name=p.guestName??p.displayName??p.username??t("companion");return <li key={p.id} className="min-w-0">{e.canEdit&&p.userId===null ? <AttendanceChoices label={t("guestAttendance",{person:name,name:m.title})} value={state} disabled={pending} onChange={value=>change(value,p.id)}/> : <span className="inline-flex items-center gap-1.5 text-muted-foreground">{state==="attended"&&<CheckIcon aria-hidden className="h-3.5 w-3.5 text-green"/>}<span>{name}</span><span aria-hidden>·</span><span>{t(`attendance.${state}`)}</span></span>}</li>;})}</ul>
    {error&&<p role="alert" className="text-sm text-status-dropped">{t(`errors.${error}`)}</p>}
    {pendingState&&<SheetShell title={t("dropReview.title")} onClose={()=>setPendingState(null)}><p className="mb-4 text-sm">{t("dropReview.message",{name:m.title})}</p>{dropError&&<p role="alert" className="mb-4 text-sm text-status-dropped">{t(`errors.${dropError}`)}</p>}<Button variant="danger" className="min-h-11 w-full" disabled={pending} onClick={confirmDrop}>{t("dropReview.confirm")}</Button></SheetShell>}
  </div>;
}
