"use client";

import { useEffect, useEffectEvent, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { FeedEntry, FeedFilter } from "@/lib/social/feed";
import { loadMoreFeed } from "@/lib/social/feed-actions";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { UsersIcon } from "@/components/ui/icons";
import { FeedItem } from "./feed-item";

// Lista del feed con paginación "Cargar más" (EPIC-05, Bloque C). Los eventos
// de la primera página llegan siempre frescos vía `initialEvents` (Next.js
// refresca el árbol de Server Components de la ruta actual tras cualquier
// Server Action, incluida una reacción/comentario dentro de una tarjeta) — el
// estado cliente solo acumula los eventos cargados con "Cargar más"
// (`extraEvents`), nunca los iniciales, para que interactuar con un evento de
// la primera página se refleje sin recargar. `itemType`/`reviewsOnly` viven
// en la URL (aplicados server-side por FeedFilters); page.tsx da a este
// componente una `key` derivada de esos filtros para que un cambio de filtro
// lo remonte por completo en vez de arrastrar estado obsoleto.
export function FeedList({
  initialEvents,
  initialCursor,
  initialKnownUsernames,
  filter,
  viewerLoggedIn,
}: {
  initialEvents: FeedEntry[];
  initialCursor: string | null;
  /** Usernames @mencionados que existen de verdad, resueltos server-side (resolveKnownMentions). */
  initialKnownUsernames: string[];
  filter?: FeedFilter;
  viewerLoggedIn: boolean;
}) {
  const t = useTranslations("feed");
  const [extraEvents, setExtraEvents] = useState<FeedEntry[]>([]);
  const [cursor, setCursor] = useState(initialCursor);
  const [known, setKnown] = useState(initialKnownUsernames);
  const [isPending, startTransition] = useTransition();
  // Un fallo apaga la carga automática: el centinela sigue a la vista y, sin
  // este freno, cada re-render volvería a pedir la misma página en bucle. En
  // lugar del spinner aparece entonces un botón de reintento.
  const [autoLoadFailed, setAutoLoadFailed] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const events = [...initialEvents, ...extraEvents];

  function loadMore() {
    startTransition(async () => {
      try {
        const page = await loadMoreFeed(cursor, filter);
        setExtraEvents((prev) => [...prev, ...page.events]);
        setCursor(page.nextCursor);
        // Se acumula: los eventos ya pintados de páginas anteriores siguen
        // necesitando su set de known para no perder enlaces.
        setKnown((prev) => [...new Set([...prev, ...page.knownUsernames])]);
        setAutoLoadFailed(false);
      } catch (error) {
        console.error("loadMoreFeed failed", error);
        setAutoLoadFailed(true);
      }
    });
  }

  // Scroll infinito: un centinela tras la última tarjeta pide la página
  // siguiente cuando entra en pantalla (con margen, para que llegue antes de
  // tocar fondo). IntersectionObserver y no un listener de scroll: no corre en
  // cada frame. Se re-observa tras cada carga, así que si la página nueva no
  // llena la pantalla y el centinela sigue visible, encadena la siguiente.
  const onSentinelVisible = useEffectEvent(loadMore);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !cursor || isPending || autoLoadFailed) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) onSentinelVisible();
      },
      { rootMargin: "0px 0px 600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [cursor, isPending, autoLoadFailed]);

  if (events.length === 0) {
    return (
      <EmptyState
        glyph={<UsersIcon className="h-7 w-7" />}
        title={t("emptyTitle")}
        message={t("empty")}
        // `secondary` por la misma razón que `stats-welcome`: en el arranque en
        // frío este vacío convive con el CTA de la columna personal, y la regla
        // es un primario por vista. Seguir a gente sin tener nada propio
        // registrado deja el feed igual de vacío.
        action={
          <Link
            href="/buscar?modo=personas"
            className={buttonVariants("secondary")}
          >
            {t("emptyCta")}
          </Link>
        }
        secondary={
          <Link
            href="/clubes"
            className="text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            {t("emptyClubs")}
          </Link>
        }
      />
    );
  }

  return (
    // Móvil (posts Spec 2b): las tarjetas dejan de ser tarjetas → filas a ancho
    // completo con separadores. Se hace en el contenedor (variante descendiente
    // sobre los <article> de cada card) para no tocar las 6 tarjetas: sin gap, y
    // a cada article se le quita radio/sombra/bordes laterales-y-superior dejando
    // solo el inferior como separador (el del último se retira). En sm+ vuelve a
    // ser la lista de tarjetas de siempre.
    <div className="flex flex-col gap-3 max-sm:-mx-5 max-sm:gap-0 max-sm:[&>article]:rounded-none max-sm:[&>article]:border-x-0 max-sm:[&>article]:border-t-0 max-sm:[&>article]:shadow-none max-sm:[&>article:last-of-type]:border-b-0">
      {events.map((entry) => (
        <FeedItem key={entry.id} entry={entry} viewerLoggedIn={viewerLoggedIn} knownUsernames={known} />
      ))}
      {cursor && <div ref={sentinelRef} aria-hidden="true" data-testid="feed-sentinel" />}
      {/* Pie de alto fijo mientras quede algo por cargar: spinner (el mismo
          dibujo que `ui/load-more`) o, si la carga falló, el único botón que
          queda, el de reintentar. El alto fijo evita que el pie salte al
          cambiar de uno a otro. */}
      {cursor && (
        <div className="flex min-h-11 items-center justify-center py-2">
          {autoLoadFailed ? (
            <button
              type="button"
              disabled={isPending}
              onClick={loadMore}
              className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-50"
            >
              {t("loadMoreRetry")}
            </button>
          ) : (
            <>
              <span
                aria-hidden
                data-testid="feed-loading"
                className="size-5 animate-spin rounded-full border-2 border-muted-foreground/40 border-t-transparent motion-reduce:animate-none"
              />
              <span role="status" className="sr-only">
                {isPending ? t("loadingMore") : ""}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
