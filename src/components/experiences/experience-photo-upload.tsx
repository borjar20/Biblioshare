"use client";
import {useId,useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {useTranslations} from "next-intl";
import {Button} from "@/components/ui/button";
import {Field} from "@/components/ui/field";
import {Select} from "@/components/ui/select";
import {SheetShell} from "@/components/saga/sheet-shell";
import {uploadExperiencePhoto} from "@/lib/experiences/photo-actions";
import type {ExperienceMoment,ExperienceError} from "@/lib/experiences/types";
export function ExperiencePhotoUpload({experienceId,moments}:{experienceId:string;moments:ExperienceMoment[]}) {
  const t=useTranslations("experiences"),router=useRouter(),prefix=useId(),[open,setOpen]=useState(false),[pending,start]=useTransition(),[error,setError]=useState<ExperienceError|null>(null);
  return <><Button variant="secondary" className="min-h-11" onClick={()=>{setOpen(true);setError(null);}}>{t("addPhoto")}</Button>{open&&<SheetShell title={t("addPhoto")} onClose={()=>setOpen(false)}><form className="space-y-4" onSubmit={event=>{event.preventDefault();const data=new FormData(event.currentTarget),moment=String(data.get("moment")??"")||null;setError(null);start(async()=>{const result=await uploadExperiencePhoto(experienceId,moment,data);if(!result.ok) setError(result.error);else {setOpen(false);router.refresh();}});}}>
    <Field label={t("image")} htmlFor={`${prefix}-photo`} hint={t("photoHint")}><input id={`${prefix}-photo`} name="photo" type="file" accept="image/jpeg,image/png,image/webp" required className="min-h-11 w-full text-sm file:mr-3 file:min-h-11 file:rounded-xl file:border file:border-border file:bg-surface file:px-4"/></Field>
    <Field label={t("photoMoment")} htmlFor={`${prefix}-moment`}><Select id={`${prefix}-moment`} name="moment" defaultValue="" className="min-h-11 w-full"><option value="">{t("generalGallery")}</option>{moments.map(m=><option key={m.id} value={m.id}>{m.title}</option>)}</Select></Field>
    {error&&<p role="alert" className="text-sm text-status-dropped">{t(`errors.${error}`)}</p>}<Button type="submit" className="min-h-11 w-full" disabled={pending}>{pending ? t("saving") : t("uploadPhoto")}</Button>
  </form></SheetShell>}</>;
}
