"use client";
import Link from "next/link";
import { useId,useState,useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button,buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { createExperience,updateExperience } from "@/lib/experiences/actions";
import { MOMENT_KINDS,type ExperienceDetail,type ExperienceError,type CreateExperienceInput,type UpdateExperienceInput } from "@/lib/experiences/types";

export function ExperienceForm({experience}:{experience?:ExperienceDetail}) {
  const t=useTranslations("experiences"),router=useRouter(),prefix=useId();
  const [error,setError]=useState<ExperienceError|null>(null),[pending,startTransition]=useTransition();
  const field=(name:string)=>`${prefix}-${name}`;
  return <form onSubmit={event=>{
    event.preventDefault();setError(null);
    const data=new FormData(event.currentTarget),value=(key:string)=>String(data.get(key)??"");
    startTransition(async()=>{
      const fields={title:value("title"),state:value("state"),startsOn:value("startsOn")||null,endsOn:value("endsOn")||null};
      const result=experience ? await updateExperience(experience.id,experience.revision,{...fields,shape:value("shape"),audience:value("audience")} as UpdateExperienceInput) : await createExperience({...fields,kind:value("kind"),placeLabel:value("placeLabel")||null} as CreateExperienceInput);
      if(!result.ok) {setError(result.error);return;}
      const id=experience?.id??("id" in result.data ? result.data.id : "");
      router.push(`/experiencia/${id}`);
    });
  }} className="space-y-6 rounded-2xl border border-border bg-surface p-5 sm:p-7">
    <Field label={t("name")} htmlFor={field("title")} required><Input id={field("title")} name="title" defaultValue={experience?.title} maxLength={160} required className="min-h-11 w-full"/></Field>
    <Field label={t("state")} htmlFor={field("state")}><Select id={field("state")} name="state" defaultValue={experience?.state??"planned"} className="min-h-11 w-full">
      <option value="planned">{t("states.planned")}</option><option value="lived">{t("states.lived")}</option>{experience&&<option value="cancelled">{t("states.cancelled")}</option>}
    </Select></Field>
    {experience&&<div className="grid gap-4 sm:grid-cols-2">
      <Field label={t("shape")} htmlFor={field("shape")}><Select id={field("shape")} name="shape" defaultValue={experience.shape} className="min-h-11 w-full"><option value="single" disabled={experience.moments.length>1}>{t("single")}</option><option value="trip">{t("trip")}</option></Select></Field>
      <Field label={t("audience")} htmlFor={field("audience")} hint={t("audienceHint")}><Select id={field("audience")} name="audience" defaultValue={experience.audience} className="min-h-11 w-full">{(["private","participants","profile"] as const).map(audience=><option key={audience} value={audience}>{t(audience)}</option>)}</Select></Field>
    </div>}
    <details open={Boolean(experience)} className="rounded-xl border border-border px-4 py-3">
      <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium">{t("optional")}</summary>
      <div className="space-y-4 pb-2 pt-3">
        {!experience&&<><Field label={t("kind")} htmlFor={field("kind")}><Select id={field("kind")} name="kind" defaultValue="other" className="min-h-11 w-full">{MOMENT_KINDS.map(kind=><option key={kind} value={kind}>{t(`kinds.${kind}`)}</option>)}</Select></Field>
        <Field label={t("place")} htmlFor={field("place")}><Input id={field("place")} name="placeLabel" maxLength={240} className="min-h-11 w-full"/></Field></>}
        <div className="grid gap-4 sm:grid-cols-2"><Field label={t("startsOn")} htmlFor={field("startsOn")}><Input type="date" id={field("startsOn")} name="startsOn" defaultValue={experience?.startsOn??""} className="min-h-11 w-full"/></Field><Field label={t("endsOn")} htmlFor={field("endsOn")}><Input type="date" id={field("endsOn")} name="endsOn" defaultValue={experience?.endsOn??""} className="min-h-11 w-full"/></Field></div>
      </div>
    </details>
    {!experience&&<p className="text-sm text-muted-foreground">{t("privateHint")}</p>}
    {error&&<div role="alert" className="space-y-2 text-sm text-status-dropped"><p>{t(`errors.${error}`)}</p>{error==="conflict"&&<Button type="button" variant="secondary" className="min-h-11" onClick={()=>router.refresh()}>{t("refresh")}</Button>}</div>}
    <div className="flex flex-wrap gap-3"><Button disabled={pending} className="min-h-11" type="submit">{pending ? t("saving") : experience ? t("saveChanges") : t("save")}</Button><Link href={experience ? `/experiencia/${experience.id}` : "/experiencias"} className={buttonVariants("ghost","min-h-11")}>{t("cancel")}</Link></div>
  </form>;
}
