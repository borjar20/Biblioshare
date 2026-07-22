import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { deriveTimeline, sortByPublication } from "@/lib/sagas/derive-timeline";
import type { SagaDetail } from "@/lib/sagas/get-saga-detail";
import { sagaHref } from "@/lib/catalog/item-href";
import { GraphLegend } from "./graph/graph-legend";
import { SagaGraphLazy } from "./graph/saga-graph-lazy";
import { MapCta } from "./map-cta";
import { ReadingTimeline } from "./reading-timeline";
import { RoleChip } from "./role-chip";
import { RouteSelector } from "./route-selector";
import { RouteView } from "./route-view";

// Pestaña «Mapa de lectura» (spec §2.4, frames B/E). Lectura = timeline (móvil)
// + grafo embebido (PC). Publicación = lista lineal por año (ambos). Cualquier
// otra ruta (curada) se delega a RouteView.
export async function SagaMapTab({
  detail,
  activeRoute,
  canEdit,
}: {
  detail: SagaDetail;
  activeRoute: string;
  canEdit?: boolean;
}) {
  const t = await getTranslations("saga");
  const graph = detail.graph;
  const base = sagaHref(detail.saga.id);
  const allMembers = detail.groups.flatMap((g) => g.members);

  return (
    <div className="flex flex-col gap-4 px-4 pb-10">
      <RouteSelector base={base} routes={detail.routes} active={activeRoute} />

      {activeRoute === "publicacion" ? (
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
      ) : activeRoute === "lectura" && graph ? (
        <>
          {/* Móvil: leyenda arriba, CTA al mapa completo y timeline. */}
          <div className="lg:hidden">
            <GraphLegend graph={graph} />
          </div>
          <div className="flex flex-col lg:hidden">
            {canEdit && (
              <Link
                href={`${base}/mapa/editar`}
                className="mb-2 self-end rounded-lg border border-border px-3 py-1.5 text-[11px] font-semibold text-muted-foreground"
              >
                ✎ {t("editGraph")}
              </Link>
            )}
            <MapCta graph={graph} href={`${base}/mapa`} />
            <ReadingTimeline sections={deriveTimeline(graph)} />
            {/* «Como lista lineal» (frame B): la columna en orden de lectura. */}
            <h3 className="mb-1 mt-6 font-mono text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
              {t("asLinearList")}
            </h3>
            <ol className="divide-y divide-border border-t border-border">
              {/* Issue #167: los nodos sin orderNo ya no se filtran. Antes
                  desaparecían de esta lista por completo — una precuela curada
                  simplemente no existía aquí. El índice impreso sigue saliendo
                  de la posición en la lista (no de orderNo), así que los sueltos
                  van al final numerados de corrido; el chip de rol es lo que
                  distingue "nº 15" de "precuela". */}
              {graph.nodes
                .filter((n) => n.kind === "item")
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
                        {n.role !== null && (
                          <span className="mt-0.5 block">
                            <RoleChip role={n.role} />
                          </span>
                        )}
                        {n.groupName && (
                          <span className="block font-mono text-[9px] text-muted-foreground">{n.groupName}</span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
            </ol>
          </div>
          {/* PC: grafo embebido con la leyenda como barra inferior del marco (frame E). */}
          <div className="hidden flex-col lg:flex">
            {canEdit && (
              <Link
                href={`${base}/mapa/editar`}
                className="mb-2 self-end rounded-lg border border-border px-3 py-1.5 text-[11px] font-semibold text-muted-foreground"
              >
                ✎ {t("editGraph")}
              </Link>
            )}
            <div className="overflow-hidden rounded-2xl border border-border">
              <SagaGraphLazy graph={graph} className="h-[640px] w-full" />
            </div>
            <div className="mt-3">
              <GraphLegend graph={graph} />
            </div>
          </div>
        </>
      ) : (
        <RouteView detail={detail} slug={activeRoute} canEdit={canEdit} />
      )}
    </div>
  );
}
