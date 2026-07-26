import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { sagaHref } from "@/lib/catalog/item-href";
import { createMainOrder } from "@/lib/sagas/main-order";
import { getRouteEntries } from "@/lib/sagas/get-saga-routes";
import { resolveRoute } from "@/lib/sagas/resolve-route";
import { isMemberCompleted } from "@/lib/sagas/completion";
import { isSagaAccentToken } from "@/lib/sagas/accents";
import type { SagaDetail } from "@/lib/sagas/get-saga-detail";
import { AdoptRouteButton } from "./adopt-route-button";
import { RouteBlock } from "./route-block";

// Una ruta curada: cabecera (nombre, resumen, contador PROPIO) + pasos.
// El contador del hero no se toca: sigue diciendo lo del universo entero,
// mires la ruta que mires (spec §Progreso).
export async function RouteView({
  detail,
  slug,
  canEdit,
}: {
  detail: SagaDetail;
  slug: string;
  canEdit?: boolean;
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

  // El orden principal de una subsaga expande un bloque con createMainOrder —
  // la misma función de SECUENCIA que usan las portadas del abanico y el
  // «siguiente» de las cards (./build-library-saga-cards.ts), NO la que
  // cuenta el avance del hero: desde el 2026-07-25 (Task 5) eso es
  // countedKeys/pertenencia (./progress.ts), y createMainOrder ni siquiera
  // recibe el campo `optional` (OrderMembership no lo tiene). Un bloque
  // expande «su orden principal», no «todos sus miembros», así que un ítem
  // sin hueco en la SECUENCIA (grafo con order_no null) queda fuera del
  // contador de esta ruta — pero un miembro `optional` SÍ entra si tiene
  // hueco: `optional` (denominador del progreso) y «fuera del orden» (sin
  // position en la secuencia) son ejes distintos, y este contador solo mira
  // el segundo.
  const mainOrder = createMainOrder(detail.orderSagas, detail.orderMemberships, detail.orderNodes, (k) =>
    members.get(k)?.title ?? "",
  );

  const resolved = resolveRoute(entries, {
    members,
    childNames,
    childAccent,
    mainOrderOf: (sagaId) => mainOrder(sagaId),
  });

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
      ) : (
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
    </div>
  );
}
