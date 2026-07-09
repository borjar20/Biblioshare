"use client";

import { useState, type ReactNode } from "react";
import type { ItemType } from "@/lib/catalog/types";
import { MEDIA_ACCENT } from "@/lib/catalog/media-accent";

type TabId = "info" | "community" | "log";

// Client tab switcher for the item detail page. Slots are server-rendered on
// the page and handed in as props, so data fetching stays on the server.
export function ItemDetailTabs({
  itemType,
  labels,
  info,
  community,
  log,
}: {
  itemType: ItemType;
  labels: Record<TabId, string>;
  info: ReactNode;
  community: ReactNode;
  log: ReactNode;
}) {
  const [tab, setTab] = useState<TabId>("info");
  const accent = MEDIA_ACCENT[itemType];
  const order: TabId[] = ["info", "community", "log"];
  const slots: Record<TabId, ReactNode> = { info, community, log };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <div className="flex gap-6 border-b border-border">
        {order.map((id) => {
          const isActive = tab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
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
