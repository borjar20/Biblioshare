"use client";
import { useId,useState,useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ActionMenu } from "@/components/ui/action-menu";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SheetShell } from "@/components/saga/sheet-shell";
import { saveMoment,removeMoment,reorderMoments } from "@/lib/experiences/actions";
import { MOMENT_KINDS,type ExperienceDetail,type ExperienceMoment,type ExperienceError,type SaveMomentInput } from "@/lib/experiences/types";
import { ExperienceDate } from "./experience-date";
export function MomentEditor({experience:e}:{experience:ExperienceDetail}) {
  const t=useTranslations("experiences"),router=useRouter(),prefix=useId();
  const [editing,setEditing]=useState<ExperienceMoment|"new"|null>(null),[removing,setRemoving]=useState<ExperienceMoment|null>(null),[error,setError]=useState<ExperienceError|null>(null),[pending,startTransition]=useTransition();
  function move(index:number,offset:number) {
    const ids=e.moments.map(m=>m.id);
    [ids[index],ids[index+offset]]=[ids[index+offset],ids[index]];
    setError(null);startTransition(async()=>{const result=await reorderMoments(e.id,e.revision,ids);if(!result.ok) setError(result.error);else router.refresh();});
  }
  const moment=editing&&editing!=="new" ? editing : null;
  return <section className="space-y-4">
    <div className="flex items-center justify-between gap-4"><h2 className="font-serif text-xl font-semibold">{t("moments")}</h2><Button type="button" variant="secondary" className="min-h-11" disabled={pending||e.moments.length>=50} onClick={()=>{setError(null);setEditing("new");}}>{t("addMoment")}</Button></div>
    <ol className="space-y-3">{e.moments.map((m,index)=><li key={m.id} className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4">
      <span className="mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-surface-muted text-sm" aria-hidden>{index+1}</span><div className="min-w-0 flex-1"><h3 className="font-serif text-lg font-semibold">{m.title}</h3><p className="mt-1 text-sm text-muted-foreground">{t(`kinds.${m.kind}`)}{m.placeLabel ? ` · ${m.placeLabel}` : ""}</p><p className="mt-1 text-xs text-muted-foreground"><ExperienceDate startsOn={m.startsOn} endsOn={m.endsOn}/></p>
        <div className="mt-3 flex flex-wrap gap-1"><Button type="button" variant="ghost" className="min-h-11 px-3" disabled={pending||index===0} aria-label={t("moveUp",{name:m.title})} onClick={()=>move(index,-1)}>↑</Button><Button type="button" variant="ghost" className="min-h-11 px-3" disabled={pending||index===e.moments.length-1} aria-label={t("moveDown",{name:m.title})} onClick={()=>move(index,1)}>↓</Button><Button type="button" variant="ghost" className="min-h-11" disabled={pending} onClick={()=>{setError(null);setEditing(m);}}>{t("editMoment")}</Button></div>
      </div><ActionMenu label={t("momentActions",{name:m.title})} items={[{key:"remove",label:t("removeMoment"),danger:true,disabled:pending||e.moments.length===1,onSelect:()=>{setError(null);setRemoving(m);}}]}/>
    </li>)}</ol>
    {error&&!editing&&!removing&&<p role="alert" className="text-sm text-status-dropped">{t(`errors.${error}`)}</p>}
    {editing&&<SheetShell title={moment ? t("editMoment") : t("addMoment")} onClose={()=>{setEditing(null);setError(null);}}><form className="space-y-4" onSubmit={event=>{
      event.preventDefault();setError(null);const data=new FormData(event.currentTarget),value=(name:string)=>String(data.get(name)??"");
      startTransition(async()=>{const result=await saveMoment(e.id,e.revision,{...(moment ? {id:moment.id} : {}),title:value("title"),kind:value("kind"),placeLabel:value("placeLabel")||null,startsOn:value("startsOn")||null,endsOn:value("endsOn")||null} as SaveMomentInput);if(!result.ok) setError(result.error);else {setEditing(null);router.refresh();}});
    }}>
      <Field label={t("momentName")} htmlFor={`${prefix}-title`} required><Input id={`${prefix}-title`} name="title" defaultValue={moment?.title} maxLength={160} required className="min-h-11 w-full"/></Field>
      <Field label={t("momentKind")} htmlFor={`${prefix}-kind`}><Select id={`${prefix}-kind`} name="kind" defaultValue={moment?.kind??"other"} className="min-h-11 w-full">{MOMENT_KINDS.map(kind=><option key={kind} value={kind}>{t(`kinds.${kind}`)}</option>)}</Select></Field>
      <Field label={t("place")} htmlFor={`${prefix}-place`}><Input id={`${prefix}-place`} name="placeLabel" defaultValue={moment?.placeLabel??""} maxLength={240} className="min-h-11 w-full"/></Field>
      <div className="grid gap-3 sm:grid-cols-2"><Field label={t("startsOn")} htmlFor={`${prefix}-start`}><Input type="date" id={`${prefix}-start`} name="startsOn" defaultValue={moment?.startsOn??""} className="min-h-11 w-full"/></Field><Field label={t("endsOn")} htmlFor={`${prefix}-end`}><Input type="date" id={`${prefix}-end`} name="endsOn" defaultValue={moment?.endsOn??""} className="min-h-11 w-full"/></Field></div>
      {error&&<p role="alert" className="text-sm text-status-dropped">{t(`errors.${error}`)}</p>}
      <Button type="submit" disabled={pending} className="min-h-11 w-full">{pending ? t("saving") : t("saveMoment")}</Button>
    </form></SheetShell>}
    {removing&&<SheetShell title={t("removeMoment")} onClose={()=>{setRemoving(null);setError(null);}}><p className="mb-4 text-sm">{t("removeMomentConfirm",{name:removing.title})}</p>{error&&<p role="alert" className="mb-3 text-sm text-status-dropped">{t(`errors.${error}`)}</p>}<Button variant="danger" className="min-h-11" disabled={pending} onClick={()=>{setError(null);startTransition(async()=>{const result=await removeMoment(e.id,e.revision,removing.id);if(!result.ok) setError(result.error);else {setRemoving(null);router.refresh();}});}}>{t("removeMoment")}</Button></SheetShell>}
  </section>;
}
