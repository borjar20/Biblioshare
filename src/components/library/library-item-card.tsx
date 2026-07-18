"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { LibraryItem } from "@/lib/library/types";
import { itemHref } from "@/lib/catalog/item-href";
import { StatusBadge } from "@/components/ui/status-badge";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { toggleFavorite } from "@/lib/library/favorite-actions";
import { useOptimisticAction } from "@/lib/reactivity/use-optimistic-action";
import { SparklesIcon } from "@/components/ui/icons";
import { AddToCollectionSheet } from "@/components/library/add-to-collection-sheet";

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
  const accent = MEDIA_ACCENT[item.itemType];

  return (
    <div className="flex flex-col gap-2">
      {/* Portada con overlays: badge de estado arriba y, para el dueño, los
          botones de acción abajo. Ambos van FUERA del <Link> de la portada
          para que pulsarlos no navegue a la ficha; sobre la portada quedan en
          posición FIJA (no dependen de cuántos metadatos tenga la tarjeta). */}
      <div className="relative">
        <Link
          href={itemHref(item.itemType, item.itemId)}
          className={`group block aspect-[2/3] w-full overflow-hidden rounded-cover border ${accent.borderSoft} bg-surface-muted shadow-cover`}
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
        </Link>

        <div className="absolute right-1.5 top-1.5">
          <StatusBadge
            status={item.status}
            label={t(`status.${item.status}`)}
            dotOnly={!inCollection}
            variant={inCollection ? "overlay" : "chip"}
          />
        </div>

        {isOwner && (
          <div className="absolute right-1.5 bottom-1.5 flex items-center gap-1.5">
            <button
              type="button"
              disabled={isPending}
              aria-label={pinned ? t("unpin") : t("pin")}
              title={pinned ? t("unpin") : t("pin")}
              aria-pressed={pinned}
              onClick={() =>
                run("toggle", async () => {
                  const result = await toggleFavorite(item.entryId);
                  // toggleFavorite devuelve {error} en vez de lanzar: lo pasamos
                  // a throw para que el hook haga rollback del pin optimista.
                  if (result.error) throw new Error("pin_failed");
                })
              }
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg border shadow-card transition-colors disabled:opacity-60 ${
                pinned
                  ? "border-gold/50 bg-gold/90 text-white"
                  : "border-border bg-surface/90 text-foreground backdrop-blur hover:bg-surface"
              }`}
            >
              <SparklesIcon className="h-4 w-4" />
            </button>

            {/* Segundo disparador de la hoja «Añadir a colección» (frame D):
            el de la ficha vive en log-panel.tsx. */}
            <AddToCollectionSheet
              itemType={item.itemType}
              itemId={item.itemId}
              renderTrigger={(open) => (
                <button
                  type="button"
                  onClick={open}
                  aria-label={t("addToCollection")}
                  title={t("addToCollection")}
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border bg-surface/90 text-[15px] text-foreground shadow-card backdrop-blur transition-colors hover:bg-surface"
                >
                  <span aria-hidden>▤</span>
                </button>
              )}
            />
          </div>
        )}
      </div>

      <Link href={itemHref(item.itemType, item.itemId)} className="block">
        <span className="line-clamp-2 min-h-[2.5rem] font-serif text-sm leading-tight font-semibold text-foreground">
          {item.title}
        </span>
      </Link>

      {/* Metadatos de altura FIJA (autor + nota/relecturas). Reservar el alto
          —aunque el ítem no traiga datos— es lo que mantiene la rejilla sin
          saltos entre tarjetas con y sin metadatos. Editorial y barra de
          progreso quedan en la ficha; el estado ya lo da el badge de la
          portada. */}
      <div className="flex h-8 flex-col justify-start gap-0.5 overflow-hidden">
        {item.subtitle && (
          <span className="line-clamp-1 font-serif text-xs italic text-muted-foreground">
            {item.subtitle}
          </span>
        )}
        {(item.rating !== null || item.rereadCount > 0) && (
          <span className="line-clamp-1 font-mono text-[9.5px] text-muted-foreground">
            {[
              item.rereadCount > 0
                ? t(`rereadCount.${item.itemType}`, { count: item.rereadCount })
                : null,
              item.rating !== null ? `★ ${item.rating}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        )}
      </div>

      {isOwner && failed && (
        <p className="text-xs text-status-dropped">{t("pinError")}</p>
      )}
    </div>
  );
}
