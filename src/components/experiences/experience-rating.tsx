"use client";
import {useTranslations} from "next-intl";
import {RatingDots} from "@/components/ui/rating-dots";
import type {ExperienceRating as Rating} from "@/lib/experiences/types";

// Media derivada de las reseñas visibles (de una experiencia o de un momento):
// dots + media con un decimal + «N reseñas». Sin reseñas no pinta nada.
export function ExperienceRating({rating,size="sm"}:{rating:Rating|null;size?:"sm"|"md"}) {
  const t=useTranslations("experiences");
  if(!rating||!rating.count) return null;
  return <span className="inline-flex items-center gap-2 text-xs text-muted-foreground"><RatingDots value={Math.round(rating.avg)} size={size}/><span className="font-mono">{rating.avg.toFixed(1)}</span><span>· {t("reviews.count",{count:rating.count})}</span></span>;
}
