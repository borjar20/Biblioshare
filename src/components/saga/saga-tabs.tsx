"use client";

import { useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Conmutador Info | Mapa de lectura (spec §2.2). Mismo patrón que
// ItemDetailTabs (src/components/detail/item-detail-tabs.tsx): slots
// server-rendered como props, estado propio sincronizado con `?tab=`. `map`
// llega `null` cuando la saga no tiene grafo (detail.hasGraph=false) — la
// pestaña ni se pinta ni el toggle puede aterrizar en ella.
export function SagaTabs({
  labels,
  info,
  map,
}: {
  labels: { info: string; map: string };
  info: ReactNode;
  map: ReactNode | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlTab = searchParams.get("tab") === "mapa" && map ? "mapa" : "info";
  const [tab, setTab] = useState<"info" | "mapa">(urlTab);

  // Re-sincroniza si la URL cambia desde fuera (deep link / toggle de orden).
  const [prevUrlTab, setPrevUrlTab] = useState(urlTab);
  if (urlTab !== prevUrlTab) {
    setPrevUrlTab(urlTab);
    if (urlTab !== tab) setTab(urlTab);
  }

  function select(next: "info" | "mapa") {
    setTab(next);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "info") {
      params.delete("tab");
      params.delete("orden");
    } else params.set("tab", "mapa");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  const cls = (on: boolean) =>
    `relative flex items-center gap-1.5 pb-3 text-sm font-semibold ${on ? "text-foreground" : "text-muted-foreground"}`;

  return (
    <>
      <nav className="flex gap-6 border-b border-border px-4">
        <button type="button" className={cls(tab === "info")} onClick={() => select("info")}>
          {labels.info}
          {tab === "info" && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded bg-accent" />}
        </button>
        {map && (
          <button type="button" className={cls(tab === "mapa")} onClick={() => select("mapa")}>
            {labels.map}
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            {tab === "mapa" && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded bg-accent" />}
          </button>
        )}
      </nav>
      {tab === "mapa" && map ? map : info}
    </>
  );
}
