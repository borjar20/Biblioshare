import { useTranslations } from "next-intl";
import { formatDots } from "@/lib/rating/dots";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import type { ItemType } from "@/lib/catalog/types";
import { CommunityRatingHistogram } from "./community-rating-histogram";

export function CommunitySummary({
  itemType,
  avgRating,
  distribution,
  ratingsLabel,
}: {
  itemType: ItemType;
  /** Media en escala de guardado 1–10. */
  avgRating: number;
  distribution: number[];
  ratingsLabel: string;
}) {
  const t = useTranslations("detail");
  const ratingCount = distribution.reduce((total, count) => total + count, 0);
  return (
    <div>
      <p className="flex flex-wrap items-baseline gap-x-2">
        <strong className={`font-serif text-2xl leading-none ${MEDIA_ACCENT[itemType].text}`}>
          {formatDots(avgRating)}<span className="text-sm">/5</span>
        </strong>
        <span className="text-xs text-muted-foreground">{ratingsLabel}</span>
      </p>
      {ratingCount > 1 && (
        <details className="mt-2">
          <summary className="cursor-pointer rounded-sm py-2 text-xs font-medium text-foreground">
            {t("ratingDistribution")}
          </summary>
          <CommunityRatingHistogram itemType={itemType} distribution={distribution} />
        </details>
      )}
    </div>
  );
}
