"use client";

import { useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ItemType } from "@/lib/catalog/types";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";
import { useItemStatus } from "./item-status-context";
import {
  detailTabOrder,
  clampDetailTab,
  type DetailTabId,
} from "./tab-visibility";

// Client tab switcher for the item detail page. Slots are server-rendered on
// the page and handed in as props, so data fetching stays on the server.
// `episodes` es opcional: solo las series lo pasan (§7.x). El tab inicial se
// lee de `?tab=` (usado por los deep links de notificaciones, EPIC-05 Bloque B)
// y por defecto sigue siendo "info" si no hay query param, igual que antes.
export function ItemDetailTabs({
  itemType,
  labels,
  info,
  episodes,
  community,
  log,
}: {
  itemType: ItemType;
  labels: Partial<Record<DetailTabId, string>>;
  info: ReactNode;
  episodes?: ReactNode;
  community: ReactNode;
  log: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlTab = searchParams.get("tab");

  // Fuente única del "seguido o no": el mismo contexto que pinta el badge del
  // hero. followed=false esconde la pestaña "log" (Mi registro).
  const { status } = useItemStatus();
  const followed = status !== null;
  const order = detailTabOrder(Boolean(episodes), followed);

  const [tab, setTab] = useState<DetailTabId>(() =>
    clampDetailTab(urlTab, order),
  );

  // Re-sincroniza la pestaña activa cuando cambia la ?tab= de FUERA (deep link,
  // o el ?tab=log que pone el botón "Seguir" del hero) O cuando cambia el estado
  // de seguido. La clave combinada evita la carrera: al seguir, `setStatus` y
  // `router.replace(?tab=log)` pueden aterrizar en renders distintos; cualquiera
  // que llegue el segundo re-dispara este ajuste y conmuta a "log" ya con el
  // order que incluye la pestaña. Ajuste durante el render, no useEffect.
  const syncKey = `${urlTab ?? ""}|${followed}`;
  const [prevSyncKey, setPrevSyncKey] = useState(syncKey);
  if (syncKey !== prevSyncKey) {
    setPrevSyncKey(syncKey);
    const next = clampDetailTab(urlTab, order);
    if (next !== tab) setTab(next);
  }

  const accent = MEDIA_ACCENT[itemType];
  const slots: Record<DetailTabId, ReactNode> = {
    info,
    episodes,
    community,
    log,
  };

  function selectTab(id: DetailTabId) {
    setTab(id);
    const params = new URLSearchParams(searchParams.toString());
    if (id === "info") params.delete("tab");
    else params.set("tab", id);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }

  return (
    <div className="flex flex-col">
      {/* Sans (NO el mono de las subtabs — aquí la maqueta escribe Geist),
          subrayado del acento y pegada bajo la topbar, en las dos vistas.
          Cambia la piel: en PC el texto es más pequeño (14) y más ligero, y
          las inactivas bajan a `faint` — un peldaño más claro que `muted`:
          en el ancho hay menos ruido y la activa se distingue sola.
          Sin scroll horizontal: caben (comprobado con 4 pestañas a 390).
          .desk-tabs de "Web - Ficha de titulo (PC).html". */}
      <div className="sticky top-[var(--topbar-h)] z-10 border-b border-border bg-background/90 backdrop-blur-md lg:bg-background/80 lg:backdrop-blur-[10px]">
        <div className="mx-auto flex w-full max-w-4xl gap-5 px-4 sm:px-6 lg:max-w-none lg:gap-7 lg:px-11">
          {order.map((id) => {
            const isActive = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => selectTab(id)}
                className={`relative pt-3 pb-[11px] text-[13.5px] font-semibold whitespace-nowrap transition-colors lg:py-3.5 lg:text-sm ${
                  isActive
                    ? "text-foreground lg:font-semibold"
                    : "text-muted-foreground hover:text-foreground lg:font-medium lg:text-foreground-faint lg:hover:text-foreground"
                }`}
              >
                {labels[id]}
                {isActive && (
                  <span
                    aria-hidden
                    className={`absolute inset-x-0 -bottom-px h-0.5 rounded-sm ${accent.bg}`}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:max-w-none lg:px-11 lg:pt-[34px] lg:pb-[42px]">
        {slots[tab]}
      </div>
    </div>
  );
}
