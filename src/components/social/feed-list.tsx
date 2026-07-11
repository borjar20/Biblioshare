"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { FeedEvent } from "@/lib/social/feed";
import type { ItemType } from "@/lib/catalog/types";
import { loadMoreFeed } from "@/lib/social/feed-actions";
import { FeedCard } from "./feed-card";

// Lista del feed con paginación "Cargar más" (EPIC-05, Bloque C). Los eventos
// de la primera página llegan siempre frescos vía `initialEvents` (Next.js
// refresca el árbol de Server Components de la ruta actual tras cualquier
// Server Action, incluida una reacción/comentario dentro de un FeedCard) — el
// estado cliente solo acumula los eventos cargados con "Cargar más"
// (`extraEvents`), nunca los iniciales, para que interactuar con un evento de
// la primera página se refleje sin recargar. `itemType`/`reviewsOnly` viven
// en la URL (aplicados server-side por FeedFilters); page.tsx da a este
// componente una `key` derivada de esos filtros para que un cambio de filtro
// lo remonte por completo en vez de arrastrar estado obsoleto.
export function FeedList({
  initialEvents,
  initialCursor,
  itemType,
  reviewsOnly,
  viewerLoggedIn,
}: {
  initialEvents: FeedEvent[];
  initialCursor: string | null;
  itemType?: ItemType;
  reviewsOnly?: boolean;
  viewerLoggedIn: boolean;
}) {
  const t = useTranslations("feed");
  const [extraEvents, setExtraEvents] = useState<FeedEvent[]>([]);
  const [cursor, setCursor] = useState(initialCursor);
  const [isPending, startTransition] = useTransition();

  const events = [...initialEvents, ...extraEvents];

  function loadMore() {
    startTransition(async () => {
      const page = await loadMoreFeed(cursor, itemType, reviewsOnly);
      setExtraEvents((prev) => [...prev, ...page.events]);
      setCursor(page.nextCursor);
    });
  }

  if (events.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface p-8 text-center">
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
        <Link href="/usuarios" className="text-sm font-medium text-accent hover:underline">
          {t("emptyCta")}
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {events.map((event) => (
        <FeedCard key={event.id} event={event} viewerLoggedIn={viewerLoggedIn} />
      ))}
      {cursor && (
        <button
          type="button"
          disabled={isPending}
          onClick={loadMore}
          className="self-center rounded-full border border-border px-5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted disabled:opacity-50"
        >
          {t("loadMore")}
        </button>
      )}
    </div>
  );
}
