"use client";
import Link from "next/link";
import Image from "next/image";
import {useState,useTransition} from "react";
import {useRouter,useSearchParams} from "next/navigation";
import {useTranslations} from "next-intl";
import {Button,buttonVariants} from "@/components/ui/button";
import {ActionMenu} from "@/components/ui/action-menu";
import {SheetShell} from "@/components/saga/sheet-shell";
import {deletePhoto} from "@/lib/experiences/photo-actions";
import type {ExperienceOwnPhotoPage,ExperienceError} from "@/lib/experiences/types";
export function ExperienceOwnPhotos({page}:{page:ExperienceOwnPhotoPage}) {
  const t=useTranslations("experiences"),router=useRouter(),params=useSearchParams(),[deleting,setDeleting]=useState<ExperienceOwnPhotoPage["items"][number]|null>(null),[pending,start]=useTransition(),[error,setError]=useState<ExperienceError|null>(null);
  if(!page.items.length) return null;
  const more=new URLSearchParams(params);if(page.nextCursor)more.set("photosCursor",page.nextCursor);
  const date=(value:string)=>new Intl.DateTimeFormat("es",{dateStyle:"medium",timeZone:"UTC"}).format(new Date(value));
  const preview=(photo:ExperienceOwnPhotoPage["items"][number])=><Image src={`/api/experience-photos/${photo.id}/own`} alt={t("ownPhotoAlt",{date:date(photo.createdAt)})} width={800} height={600} unoptimized className="aspect-[4/3] w-full rounded-xl object-contain bg-surface-muted"/>;
  return <section className="space-y-3 rounded-2xl border border-border bg-surface p-5"><h2 className="font-serif text-xl font-semibold">{t("outsidePhotos")}</h2><p className="text-sm text-muted-foreground">{t("outsidePhotoHint")}</p><ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{page.items.map(photo=><li key={photo.id} className="space-y-2 text-sm">{preview(photo)}<div className="flex min-h-11 items-center justify-between gap-3"><time dateTime={photo.createdAt}>{date(photo.createdAt)}</time><ActionMenu label={t("photoActions")} items={[{key:"delete",label:t("deletePhoto"),danger:true,onSelect:()=>{setError(null);setDeleting(photo);}}]}/></div></li>)}</ul>{page.nextCursor&&<Link href={`/experiencias?${more}`} className={buttonVariants("secondary","min-h-11")}>{t("moreOutsidePhotos")}</Link>}{deleting&&<SheetShell title={t("deletePhoto")} onClose={()=>setDeleting(null)}><div className="space-y-4">{preview(deleting)}<p>{t("deletePhotoConfirm")}</p>{error&&<p role="alert" className="text-sm text-status-dropped">{t(`errors.${error}`)}</p>}<Button disabled={pending} variant="danger" className="min-h-11 w-full" onClick={()=>start(async()=>{const result=await deletePhoto(deleting.id);if(!result.ok)setError(result.error);else{setDeleting(null);router.refresh();}})}>{t("deletePhoto")}</Button></div></SheetShell>}</section>;
}
