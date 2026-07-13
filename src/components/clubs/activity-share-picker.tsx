"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { FeedEvent } from "@/lib/social/feed";
import { loadOwnRecentActivity } from "./club-post-actions";

// Lista las FeedEvents recientes propias del viewer para elegir cuál
// compartir a un club (EPIC-05 Bloque F, decisión de sesión: comparte
// cualquier actividad reciente propia, no solo reseñas -- mismo modelo
// unificado de Bloque C).
export function ActivitySharePicker({
  onPick,
  onCancel,
}: {
  onPick: (event: FeedEvent) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("clubPost");
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOwnRecentActivity().then((page) => {
      setEvents(page);
      setLoading(false);
    });
  }, []);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
      <span className="text-sm font-medium text-foreground">{t("pickActivity")}</span>
      {loading && <p className="text-xs text-muted-foreground">…</p>}
      {!loading && events.length === 0 && (
        <p className="text-xs text-muted-foreground">{t("noActivityToShare")}</p>
      )}
      <div className="flex max-h-64 flex-col gap-1 overflow-y-auto">
        {events.map((e) => (
          <button
            key={e.id}
            type="button"
            onClick={() => onPick(e)}
            className="flex items-center gap-2 rounded-md p-2 text-left text-sm hover:bg-surface-muted"
          >
            {e.itemCoverUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- portada externa/Storage, mismo criterio que otras tarjetas de catálogo
              <img src={e.itemCoverUrl} alt="" className="h-10 w-7 shrink-0 rounded object-cover" />
            )}
            <span className="min-w-0 flex-1 truncate">{e.itemTitle}</span>
          </button>
        ))}
      </div>
      <button type="button" onClick={onCancel} className="self-start text-xs text-muted-foreground hover:text-foreground">
        {t("cancel")}
      </button>
    </div>
  );
}
