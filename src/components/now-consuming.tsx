import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ItemType } from "@/lib/catalog/types";
import type { LibraryItem } from "@/lib/library/types";
import { itemHref } from "@/lib/catalog/item-href";
import { getProgress } from "@/lib/library/progress";
import { ProgressBar } from "@/components/ui/progress-bar";
import { StatusBadge } from "@/components/ui/status-badge";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";

// `linkToSession` (owner-only surfaces: home and own profile): books/series
// jump straight to the session-logging screen, the daily-loop shortcut
// (§7.14). Movies have no sessions, so they always link to their detail
// page. Visitors on someone else's profile always get the detail link.
// `variant="strip"` es la tira del Panel del mockup "IA nueva": mini-cards
// verticales (portada 2:3 + barrita de progreso + título serif).
export async function NowConsuming({
  items,
  linkToSession = false,
  variant = "default",
}: {
  items: LibraryItem[];
  linkToSession?: boolean;
  variant?: "default" | "strip";
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
    linkToSession && item.itemType !== "movie" && item.activePassId
      ? `/sesion/${item.activePassId}`
      : itemHref(item.itemType, item.itemId);

  if (variant === "strip") {
    return (
      <div className="flex flex-col gap-3">
        <span className="font-mono text-xs tracking-wider text-muted-foreground uppercase">
          {t("nowConsuming")}
        </span>
        <div className="flex gap-4 overflow-x-auto pb-1">
          {featured.map((item) => {
            const progress = getProgress(item);
            const percent = progress
              ? Math.min(100, Math.round((progress.current / progress.total) * 100))
              : 0;
            return (
              <Link
                key={item.entryId}
                href={hrefFor(item)}
                className="flex w-[100px] shrink-0 flex-col gap-1.5"
              >
                <div className="relative aspect-[2/3] w-full overflow-hidden rounded-cover bg-surface-muted shadow-cover">
                  {item.coverUrl && (
                    <Image
                      src={item.coverUrl}
                      alt={item.title}
                      fill
                      sizes="100px"
                      className="object-cover"
                    />
                  )}
                </div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-surface-muted">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <span className="line-clamp-1 font-serif text-[11px] font-semibold text-foreground">
                  {item.title}
                </span>
                <span className="-mt-1 font-mono text-[10px] text-muted-foreground">
                  {progress
                    ? progress.label
                    : tLibrary("status.in_progress")}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="font-mono text-xs tracking-wider text-muted-foreground uppercase">
          {t("nowConsuming")}
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {featured.map((item) => {
          const progress = getProgress(item);
          const accent = MEDIA_ACCENT[item.itemType];
          return (
            <Link
              key={item.entryId}
              href={hrefFor(item)}
              className={`flex gap-3 rounded-lg border ${accent.borderSoft} bg-surface p-3 transition-colors`}
            >
              <span className={`w-0.5 shrink-0 self-stretch rounded-full ${accent.bg}`} />
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
                  <span className="line-clamp-1 font-serif text-sm font-semibold text-foreground">
                    {item.title}
                  </span>
                  {item.subtitle && (
                    <span className="line-clamp-1 text-xs text-muted-foreground">
                      {item.subtitle}
                    </span>
                  )}
                </div>
                {progress ? (
                  <ProgressBar
                    current={progress.current}
                    total={progress.total}
                    label={progress.label}
                  />
                ) : (
                  <StatusBadge
                    status={item.status}
                    label={tLibrary(`status.${item.status}`)}
                  />
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
