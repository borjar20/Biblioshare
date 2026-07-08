import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ItemType } from "@/lib/catalog/types";
import type { MediaStatus } from "@/lib/library/types";

const TYPES: ItemType[] = ["book", "movie", "series"];
const STATUSES: MediaStatus[] = [
  "planned",
  "in_progress",
  "completed",
  "dropped",
];

function pillClass(active: boolean) {
  return `rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
    active
      ? "bg-accent text-accent-foreground"
      : "bg-surface-muted text-muted-foreground hover:text-foreground"
  }`;
}

export async function LibraryFilters({
  itemType,
  status,
  basePath,
  showTypeFilter = true,
  extraParams,
}: {
  itemType?: ItemType;
  status?: MediaStatus;
  basePath: string;
  showTypeFilter?: boolean;
  extraParams?: Record<string, string>;
}) {
  const t = await getTranslations();

  function buildHref(next: { type?: ItemType; status?: MediaStatus }) {
    const params = new URLSearchParams(extraParams);
    const nextType = "type" in next ? next.type : itemType;
    const nextStatus = "status" in next ? next.status : status;
    if (nextType) params.set("type", nextType);
    if (nextStatus) params.set("status", nextStatus);
    const qs = params.toString();
    return `${basePath}${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="flex flex-col gap-3">
      {showTypeFilter && (
        <div className="flex flex-wrap gap-2">
          <Link href={buildHref({ type: undefined })} className={pillClass(!itemType)}>
            {t("library.filters.allTypes")}
          </Link>
          {TYPES.map((type) => (
            <Link
              key={type}
              href={buildHref({ type })}
              className={pillClass(itemType === type)}
            >
              {t(`search.types.${type}`)}
            </Link>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Link
          href={buildHref({ status: undefined })}
          className={pillClass(!status)}
        >
          {t("library.filters.allStatuses")}
        </Link>
        {STATUSES.map((s) => (
          <Link key={s} href={buildHref({ status: s })} className={pillClass(status === s)}>
            {t(`library.status.${s}`)}
          </Link>
        ))}
      </div>
    </div>
  );
}
