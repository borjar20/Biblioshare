"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { LibraryItem } from "@/lib/library/types";
import { itemHref } from "@/lib/catalog/item-href";
import { getProgress } from "@/lib/library/progress";
import { StatusBadge } from "@/components/ui/status-badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { toggleFavorite } from "@/lib/library/favorite-actions";
import { useOptimisticAction } from "@/lib/reactivity/use-optimistic-action";
import { SparklesIcon } from "@/components/ui/icons";

export function LibraryItemCard({
  item,
  isOwner,
  inCollection = false,
}: {
  item: LibraryItem;
  isOwner: boolean;
  // En Colección (frame B): badge de estado con TEXTO sobre la portada y línea
  // mono «relecturas · ★ nota». En el Perfil (mockup IA nueva) sigue dot-only.
  inCollection?: boolean;
}) {
  const t = useTranslations("library");
  // Favorito optimista: el pin/unpin se pinta al instante y revierte en error.
  const {
    state: pinned,
    isPending,
    failed,
    run,
  } = useOptimisticAction<boolean, "toggle">({
    state: item.pinnedOrder !== null,
    reducer: (p) => !p,
  });
  const progress = getProgress(item);
  const accent = MEDIA_ACCENT[item.itemType];

  return (
    <div className="flex flex-col gap-2">
      <Link
        href={itemHref(item.itemType, item.itemId)}
        className="group flex flex-col gap-2"
      >
        <div
          className={`relative aspect-[2/3] w-full overflow-hidden rounded-cover border ${accent.borderSoft} bg-surface-muted shadow-cover`}
        >
          {item.coverUrl ? (
            <Image
              src={item.coverUrl}
              alt={item.title}
              fill
              sizes="(max-width: 768px) 45vw, 200px"
              className="object-cover transition-transform duration-200 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full items-center justify-center px-3 text-center text-xs text-muted-foreground">
              {item.title}
            </div>
          )}
          <div className="absolute right-1.5 top-1.5">
            <StatusBadge
              status={item.status}
              label={t(`status.${item.status}`)}
              dotOnly={!inCollection}
              variant={inCollection ? "overlay" : "chip"}
            />
          </div>
        </div>

        <span className="line-clamp-2 font-serif text-sm font-semibold text-foreground">
          {item.title}
        </span>
      </Link>

      <div className="flex flex-col gap-1">
        {item.subtitle && (
          <span className="line-clamp-1 font-serif text-xs italic text-muted-foreground">
            {item.subtitle}
          </span>
        )}
        {(item.publisher || item.pageCount) && (
          <span className="line-clamp-1 text-xs text-muted-foreground">
            {[item.publisher, item.pageCount ? `${item.pageCount} págs.` : null]
              .filter(Boolean)
              .join(" · ")}
          </span>
        )}
        {progress && (
          <ProgressBar
            current={progress.current}
            total={progress.total}
            label={progress.label}
          />
        )}
        {inCollection
          ? (item.rating !== null || item.rereadCount > 0) && (
              // Frame B: relecturas y nota juntas en una línea mono.
              <span className="line-clamp-1 font-mono text-[9.5px] text-muted-foreground">
                {[
                  item.rereadCount > 0
                    ? t(`rereadCount.${item.itemType}`, {
                        count: item.rereadCount,
                      })
                    : null,
                  item.rating !== null ? `★ ${item.rating}` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            )
          : item.rereadCount > 0 && (
              <span className="line-clamp-1 text-xs text-muted-foreground">
                {t(`rereadCount.${item.itemType}`, { count: item.rereadCount })}
              </span>
            )}
      </div>

      {isOwner && (
        <>
          <button
            type="button"
            disabled={isPending}
            onClick={() =>
              run("toggle", async () => {
                const result = await toggleFavorite(item.entryId);
                // toggleFavorite devuelve {error} en vez de lanzar: lo pasamos a
                // throw para que el hook haga rollback del pin optimista.
                if (result.error) throw new Error("pin_failed");
              })
            }
            className="inline-flex items-center gap-1 text-left text-xs text-muted-foreground underline hover:text-foreground disabled:opacity-60"
          >
            <SparklesIcon className="h-3.5 w-3.5" />
            {pinned ? t("unpin") : t("pin")}
          </button>
          {failed && (
            <p className="text-xs text-status-dropped">{t("pinError")}</p>
          )}
        </>
      )}
    </div>
  );
}
