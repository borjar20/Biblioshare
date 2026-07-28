import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { sagaHref } from "@/lib/catalog/item-href";
import { createCuratedOrder } from "@/lib/sagas/curated-order";
import { deriveTimeline } from "@/lib/sagas/derive-timeline";
import { getRouteEntries } from "@/lib/sagas/get-saga-routes";
import type { SagaGraph } from "@/lib/sagas/map-types";
import { resolveRoute, unnamedMembers } from "@/lib/sagas/resolve-route";
import { isMemberCompleted } from "@/lib/sagas/completion";
import { isSagaAccentToken } from "@/lib/sagas/accents";
import type { SagaDetail } from "@/lib/sagas/get-saga-detail";
import { AdoptRouteButton } from "./adopt-route-button";
import { ReadingTimeline } from "./reading-timeline";
import { RouteBlock } from "./route-block";

// Una ruta curada: cabecera (nombre, resumen, contador PROPIO) + pasos.
// El contador del hero no se toca: sigue diciendo lo del universo entero,
// mires la ruta que mires (spec §Progreso).
export async function RouteView({
  detail,
  slug,
  canEdit,
  graph,
}: {
  detail: SagaDetail;
  slug: string;
  canEdit?: boolean;
  /** Grafo del itinerario activo (con `step` en cada nodo por el que pasa), ya
   *  derivado por `SagaMapTab` — no se deriva aquí para no repetir su
   *  `getRouteEntries` en cada render. `null` cuando la saga no tiene nada
   *  curado o tiene el mapa apagado: entonces se conserva la lista de pasos de
   *  siempre, porque apagar el mapa no puede hacer desaparecer el itinerario. */
  graph: SagaGraph | null;
}) {
  const t = await getTranslations("saga");
  const supabase = await createClient();

  // La ruta activa ya viaja resuelta en detail.routes (getSagaDetail ya llamó
  // a getSagaRoutes): repetir la consulta aquí solo para conseguir el id era
  // un viaje de ida y vuelta redundante en cada render (hallazgo 3).
  const row = detail.routes.find((r) => r.slug === slug);
  if (!row || row.id === undefined) return null;

  const entries = await getRouteEntries(supabase, row.id);

  const members = new Map(detail.groups.flatMap((g) => g.members).map((m) => [`${m.itemType}:${m.itemId}`, m]));
  // "¿Existe esta subsaga?" se decide con TODOS los descendientes
  // (detail.childRefs), no con `detail.groups`: groupMembers solo crea grupo
  // para una hija con al menos un miembro, así que una subsaga vacía era
  // indistinguible de una borrada y su bloque desaparecía sin aviso
  // (hallazgo 2).
  const childNames = new Map(detail.childRefs.map((c) => [c.id, c.name] as const));
  const groupAccentBySagaId = new Map(
    detail.groups.flatMap((g) => (g.sagaId ? [[g.sagaId, g.accent] as const] : [])),
  );
  const childAccent = new Map(
    detail.childRefs.map((c) => {
      // Si la subsaga tiene grupo en la ficha, ese acento manda (para que el
      // bloque se vea igual que esa subsaga en el resto de la ficha). Si no
      // tiene grupo (sin miembros, la rotación de groupMembers no la cubre),
      // usa su accent_color persistido si es válido, o beige.
      const accent = groupAccentBySagaId.get(c.id) ?? (isSagaAccentToken(c.accentColor) ? c.accentColor : "beige");
      return [c.id, accent] as const;
    }),
  );

  // El orden principal de una subsaga expande un bloque con createCuratedOrder
  // — la misma función de SECUENCIA que usan las portadas del abanico y el
  // «siguiente» de las cards (./build-library-saga-cards.ts), NO la que
  // cuenta el avance del hero: desde el 2026-07-25 (Task 5) eso es
  // countedKeys/pertenencia (./progress.ts), y createCuratedOrder ni siquiera
  // recibe el campo `optional` (OrderMembership no lo tiene). Un bloque
  // expande «su orden principal» — TODOS sus miembros directos, sin filtrar
  // por hueco (fase 3, Task 4: ya no hay grafo que pueda dejar a alguien sin
  // sitio) — así que este contador y el denominador del progreso pueden
  // seguir difiriendo solo por `optional`, no por falta de position.
  const mainOrder = createCuratedOrder(detail.orderSagas, detail.orderMemberships, (k) =>
    members.get(k)?.title ?? "",
  );

  const resolved = resolveRoute(entries, {
    members,
    childNames,
    childAccent,
    mainOrderOf: (sagaId) => mainOrder(sagaId),
  });

  // Solo bajo el DESIGNADO (fase 4): es la vista por defecto de la saga, así que
  // lo que no nombra tiene que seguir viéndose. Sin contador («19 de 20») a
  // propósito: sería una TERCERA regla de recuento en la ficha — el hero ya
  // cuenta con countedKeys (que excluye lo `optional`) y la cabecera de arriba
  // cuenta los pasos de la ruta. Enseñar la lista es honesto; enseñar un número
  // que no cuadra con el de arriba, no.
  const unnamed = row.isReadingOrder ? unnamedMembers(resolved, mainOrder(detail.saga.id), members) : [];

  // Columna por PASOS (spec 2026-07-28, §1): `deriveTimeline` construía la
  // columna con `orderNo` —el orden curado—, así que con un itinerario activo
  // la columna salía en un orden y los números en otro. Es justo lo que hace
  // que el lector se pierda.
  const timelineSections = graph === null ? null : deriveTimeline(graph, { spine: "route" });

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-border p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">{row.name}</h3>
            {row.summary && <p className="mt-0.5 text-xs text-muted-foreground">{row.summary}</p>}
            <p className="mt-1 font-mono text-[10px] text-muted-foreground">
              {t("routeProgress", { completed: resolved.completed, total: resolved.total })}
            </p>
          </div>
          {detail.isAuthenticated && (
            <AdoptRouteButton
              sagaId={detail.saga.id}
              slug={slug}
              adopted={detail.routeChoice === slug}
              labels={{ adopt: t("routeAdopt"), adopted: t("routeAdopted") }}
            />
          )}
        </div>
        {canEdit && (
          <Link
            href={`${sagaHref(detail.saga.id)}/rutas`}
            className="mt-2 inline-block rounded-lg border border-border px-3 py-1.5 text-[11px] font-semibold text-muted-foreground"
          >
            ✎ {t("routesManage")}
          </Link>
        )}
      </div>

      {resolved.steps.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">{t("routeEmpty")}</p>
      ) : timelineSections !== null ? (
        // El timeline SUSTITUYE la lista de pasos, no se suma a ella: verlos dos
        // veces seguidos es el ruido que la fase 4 evitó al no numerar por
        // duplicado. Lo que solo tiene RouteView —nombre, resumen, «Llevas X de
        // Y», adoptar y «Sin puesto en este itinerario»— se queda.
        <ReadingTimeline sections={timelineSections} />
      ) : (
        // Camino de respaldo, sin grafo que derivar (saga sin curar, o con el
        // mapa apagado): la lista de pasos de siempre.
        <ol className="flex flex-col gap-2">
          {resolved.steps.map((step, i) => {
            // Key estable derivada del contenido, no del índice: RouteBlock es
            // cliente con useState(open) propio, y si la ruta se reordena
            // key={i} le hace heredar a un bloque el estado "abierto" de otro
            // paso que ocupaba antes esa posición (hallazgo 1). resolveRoute
            // ya deduplica, así que no puede haber dos pasos con la misma key.
            const key =
              step.kind === "block"
                ? `block:${step.sagaId}`
                : `item:${step.member.itemType}:${step.member.itemId}`;
            return (
              <li key={key} className="flex items-start gap-3">
                <span className="w-6 shrink-0 pt-2.5 text-right font-mono text-[11px] text-muted-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  {step.kind === "block" ? (
                    <RouteBlock step={step} countLabel={t("routeBlockCount", { count: step.members.length })} />
                  ) : (
                    <Link
                      href={step.member.href}
                      className="flex items-center gap-3 rounded-xl border border-border px-3 py-2"
                    >
                      <span className="relative h-[45px] w-[30px] shrink-0 overflow-hidden rounded">
                        {step.member.coverUrl && (
                          <Image src={step.member.coverUrl} alt="" fill sizes="30px" className="object-cover" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{step.member.title}</span>
                      {/* Presentación, no cómputo de avance: el predicado único vive en completion.ts (issue #91). */}
                      {isMemberCompleted(step.member) && <span className="shrink-0 text-xs text-success">✓</span>}
                    </Link>
                  )}
                  {step.note && <p className="mt-1 pl-1 text-[11px] italic text-muted-foreground">{step.note}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {unnamed.length > 0 && (
        <section className="mt-2 border-t border-border pt-3">
          <h4 className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            {t("routeUnnamedTitle")}
          </h4>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{t("routeUnnamedHint")}</p>
          <ul className="mt-2 divide-y divide-border border-t border-border">
            {unnamed.map((m) => (
              <li key={`${m.itemType}:${m.itemId}`}>
                <Link href={m.href} className="flex items-center gap-3 py-2.5">
                  {/* Sin número, con «·»: exactamente como el mapa pinta lo que
                      no tiene hueco (#167). Numerarlos les atribuiría un puesto
                      que el curador no les dio. */}
                  <span className="w-6 shrink-0 text-right font-mono text-[11px] text-foreground-faint">·</span>
                  <span className="relative h-[45px] w-[30px] shrink-0 overflow-hidden rounded">
                    {m.coverUrl && <Image src={m.coverUrl} alt="" fill sizes="30px" className="object-cover" />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{m.title}</span>
                  {/* Presentación, no cómputo de avance: el predicado único vive
                      en completion.ts (issue #91). */}
                  {isMemberCompleted(m) && <span className="shrink-0 text-xs text-success">✓</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
