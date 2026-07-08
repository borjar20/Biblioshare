import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ItemType } from "@/lib/catalog/types";
import type { LibraryItem } from "@/lib/library/types";
import { itemHref } from "@/lib/catalog/item-href";
import { getProgress } from "@/lib/library/progress";
import { ProgressBar } from "@/components/ui/progress-bar";
import { StatusBadge } from "@/components/ui/status-badge";

// `linkToSession` (owner-only surfaces: home and own profile): books/series
// jump straight to the session-logging screen, the daily-loop shortcut
// (§7.14). Movies have no sessions, so they always link to their detail
// page. Visitors on someone else's profile always get the detail link.
export async function NowConsuming({
  items,
  linkToSession = false,
}: {
  items: LibraryItem[];
  linkToSession?: boolean;
}) {
  const t = await getTranslations("profile");
  const tLibrary = await getTranslations("library");

  const seen = new Set<ItemType>();
  const featured = items.filter((item) => {
    if (seen.has(item.itemType)) return false;
    seen.add(item.itemType);
    return true;
  });

  if (featured.length === 0) return null;

  const hrefFor = (item: LibraryItem) =>
    linkToSession && item.itemType !== "movie"
      ? `/sesion/${item.entryId}`
      : itemHref(item.itemType, item.itemId);

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold tracking-tight">{t("nowConsuming")}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {featured.map((item) => {
          const progress = getProgress(item);
          return (
            <Link
              key={item.entryId}
              href={hrefFor(item)}
              className="flex gap-3 rounded-lg border border-border bg-surface p-3"
            >
              <div className="relative h-20 w-14 shrink-0 overflow-hidden rounded-md bg-surface-muted">
                {item.coverUrl && (
                  <Image
                    src={item.coverUrl}
                    alt={item.title}
                    fill
                    sizes="56px"
                    className="object-cover"
                  />
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col justify-between gap-1.5">
                <div className="flex flex-col gap-0.5">
                  <span className="line-clamp-1 text-sm font-medium text-foreground">
                    {item.title}
                  </span>
                  {item.subtitle && (
                    <span className="line-clamp-1 text-xs text-muted-foreground">
                      {item.subtitle}
                    </span>
                  )}
                </div>
                {progress ? (
                  <ProgressBar current={progress.current} total={progress.total} label={progress.label} />
                ) : (
                  <StatusBadge status={item.status} label={tLibrary(`status.${item.status}`)} />
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
