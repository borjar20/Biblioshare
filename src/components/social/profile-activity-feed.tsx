"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import type { FeedEntry } from "@/lib/social/feed";
import { loadMoreProfileFeed } from "@/lib/social/feed-actions";
import { FeedItem } from "./feed-item";

// Agrupa por día natural. La clave es la parte de fecha (los eventos "added"
// traen timestamp completo; los demás, date), para no partir un mismo día por
// husos horarios.
function dayKey(eventDate: string): string {
  return eventDate.slice(0, 10);
}

// La Actividad del perfil (plan 05, P4/P5): el mismo feed que ve un visitante,
// agrupado por día — cada tarjeta se despacha con FeedItem, igual que el feed
// general. Todos los eventos son del dueño del perfil; la cabecera del día ya
// da ese contexto (las tarjetas siguen pintando su propio actor: ninguna de
// las tres variantes por verbo soporta ocultarlo). La paginación arrastra el
// actor, no tus seguidos.
export function ProfileActivityFeed({
  actorId,
  initialEvents,
  initialCursor,
  initialKnownUsernames,
  viewerLoggedIn,
}: {
  actorId: string;
  initialEvents: FeedEntry[];
  initialCursor: string | null;
  /** Usernames @mencionados que existen de verdad, resueltos server-side (resolveKnownMentions). */
  initialKnownUsernames: string[];
  viewerLoggedIn: boolean;
}) {
  const t = useTranslations("profile");
  const tFeed = useTranslations("feed");
  const [extraEvents, setExtraEvents] = useState<FeedEntry[]>([]);
  const [cursor, setCursor] = useState(initialCursor);
  const [known, setKnown] = useState(initialKnownUsernames);
  const [isPending, startTransition] = useTransition();

  const events = [...initialEvents, ...extraEvents];

  function labelFor(key: string): string {
    const today = new Date();
    const todayKey = toKey(today);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (key === todayKey) return t("activityToday");
    if (key === toKey(yesterday)) return t("activityYesterday");
    // "14 jul" — día y mes corto, sin año.
    return new Date(`${key}T00:00:00`).toLocaleDateString("es", {
      day: "numeric",
      month: "short",
    });
  }

  function loadMore() {
    startTransition(async () => {
      const page = await loadMoreProfileFeed(actorId, cursor);
      setExtraEvents((prev) => [...prev, ...page.events]);
      setCursor(page.nextCursor);
      setKnown((prev) => [...new Set([...prev, ...page.knownUsernames])]);
    });
  }

  // Agrupación en orden: los eventos ya vienen ordenados por fecha desc, así
  // que basta recorrerlos y abrir un grupo nuevo cuando cambia el día.
  const groups: { key: string; entries: FeedEntry[] }[] = [];
  for (const entry of events) {
    const key = dayKey(entry.eventDate);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.entries.push(entry);
    else groups.push({ key, entries: [entry] });
  }

  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <div key={group.key} className="flex flex-col gap-3">
          <h5
            suppressHydrationWarning
            className="font-mono text-[11px] font-medium tracking-wider text-muted-foreground uppercase"
          >
            {labelFor(group.key)}
          </h5>
          {group.entries.map((entry) => (
            // El feed de actor no trae eventos de club (getFeed los apaga),
            // pero puede traer "person-group" (altas/avances agrupados del
            // propio dueño) además de "person" sueltos — FeedItem despacha
            // por verbo y cubre ambos, a diferencia del FeedCard viejo que
            // solo sabía pintar "person" (los grupos quedaban invisibles
            // aquí). Sin `hideActor`: ni Colección ni Avances lo soportan
            // (siempre pintan su propio actor), así que esta vista ya no
            // oculta el avatar del dueño — el encabezado del día basta para
            // dar contexto de todos modos.
            <FeedItem key={entry.id} entry={entry} viewerLoggedIn={viewerLoggedIn} knownUsernames={known} />
          ))}
        </div>
      ))}
      {cursor && (
        <button
          type="button"
          disabled={isPending}
          onClick={loadMore}
          className="self-center rounded-full border border-border px-5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-surface-muted disabled:opacity-50"
        >
          {tFeed("loadMore")}
        </button>
      )}
    </div>
  );
}

function toKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}
