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
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <div className="flex gap-6 border-b border-border">
        {order.map((id) => {
          const isActive = tab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => selectTab(id)}
              className={`-mb-px border-b-2 px-1 pb-3 font-mono text-xs tracking-wider uppercase transition-colors ${
                isActive
                  ? `${accent.border} text-foreground`
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {labels[id]}
            </button>
          );
        })}
      </div>

      <div className="pt-6">{slots[tab]}</div>
    </div>
  );
}
