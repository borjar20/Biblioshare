"use client";

import { useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ItemType } from "@/lib/catalog/types";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";

type TabId = "info" | "episodes" | "community" | "log";
const VALID_TABS: readonly string[] = ["info", "episodes", "community", "log"];

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
  labels: Partial<Record<TabId, string>>;
  info: ReactNode;
  episodes?: ReactNode;
  community: ReactNode;
  log: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlTab = searchParams.get("tab");
  const initialTab: TabId =
    urlTab && VALID_TABS.includes(urlTab) ? (urlTab as TabId) : "info";
  const [tab, setTab] = useState<TabId>(initialTab);
  const accent = MEDIA_ACCENT[itemType];
  const order: TabId[] = episodes
    ? ["info", "episodes", "community", "log"]
    : ["info", "community", "log"];
  const slots: Record<TabId, ReactNode> = { info, episodes, community, log };

  function selectTab(id: TabId) {
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
      {/* Sans semibold (NO el mono de las subtabs — aquí la maqueta escribe
          Geist) y subrayado del acento, en las dos vistas. Cambia la piel:
          móvil (.tabs) va translúcida con blur sobre el fondo; PC
          (.desk-tabs) va opaca sobre surface, con borde arriba, más aire y
          texto de 15. Pegada bajo la topbar en ambas. */}
      <div className="sticky top-[var(--topbar-h)] z-10 border-b border-border bg-background/90 backdrop-blur-md lg:border-t lg:bg-background lg:backdrop-blur-none">
        <div className="mx-auto flex w-full max-w-4xl gap-5 px-4 sm:px-6 lg:max-w-none lg:gap-8 lg:px-11">
          {order.map((id) => {
            const isActive = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => selectTab(id)}
                className={`relative pt-3 pb-[11px] text-[13.5px] font-semibold whitespace-nowrap transition-colors lg:py-4 lg:text-[15px] ${
                  isActive
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {labels[id]}
                {isActive && (
                  <span
                    aria-hidden
                    className={`absolute inset-x-0 -bottom-px h-0.5 rounded-sm lg:h-[2.5px] ${accent.bg}`}
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
