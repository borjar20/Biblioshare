"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { FeedEntry, FeedFilter } from "@/lib/social/feed";
import { loadMoreFeed } from "@/lib/social/feed-actions";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { UsersIcon } from "@/components/ui/icons";
import { FeedCard } from "./feed-card";
import { ClubFeedCard } from "./club-feed-card";

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
  filter,
  viewerLoggedIn,
}: {
  initialEvents: FeedEntry[];
  initialCursor: string | null;
  filter?: FeedFilter;
  viewerLoggedIn: boolean;
}) {
  const t = useTranslations("feed");
  const [extraEvents, setExtraEvents] = useState<FeedEntry[]>([]);
  const [cursor, setCursor] = useState(initialCursor);
  const [isPending, startTransition] = useTransition();

  const events = [...initialEvents, ...extraEvents];

  function loadMore() {
    startTransition(async () => {
      const page = await loadMoreFeed(cursor, filter);
      setExtraEvents((prev) => [...prev, ...page.events]);
      setCursor(page.nextCursor);
    });
  }

  if (events.length === 0) {
    return (
      <EmptyState
        glyph={<UsersIcon className="h-7 w-7" />}
        title={t("emptyTitle")}
        message={t("empty")}
        action={
          <Link
            href="/buscar?modo=personas"
            className={buttonVariants("primary")}
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
    <div className="flex flex-col gap-3">
      {events.map((entry) =>
        entry.source === "club" ? (
          <ClubFeedCard key={entry.id} event={entry.event} />
        ) : (
          <FeedCard key={entry.id} event={entry.event} viewerLoggedIn={viewerLoggedIn} />
        ),
      )}
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
