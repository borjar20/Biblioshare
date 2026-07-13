import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ItemType } from "@/lib/catalog/types";
import type { LibrarySort, MediaStatus } from "@/lib/library/types";

const TYPES: ItemType[] = ["book", "movie", "series"];
const STATUSES: MediaStatus[] = [
  "planned",
  "in_progress",
  "completed",
  "dropped",
];
const SORTS: LibrarySort[] = ["recent", "rating", "title"];

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
  search,
  sort = "recent",
  basePath,
  showTypeFilter = true,
  extraParams,
}: {
  itemType?: ItemType;
  status?: MediaStatus;
  search?: string;
  sort?: LibrarySort;
  basePath: string;
  showTypeFilter?: boolean;
  extraParams?: Record<string, string>;
}) {
  const t = await getTranslations();

  function buildHref(next: {
    type?: ItemType;
    status?: MediaStatus;
    sort?: LibrarySort;
  }) {
    const params = new URLSearchParams(extraParams);
    const nextType = "type" in next ? next.type : itemType;
    const nextStatus = "status" in next ? next.status : status;
    const nextSort = "sort" in next ? next.sort : sort;
    if (nextType) params.set("type", nextType);
    if (nextStatus) params.set("status", nextStatus);
    if (nextSort && nextSort !== "recent") params.set("sort", nextSort);
    if (search) params.set("q", search);
    const qs = params.toString();
    return `${basePath}${qs ? `?${qs}` : ""}`;
  }

  return (
    <div className="flex flex-col gap-3">
      <form action={basePath} className="flex gap-2">
        {itemType && <input type="hidden" name="type" value={itemType} />}
        {status && <input type="hidden" name="status" value={status} />}
        {sort !== "recent" && <input type="hidden" name="sort" value={sort} />}
        {extraParams &&
          Object.entries(extraParams).map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))}
        <input
          type="search"
          name="q"
          defaultValue={search}
          placeholder={t("library.search.placeholder")}
          className="flex-1 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <button
          type="submit"
          className="rounded-full bg-surface-muted px-4 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          {t("library.search.submit")}
        </button>
      </form>

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

      <div className="flex flex-wrap gap-2">
        {SORTS.map((s) => (
          <Link key={s} href={buildHref({ sort: s })} className={pillClass(sort === s)}>
            {t(`library.sort.${s}`)}
          </Link>
        ))}
      </div>
    </div>
  );
}
