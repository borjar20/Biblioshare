"use client";

import { useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type TabId = "panel" | "following";
const VALID_TABS: readonly string[] = ["panel", "following"];
const ORDER: TabId[] = ["panel", "following"];

// Tab switcher del home (EPIC-05, Bloque C). Mismo mecanismo ?tab= que
// item-detail-tabs.tsx (Bloque B): slots pre-renderizados en el servidor,
// el cliente solo elige cuál mostrar y sincroniza la URL. Al volver a
// "panel" se limpian los filtros del feed (itemType/reviewsOnly) — no tiene
// sentido arrastrarlos fuera de la pestaña Siguiendo.
export function HomeTabs({
  labels,
  panel,
  following,
}: {
  labels: Record<TabId, string>;
  panel: ReactNode;
  following: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlTab = searchParams.get("tab");
  const initialTab: TabId =
    urlTab && VALID_TABS.includes(urlTab) ? (urlTab as TabId) : "panel";
  const [tab, setTab] = useState<TabId>(initialTab);
  const slots: Record<TabId, ReactNode> = { panel, following };

  function selectTab(id: TabId) {
    setTab(id);
    const params = new URLSearchParams(searchParams.toString());
    if (id === "panel") {
      params.delete("tab");
      params.delete("itemType");
      params.delete("reviewsOnly");
    } else {
      params.set("tab", id);
    }
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-6 border-b border-border">
        {ORDER.map((id) => {
          const isActive = tab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => selectTab(id)}
              className={`-mb-px border-b-2 px-1 pb-3 font-mono text-xs tracking-wider uppercase transition-colors ${
                isActive
                  ? "border-accent text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {labels[id]}
            </button>
          );
        })}
      </div>
      {slots[tab]}
    </div>
  );
}
