"use client";
import Link from "next/link";
import {useId,useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {useTranslations} from "next-intl";
import {Button} from "@/components/ui/button";
import {EyeIcon,LockIcon,UsersIcon,ChevronRightIcon,CheckIcon} from "@/components/ui/icons";
import {SheetShell} from "@/components/saga/sheet-shell";
import {publishExperience,unpublishExperience} from "@/lib/experiences/publish-actions";
import {updateExperience} from "@/lib/experiences/actions";
import type {ExperienceDetail,ExperienceError,ExperienceAudience} from "@/lib/experiences/types";
function PublicationOptions({experience:e,onDone}:{experience:ExperienceDetail;onDone:()=>void}) {
  const t=useTranslations("experiences"),router=useRouter(),name=useId();
  const [audience,setAudience]=useState<ExperienceAudience>(e.audience),[error,setError]=useState<ExperienceError|null>(null),[pending,start]=useTransition();
  const changed=audience!==e.audience;
  return <div className="max-h-[78svh] space-y-4 overflow-y-auto"><p className="text-sm text-muted-foreground">{t("publicationHint")}</p>
    <fieldset disabled={pending}><legend className="mb-2 text-sm font-medium">{t("audience")}</legend><div role="radiogroup" aria-label={t("audience")} className="space-y-2">{(["private","participants","profile"] as const).map(value=><label key={value} className="relative block cursor-pointer">
      <input type="radio" name={name} value={value} checked={audience===value} onChange={()=>{setError(null);setAudience(value);}} className="peer sr-only"/>
      <span className="flex min-h-12 items-center gap-3 rounded-card border border-border p-3 text-sm peer-checked:border-foreground peer-checked:bg-surface-muted peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent peer-disabled:opacity-60">
        {value==="private" ? <LockIcon aria-hidden className="h-4 w-4 shrink-0"/> : value==="participants" ? <UsersIcon aria-hidden className="h-4 w-4 shrink-0"/> : <EyeIcon aria-hidden className="h-4 w-4 shrink-0"/>}<span className="min-w-0 flex-1">{t(value)}</span>{audience===value&&<CheckIcon aria-hidden className="h-4 w-4 shrink-0"/>}
      </span>
    </label>)}</div></fieldset>
    <p className="text-xs text-muted-foreground">{t("audienceHint")}</p>
    {changed&&<Button disabled={pending} className="min-h-11 w-full" onClick={()=>{setError(null);start(async()=>{
      const result=await updateExperience(e.id,e.revision,{title:e.title,shape:e.shape,state:e.state,audience,startsOn:e.startsOn,endsOn:e.endsOn});
      if(!result.ok)setError(result.error);else router.refresh();
    });}}>{pending ? t("saving") : t("saveChanges")}</Button>}
    <div className="space-y-3 border-t border-border pt-4">
      {e.publicationId ? <><Link href={`/post/${e.publicationId}`} className="inline-flex min-h-11 items-center text-sm font-medium underline">{t("viewPublication")}</Link><Button variant="secondary" disabled={pending} className="min-h-11 w-full" onClick={()=>start(async()=>{setError(null);const result=await unpublishExperience(e.id);if(!result.ok)setError(result.error);else{onDone();router.refresh();}})}>{t("unpublish")}</Button></> : <Button disabled={pending||changed||e.audience!=="profile"} className="min-h-11 w-full" onClick={()=>start(async()=>{setError(null);const result=await publishExperience(e.id);if(!result.ok)setError(result.error);else{onDone();router.refresh();}})}>{t("publish")}</Button>}
      {e.audience!=="profile"&&<p className="text-sm text-muted-foreground">{t("publishAudienceHint")}</p>}
    </div>
    {error&&<div role="alert" className="space-y-2 text-sm text-status-dropped"><p>{t(`errors.${error}`)}</p>{error==="conflict"&&<Button variant="secondary" className="min-h-11" onClick={()=>router.refresh()}>{t("refresh")}</Button>}</div>}
  </div>;
}
export function ExperiencePublication({experience:e}:{experience:ExperienceDetail}) {
  const t=useTranslations("experiences"),[open,setOpen]=useState(false);
  if(!e.canEdit)return null;
  return <section>
    <button type="button" aria-label={t("publication")} aria-expanded={open} onClick={()=>setOpen(true)} className="flex min-h-16 w-full items-center gap-3 rounded-card border border-border bg-surface p-4 text-left hover:bg-surface-muted">
      {e.audience==="profile" ? <EyeIcon aria-hidden className="h-5 w-5 shrink-0"/> : <LockIcon aria-hidden className="h-5 w-5 shrink-0"/>}<span className="min-w-0 flex-1"><span className="block font-serif text-base font-semibold">{t("publication")}</span><span className="mt-1 block text-xs text-muted-foreground">{t(e.audience==="profile" ? "album.sharingProfile" : "album.sharingPrivate")}</span></span><ChevronRightIcon aria-hidden className="h-4 w-4 shrink-0"/>
    </button>
    {open&&<SheetShell title={t("publication")} onClose={()=>setOpen(false)}><PublicationOptions key={`${e.id}:${e.revision}`} experience={e} onDone={()=>setOpen(false)}/></SheetShell>}
  </section>;
}
