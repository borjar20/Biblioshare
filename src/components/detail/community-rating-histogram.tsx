"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { ItemType } from "@/lib/catalog/types";
import { formatDots } from "@/lib/rating/dots";
import { RatingHistogram } from "./rating-histogram";

export function CommunityRatingHistogram({
  itemType,
  distribution,
}: {
  itemType: ItemType;
  distribution: number[];
}) {
  const t = useTranslations("detail");
  const [selected, setSelected] = useState<number | null>(null);
  const active = selected ?? distribution.indexOf(Math.max(...distribution));
  const label = (index: number) => t("ratingBucket", {
    rating: formatDots(index + 1)!,
    count: distribution[index],
  });

  return (
    <div className="relative min-w-0">
      <div aria-hidden="true">
        <RatingHistogram itemType={itemType} distribution={distribution} barsHeight="h-12" animate />
      </div>
      <div role="group" aria-label={t("ratingDistribution")} className="absolute inset-x-0 top-0 flex h-12">
        {distribution.map((_, index) => (
          <button
            type="button"
            key={index}
            aria-label={label(index)}
            aria-pressed={index === active}
            onFocus={() => setSelected(index)}
            onClick={() => setSelected(index)}
            className="min-w-0 flex-1 cursor-pointer rounded-sm hover:bg-foreground/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-foreground aria-pressed:bg-foreground/10"
          />
        ))}
      </div>
      <p className="mt-2 text-xs text-foreground-soft">{label(active)}</p>
    </div>
  );
}
