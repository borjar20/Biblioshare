import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ItemType } from "@/lib/catalog/types";

const TYPES: ItemType[] = ["book", "movie", "series"];

function pillClass(active: boolean) {
  return `rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
    active
      ? "bg-accent text-accent-foreground"
      : "bg-surface-muted text-muted-foreground hover:text-foreground"
  }`;
}

export async function FeedFilters({
  itemType,
  reviewsOnly,
}: {
  itemType?: ItemType;
  reviewsOnly?: boolean;
}) {
  const t = await getTranslations();

  function buildHref(next: { type?: ItemType; reviewsOnly?: boolean }) {
    const params = new URLSearchParams();
    const nextType = "type" in next ? next.type : itemType;
    const nextReviewsOnly = "reviewsOnly" in next ? next.reviewsOnly : reviewsOnly;
    if (nextType) params.set("itemType", nextType);
    if (nextReviewsOnly) params.set("reviewsOnly", "1");
    const qs = params.toString();
    return qs ? `/?${qs}` : "/";
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={buildHref({ type: undefined })} className={pillClass(!itemType)}>
        {t("library.filters.allTypes")}
      </Link>
      {TYPES.map((type) => (
        <Link key={type} href={buildHref({ type })} className={pillClass(itemType === type)}>
          {t(`search.types.${type}`)}
        </Link>
      ))}
      <Link
        href={buildHref({ reviewsOnly: !reviewsOnly })}
        className={pillClass(Boolean(reviewsOnly))}
      >
        {t("feed.filters.reviewsOnly")}
      </Link>
    </div>
  );
}
