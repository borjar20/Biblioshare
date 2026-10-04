"use client";
import {useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {useTranslations} from "next-intl";
import {Button,buttonVariants} from "@/components/ui/button";
import {SheetShell} from "@/components/saga/sheet-shell";
import {updateExperience} from "@/lib/experiences/actions";
import {setMomentAttendance} from "@/lib/experiences/participant-actions";
import type {ExperienceDetail,ExperienceError} from "@/lib/experiences/types";
// «Lo vivimos»: acción rápida del creador que pasa un plan a Vivida (conservando
// el resto de campos) y abre la hoja para confirmar a qué momentos fue.
export function ExperienceLivedAction({experience:e}:{experience:ExperienceDetail}) {
  const t=useTranslations("experiences"),router=useRouter();
  const [step,setStep]=useState<"closed"|"attendance"|"done">("closed"),[checked,setChecked]=useState<string[]>(e.moments.map(m=>m.id));
  const [error,setError]=useState<ExperienceError|null>(null),[pending,start]=useTransition();
  // Tras pasarla a Vivida, el botón no vuelve mientras llega el refresco con el estado nuevo.
  const [lived,setLived]=useState(false);
  if(!e.canEdit||((e.state!=="planned"||lived)&&step==="closed")) return null;
  const first=e.moments.find(m=>checked.includes(m.id));
  return <>
    {step==="closed"&&<Button className="min-h-11 self-start" disabled={pending} onClick={()=>{setError(null);start(async()=>{const r=await updateExperience(e.id,e.revision,{title:e.title,shape:e.shape,state:"lived",audience:e.audience,startsOn:e.startsOn,endsOn:e.endsOn});if(!r.ok) setError(r.error);else {setLived(true);setStep("attendance");}});}}>{t("lived.action")}</Button>}
    {error&&step==="closed"&&<div role="alert" className="space-y-2 text-sm text-status-dropped"><p>{t(`errors.${error}`)}</p>{error==="conflict"&&<Button variant="secondary" className="min-h-11" onClick={()=>router.refresh()}>{t("refresh")}</Button>}</div>}
    {step!=="closed"&&<SheetShell title={t("lived.title")} onClose={()=>{setStep("closed");router.refresh();}}>
      {step==="attendance"?<form className="space-y-4" onSubmit={event=>{event.preventDefault();setError(null);start(async()=>{for(const id of checked){const r=await setMomentAttendance(id,"attended");if(!r.ok){setError(r.error);return;}}setStep("done");router.refresh();});}}>
        <p className="text-sm text-muted-foreground">{t("lived.hint")}</p>
        <fieldset disabled={pending} className="space-y-1">{e.moments.map(m=><label key={m.id} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="h-5 w-5" checked={checked.includes(m.id)} onChange={event=>{const on=event.target.checked;setChecked(ids=>on?[...ids,m.id]:ids.filter(id=>id!==m.id));}}/>{m.title}</label>)}</fieldset>
        {error&&<p role="alert" className="text-sm text-status-dropped">{t(`errors.${error}`)}</p>}
        <Button type="submit" disabled={pending} className="min-h-12 w-full">{t("lived.confirm")}</Button>
      </form>:<div className="flex flex-wrap gap-2">{first&&<a href={`#moment-${first.id}`} onClick={()=>setStep("closed")} className={buttonVariants("primary","min-h-11")}>{t("lived.reviewNow")}</a>}<Button variant="ghost" className="min-h-11" onClick={()=>setStep("closed")}>{t("lived.later")}</Button></div>}
    </SheetShell>}
  </>;
}
