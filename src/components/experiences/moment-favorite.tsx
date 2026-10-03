"use client";
import {useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {useTranslations} from "next-intl";
import {StarIcon} from "@/components/ui/icons";
import {setFavorite} from "@/lib/experiences/participant-actions";
import type {ExperienceDetail,ExperienceMoment,ExperienceError} from "@/lib/experiences/types";
export function MomentFavorite({experience:e,moment:m}:{experience:ExperienceDetail;moment:ExperienceMoment}) {
  const t=useTranslations("experiences"),router=useRouter(),[pending,start]=useTransition(),[error,setError]=useState<ExperienceError|null>(null);
  const selected=e.favorites.some(f=>f.userId===e.viewerId&&f.momentId===m.id);
  const others=e.participants.filter(p=>p.userId!==e.viewerId&&e.favorites.some(f=>f.userId===p.userId&&f.momentId===m.id));
  return <div className="space-y-1.5">{e.canContribute&&<button type="button" className={`inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm disabled:opacity-60 ${selected ? "bg-surface-muted text-gold-ink" : "text-muted-foreground hover:bg-surface-muted hover:text-foreground"}`} aria-pressed={selected} aria-label={t(selected ? "removeFavorite" : "selectFavorite",{name:m.title})} disabled={pending} onClick={()=>{setError(null);start(async()=>{const result=await setFavorite(e.id,selected ? null : m.id);if(!result.ok) setError(result.error);else router.refresh();});}}><StarIcon aria-hidden className={`h-5 w-5 ${selected ? "fill-gold/25" : ""}`}/>{t("favorite")}</button>}{others.map(p=><p key={p.id} className="flex items-center gap-1.5 text-xs text-muted-foreground"><StarIcon aria-hidden className="h-3.5 w-3.5 text-gold-ink"/>{t("favoriteBy",{name:p.displayName??p.username??t("companion")})}</p>)}{error&&<p role="alert" className="text-sm text-status-dropped">{t(`errors.${error}`)}</p>}</div>;
}
