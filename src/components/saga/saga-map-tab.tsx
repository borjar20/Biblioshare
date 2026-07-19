import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { deriveTimeline, sortByPublication } from "@/lib/sagas/derive-timeline";
import type { SagaDetail } from "@/lib/sagas/get-saga-detail";
import { sagaHref } from "@/lib/catalog/item-href";
import { GraphLegend } from "./graph/graph-legend";
import { SagaGraphView } from "./graph/saga-graph-view";
import { MapCta } from "./map-cta";
import { OrderToggle } from "./order-toggle";
import { ReadingTimeline } from "./reading-timeline";

// Pestaña «Mapa de lectura» (spec §2.4, frames B/E). Lectura = timeline (móvil)
// + grafo embebido (PC). Publicación = lista lineal por año (ambos).
export async function SagaMapTab({
  detail,
  orden,
}: {
  detail: SagaDetail;
  orden: "lectura" | "publicacion";
}) {
  const t = await getTranslations("saga");
  const graph = detail.graph;
  if (!graph) return null;
  const base = sagaHref(detail.saga.id);
  const allMembers = detail.groups.flatMap((g) => g.members);

  return (
    <div className="flex flex-col gap-4 px-4 pb-10">
      <OrderToggle base={base} orden={orden} />

      {orden === "publicacion" ? (
        <ol className="divide-y divide-border border-t border-border">
          {sortByPublication(allMembers).map((m, i) => (
            <li key={`${m.itemType}-${m.itemId}`}>
              <Link href={m.href} className="flex items-center gap-3 py-2.5">
                <span className="w-6 shrink-0 text-right font-mono text-[11px] text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="relative h-[45px] w-[30px] shrink-0 overflow-hidden rounded">
                  {m.coverUrl && <Image src={m.coverUrl} alt="" fill sizes="30px" className="object-cover" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-semibold">{m.title}</span>
                  {m.year !== null && (
                    <span className="block font-mono text-[9px] text-muted-foreground">{m.year}</span>
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <>
          <GraphLegend graph={graph} />
          {/* Móvil: CTA al mapa completo + timeline. PC: grafo embebido. */}
          <div className="lg:hidden">
            <MapCta graph={graph} href={`${base}/mapa`} />
            <ReadingTimeline sections={deriveTimeline(graph)} />
            {/* «Como lista lineal» (frame B): la columna en orden de lectura. */}
            <h3 className="mb-1 mt-6 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              {t("asLinearList")}
            </h3>
            <ol className="divide-y divide-border border-t border-border">
              {graph.nodes
                .filter((n) => n.kind === "item" && n.orderNo !== null)
                .map((n, i) => (
                  <li key={n.id}>
                    <Link href={n.href} className="flex items-center gap-3 py-2.5">
                      <span className="w-6 shrink-0 text-right font-mono text-[11px] text-muted-foreground">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="relative h-[45px] w-[30px] shrink-0 overflow-hidden rounded">
                        {n.coverUrl && <Image src={n.coverUrl} alt="" fill sizes="30px" className="object-cover" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-semibold">{n.label}</span>
                        {n.groupName && (
                          <span className="block font-mono text-[9px] text-muted-foreground">{n.groupName}</span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
            </ol>
          </div>
          <div className="hidden overflow-hidden rounded-2xl border border-border lg:block">
            <SagaGraphView graph={graph} className="h-[640px] w-full" />
          </div>
        </>
      )}
    </div>
  );
}
