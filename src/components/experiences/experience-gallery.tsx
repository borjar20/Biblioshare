"use client";
import Image from "next/image";
import {useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {useTranslations} from "next-intl";
import {Button} from "@/components/ui/button";
import {ActionMenu} from "@/components/ui/action-menu";
import {SheetShell} from "@/components/saga/sheet-shell";
import {deletePhoto,setCoverPhoto,setPhotoSharing} from "@/lib/experiences/photo-actions";
import type {ExperienceDetail,ExperienceError,ExperiencePhoto,ExperienceResult} from "@/lib/experiences/types";
import {ExperiencePhotoUpload} from "./experience-photo-upload";
export function ExperienceGallery({experience:e}:{experience:ExperienceDetail}) {
  const t=useTranslations("experiences"),router=useRouter(),[deleting,setDeleting]=useState<ExperiencePhoto|null>(null),[viewing,setViewing]=useState<ExperiencePhoto|null>(null),[pending,start]=useTransition(),[error,setError]=useState<ExperienceError|null>(null);
  function run(work:()=>Promise<ExperienceResult<unknown>>,done?:()=>void) {setError(null);start(async()=>{const result=await work();if(!result.ok) setError(result.error);else {done?.();router.refresh();}});}
  return <section className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-serif text-xl font-semibold">{t("gallery")}</h2>{e.canContribute&&<ExperiencePhotoUpload experienceId={e.id} moments={e.moments}/>}</div>
    {e.photos.length ? <div className="grid gap-4 sm:grid-cols-2">{e.photos.map(p=><figure key={p.id} className="overflow-hidden rounded-2xl border border-border bg-surface"><button type="button" aria-label={t("openPhoto")} className="block min-h-11 w-full" onClick={()=>setViewing(p)}><Image src={`/api/experience-photos/${p.id}`} alt={t("photoAlt",{name:e.title})} width={1200} height={900} unoptimized className="aspect-[4/3] w-full object-cover"/></button><figcaption className="space-y-3 p-4"><div className="flex items-center justify-between gap-3"><div className="text-xs text-muted-foreground">{p.authorName&&<p>{t("photoAuthor",{name:p.authorName})}</p>}{p.momentId&&<p>{e.moments.find(m=>m.id===p.momentId)?.title}</p>}{e.coverPhotoId===p.id&&<p className="mt-1 font-medium text-foreground">{t("cover")}</p>}</div>{p.canManage&&<ActionMenu label={t("photoActions")} items={[e.canEdit&&p.isAuthor&&{key:"cover",label:e.coverPhotoId===p.id ? t("clearCover") : t("setCover"),disabled:pending,onSelect:()=>run(()=>setCoverPhoto(e.id,e.coverPhotoId===p.id ? null : p.id))},{key:"delete",label:t("deletePhoto"),danger:true,onSelect:()=>{setError(null);setDeleting(p);}}]}/>}</div>
      {p.isAuthor&&<div><label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm"><input type="checkbox" checked={p.shareWithProfile} disabled={pending} onChange={event=>run(()=>setPhotoSharing(p.id,event.target.checked))} className="h-5 w-5 accent-accent"/>{t("sharePhoto")}</label><p className="mt-1 text-xs text-muted-foreground">{t("sharePhotoHint")}</p></div>}
    </figcaption></figure>)}</div> : e.canContribute&&<p className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">{t("emptyGallery")}</p>}
    {error&&!deleting&&<p role="alert" className="text-sm text-status-dropped">{t(`errors.${error}`)}</p>}
    {deleting&&<SheetShell title={t("deletePhoto")} onClose={()=>{setDeleting(null);setError(null);}}><div className="space-y-4"><p>{t("deletePhotoConfirm")}</p>{error&&<p role="alert" className="text-sm text-status-dropped">{t(`errors.${error}`)}</p>}<Button variant="danger" className="min-h-11 w-full" disabled={pending} onClick={()=>run(()=>deletePhoto(deleting.id),()=>setDeleting(null))}>{t("deletePhoto")}</Button></div></SheetShell>}
    {viewing&&<SheetShell title={t("openPhoto")} onClose={()=>setViewing(null)}><Image src={`/api/experience-photos/${viewing.id}`} alt={t("photoAlt",{name:e.title})} width={1600} height={1200} unoptimized className="max-h-[70vh] w-full object-contain"/></SheetShell>}
  </section>;
}
