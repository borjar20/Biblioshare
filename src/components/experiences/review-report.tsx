"use client";
import {useId,useState,useTransition} from "react";
import {useTranslations} from "next-intl";
import {Button} from "@/components/ui/button";
import {ActionMenu} from "@/components/ui/action-menu";
import {Field} from "@/components/ui/field";
import {Select} from "@/components/ui/select";
import {SheetShell} from "@/components/saga/sheet-shell";
import {REPORT_REASONS} from "@/lib/social/moderation";
import {reportReview} from "@/lib/experiences/report-actions";

// Variante compacta de ExperienceReport para cada reseña ajena: el disparador es
// un «···» con la única opción «Denunciar reseña». `conflict` = ya hay una
// denuncia pendiente de esta persona sobre la reseña; se dice tal cual en vez
// del error genérico.
export function ReviewReport({id}:{id:string}) {
  const t=useTranslations("social"),tx=useTranslations("experiences"),field=useId();
  const [open,setOpen]=useState(false),[sent,setSent]=useState(false),[failure,setFailure]=useState<"conflict"|"other"|null>(null),[pending,start]=useTransition();
  if(sent) return <span role="status" className="text-xs text-muted-foreground">{t("reportSent")}</span>;
  return <>
    <ActionMenu label={tx("reviews.report")} items={[{key:"report",label:tx("reviews.report"),onSelect:()=>{setFailure(null);setOpen(true);}}]}/>
    {open&&<SheetShell title={tx("reviews.report")} onClose={()=>setOpen(false)}>
      <form className="space-y-4" onSubmit={event=>{event.preventDefault();const data=new FormData(event.currentTarget);setFailure(null);start(async()=>{const r=await reportReview(id,String(data.get("reason")),String(data.get("details")??""));if(!r.ok) setFailure(r.error==="conflict"?"conflict":"other");else{setOpen(false);setSent(true);}});}}>
        <Field label={t("reportReasonLabel")} htmlFor={`${field}-reason`}><Select id={`${field}-reason`} name="reason" className="min-h-11 w-full">{REPORT_REASONS.map(r=><option key={r} value={r}>{t(`reportReason.${r}`)}</option>)}</Select></Field>
        <Field label={t("reportDetailsLabel")} htmlFor={`${field}-details`}><textarea id={`${field}-details`} name="details" maxLength={2000} rows={3} className="w-full rounded-lg border border-border bg-surface p-3"/></Field>
        {failure&&<p role="alert" className="text-sm text-status-dropped">{failure==="conflict"?tx("reviews.alreadyReported"):t("actionError")}</p>}
        <Button type="submit" disabled={pending} className="min-h-11 w-full">{t("sendReport")}</Button>
      </form>
    </SheetShell>}
  </>;
}
