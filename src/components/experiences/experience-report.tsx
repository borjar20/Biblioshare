"use client";
import {useId,useState,useTransition} from "react";
import {useTranslations} from "next-intl";
import {Button} from "@/components/ui/button";
import {Field} from "@/components/ui/field";
import {Select} from "@/components/ui/select";
import {SheetShell} from "@/components/saga/sheet-shell";
import {REPORT_REASONS} from "@/lib/social/moderation";
import {reportExperience} from "@/lib/experiences/report-actions";
export function ExperienceReport({id}:{id:string}) {
  const t=useTranslations("social"),field=useId(),[open,setOpen]=useState(false),[sent,setSent]=useState(false),[failed,setFailed]=useState(false),[pending,start]=useTransition();
  return <>{sent?<p role="status" className="text-sm text-muted-foreground">{t("reportSent")}</p>:<Button variant="ghost" className="min-h-11" onClick={()=>setOpen(true)}>{t("reportExperience")}</Button>}{open&&<SheetShell title={t("reportExperience")} onClose={()=>setOpen(false)}><form className="space-y-4" onSubmit={event=>{event.preventDefault();const data=new FormData(event.currentTarget);setFailed(false);start(async()=>{const result=await reportExperience(id,String(data.get("reason")),String(data.get("details")??""));if(!result.ok)setFailed(true);else{setOpen(false);setSent(true);}});}}><Field label={t("reportReasonLabel")} htmlFor={`${field}-reason`}><Select id={`${field}-reason`} name="reason" className="min-h-11 w-full">{REPORT_REASONS.map(r=><option key={r} value={r}>{t(`reportReason.${r}`)}</option>)}</Select></Field><Field label={t("reportDetailsLabel")} htmlFor={`${field}-details`}><textarea id={`${field}-details`} name="details" maxLength={2000} rows={3} className="w-full rounded-lg border border-border bg-surface p-3"/></Field>{failed&&<p role="alert" className="text-sm text-status-dropped">{t("actionError")}</p>}<Button type="submit" disabled={pending} className="min-h-11 w-full">{t("sendReport")}</Button></form></SheetShell>}</>;
}
