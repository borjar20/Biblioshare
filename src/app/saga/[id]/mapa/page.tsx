import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { getSagaDetail } from "@/lib/sagas/get-saga-detail";
import { sagaHref } from "@/lib/catalog/item-href";
import { GraphLegend } from "@/components/saga/graph/graph-legend";
import { SagaGraphLazy } from "@/components/saga/graph/saga-graph-lazy";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createClient();
  const { data: saga } = await supabase.from("sagas").select("name").eq("id", id).maybeSingle();
  return { title: saga ? `${saga.name} · Mapa — Biblioshare` : "Biblioshare" };
}

// Mapa a pantalla completa (frame C): pensado para móvil; en PC el grafo ya va
// embebido en la ficha (frame E), pero la ruta funciona igual si se comparte
// un link directo. Sin grafo no hay nada que enseñar aquí: redirige a la
// ficha en vez de dejar el visor vacío. `detail.graph` (no `hasGraph`) es
// aposta: desde `resolveSagaGraph` (fase 3, Task 4-bis, arreglo tras
// revisión) `graph` ya es `null` tanto sin nada curado como con el
// interruptor `show_map` apagado, así que un link directo a esta URL con el
// interruptor apagado redirige igual que si la saga no tuviera nada que
// dibujar — el interruptor manda aquí también, sin que este archivo tenga que
// mirarlo explícitamente.
export default async function SagaMapPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("saga");
  const supabase = await createClient();

  const detail = await getSagaDetail(supabase, id);
  if (!detail) notFound();
  const graph = detail.graph;
  if (!graph) redirect(sagaHref(id));

  return (
    <div className="relative h-dvh w-full">
      <SagaGraphLazy graph={graph} className="h-full w-full" showZoomControls />

      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center gap-3 bg-gradient-to-b from-black/70 to-transparent p-4">
        <Link
          href={sagaHref(id)}
          aria-label={t("backToSaga")}
          className="pointer-events-auto grid h-9 w-9 place-items-center rounded-lg bg-white/10 text-base text-[#f0e6d4] backdrop-blur"
        >
          ‹
        </Link>
        <div className="min-w-0">
          <p className="truncate font-serif text-[15px] font-semibold text-[#f0e6d4]">{detail.saga.name}</p>
          <p className="font-mono text-[9px] uppercase tracking-widest text-[#b9a986]">
            {t("mapTitle", { count: detail.memberCount })}
          </p>
        </div>
      </header>

      <p className="pointer-events-none absolute left-1/2 top-16 z-10 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1.5 font-mono text-[10px] text-[#b9a986] backdrop-blur">
        {t("mapHint")}
      </p>

      <div className="absolute inset-x-0 bottom-0 z-10 rounded-t-2xl border-t border-border bg-background/95 px-4 pb-4 pt-2 backdrop-blur">
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-surface-muted" />
        <GraphLegend graph={graph} />
      </div>
    </div>
  );
}
