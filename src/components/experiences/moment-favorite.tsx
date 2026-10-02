"use client";
import {useState,useTransition} from "react";
import {useRouter} from "next/navigation";
import {useTranslations} from "next-intl";
import {Button} from "@/components/ui/button";
import {setFavorite} from "@/lib/experiences/participant-actions";
import type {ExperienceDetail,ExperienceMoment,ExperienceError} from "@/lib/experiences/types";
export function MomentFavorite({experience:e,moment:m}:{experience:ExperienceDetail;moment:ExperienceMoment}) {
  const t=useTranslations("experiences"),router=useRouter(),[pending,start]=useTransition(),[error,setError]=useState<ExperienceError|null>(null);
  const selected=e.favorites.some(f=>f.userId===e.viewerId&&f.momentId===m.id);
  const others=e.participants.filter(p=>p.userId!==e.viewerId&&e.favorites.some(f=>f.userId===p.userId&&f.momentId===m.id));
  return <div className="mt-3 space-y-2">{e.canContribute&&<Button className="min-h-11" variant={selected ? "secondary" : "ghost"} aria-pressed={selected} aria-label={t(selected ? "removeFavorite" : "selectFavorite",{name:m.title})} disabled={pending} onClick={()=>{setError(null);start(async()=>{const result=await setFavorite(e.id,selected ? null : m.id);if(!result.ok) setError(result.error);else router.refresh();});}}><span aria-hidden>{selected ? "★" : "☆"}</span> {t("favorite")}</Button>}{others.map(p=><p key={p.id} className="text-xs text-muted-foreground">{t("favoriteBy",{name:p.displayName??p.username??t("companion")})}</p>)}{error&&<p role="alert" className="text-sm text-status-dropped">{t(`errors.${error}`)}</p>}</div>;
}
