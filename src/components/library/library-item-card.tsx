"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { LibraryItem } from "@/lib/library/types";
import { itemHref } from "@/lib/catalog/item-href";
import { formatDots } from "@/lib/rating/dots";
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
          <div
            // `gap-3` y no `gap-1.5`: los dos disparadores dibujan 32 px y con
            // `tap-44` cada uno crece a un área táctil de 44. Con 6 px de
            // separación esas dos áreas se solapaban y la de arriba en el orden
            // de pintado le robaba pulsaciones a su vecina — el propio
            // comentario de `tap-44` en globals.css avisa justo de esto. A 12 px
            // los centros quedan a 44 y las áreas se tocan sin invadirse.
            // Alcance: 32 px NO incumple el suelo declarado (WCAG 2.1 AA no
            // legisla tamaño de diana; el 44 es 2.5.5, que es AAA). Se aplica
            // porque `tap-44` es convención del repo, no por el suelo.
            className="absolute right-1.5 bottom-1.5 flex items-center gap-3"
          >
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
              className={`tap-44 grid h-8 w-8 shrink-0 place-items-center rounded-lg border shadow-card transition-colors disabled:opacity-60 ${
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
                  className="tap-44 grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border bg-surface/90 text-[15px] text-foreground shadow-card backdrop-blur transition-colors hover:bg-surface"
                >
                  <span aria-hidden>▤</span>
                </button>
              )}
            />
          </div>
        )}
      </div>

      {/* Título + metadatos (autor + nota/relecturas) en un solo bloque
          compacto. SIN alturas reservadas (`min-h-[2.5rem]` en el título,
          `h-8` aquí): reservaban dos líneas de título y dos de metadatos
          SIEMPRE, y en la mayoría de tarjetas —título de una línea, sin
          nota— eso era un pasillo en blanco entre el título y el autor. La
          rejilla no las necesitaba para alinearse: las filas de CSS grid ya
          igualan su alto y las portadas son `aspect-[2/3]`, así que las
          cubiertas de una misma fila quedan a ras igual. Editorial y barra de
          progreso quedan en la ficha; el estado ya lo da el badge de la
          portada. */}
      <div className="flex flex-col gap-0.5">
        <Link href={itemHref(item.itemType, item.itemId)} className="block">
          <span className="line-clamp-2 font-serif text-sm leading-tight font-semibold text-foreground">
            {item.title}
          </span>
        </Link>
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
              // La nota se guarda 1–10 pero se ENSEÑA sobre 5 en toda la app
              // (RatingDots, media de comunidad, /estadisticas). Esta línea era
              // el único sitio que escupía el valor crudo: un «★ 10» aquí y
              // cinco dots llenos en la ficha eran la misma nota.
              item.rating !== null ? `★ ${formatDots(item.rating)}` : null,
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
