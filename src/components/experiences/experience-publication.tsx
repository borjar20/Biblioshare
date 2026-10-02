"use client";
import Link from "next/link";
import {useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {useTranslations} from "next-intl";
import {Button} from "@/components/ui/button";
import {publishExperience,unpublishExperience} from "@/lib/experiences/publish-actions";
import type {ExperienceDetail,ExperienceError} from "@/lib/experiences/types";
export function ExperiencePublication({experience:e}:{experience:ExperienceDetail}) {
  const t=useTranslations("experiences"),router=useRouter(),[error,setError]=useState<ExperienceError|null>(null),[pending,start]=useTransition();
  if(!e.canEdit)return null;
  return <section className="space-y-3 rounded-2xl border border-border bg-surface p-5"><h2 className="font-serif text-lg font-semibold">{t("publication")}</h2><p className="text-xs text-muted-foreground">{t("publicationHint")}</p>{e.publicationId?<><Link href={`/post/${e.publicationId}`} className="inline-flex min-h-11 items-center text-sm font-medium underline">{t("viewPublication")}</Link><Button variant="secondary" disabled={pending} className="min-h-11 w-full" onClick={()=>start(async()=>{setError(null);const result=await unpublishExperience(e.id);if(!result.ok)setError(result.error);else router.refresh();})}>{t("unpublish")}</Button></>:<Button disabled={pending||e.audience!=="profile"} className="min-h-11 w-full" onClick={()=>start(async()=>{setError(null);const result=await publishExperience(e.id);if(!result.ok)setError(result.error);else router.refresh();})}>{t("publish")}</Button>}{e.audience!=="profile"&&<p className="text-xs text-muted-foreground">{t("publishAudienceHint")}</p>}{error&&<p role="alert" className="text-sm text-status-dropped">{t(`errors.${error}`)}</p>}</section>;
}
