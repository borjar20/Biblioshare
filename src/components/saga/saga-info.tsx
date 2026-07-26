import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SAGA_ACCENT } from "@/lib/sagas/accents";
import type { MemberGroup } from "@/lib/sagas/group-members";
import type { DetailMember } from "@/lib/sagas/types";
import { RoleChip } from "./role-chip";

// Pestaña Info (frames A/D): sinopsis + títulos agrupados por subsaga. La
// celda replica el icell del mockup: portada, badge de orden, estado ✓/◉.
//
// Issue #167 introdujo la sección "Fuera del orden principal" para los
// miembros sin `position`. El 2026-07-26 (fusión de secciones, Decisión 1) se
// retiró: con `placement` en el modelo, esa sección duplicaba la misma señal
// que ya daba el contorno punteado de MemberCell y el aviso de deuda de
// curación (más abajo). Ahora una obra sin clasificar (`placement === null`)
// se queda en la grid de su grupo, señalada solo por el contorno; una obra
// `libre` se saca de la grid y vive únicamente en «Cuando quieras» (ver
// `freeMembers`). El chip de rol lo decide `role !== null`, independiente de
// `placement` — una obra sin clasificar y sin rol se ve en su grid, sin chip
// (es curación pendiente y debe verse como tal, no disfrazarse).

// La celda de portada de la grid, con su chip de rol debajo si lo tiene.
// Extraída porque desde el 2026-07-25 se pinta en dos sitios: la grid de cada
// grupo y la sección «Cuando quieras» — y desde el 2026-07-26 el chip de rol
// vive aquí dentro (antes se repetía como hermano en cada sitio de llamada;
// con la fusión de secciones esto habría sido una tercera copia). Vocabulario
// de portada calcado de CoverCard (rounded-cover + shadow-cover +
// border-border + bg-surface-muted de reserva).
//
// El contorno punteado dorado usa `m.placement === null` (no `m.position`):
// significa "sin clasificar", y no debe pintarse sobre un `libre` declarado,
// que no es deuda de nada.
//
// Fix Task 7 / Finding 2 (review): el punteado es la ÚNICA señal para un
// lector sin rol desde que se fusionaron las tres secciones — el aviso de
// deuda de curación (más abajo) vive detrás de `canConfigure`, así que un
// lector anónimo se quedaba sin ninguna palabra que lo explicara. Además es
// un defecto de accesibilidad por sí solo: un rasgo puramente visual, sin
// equivalente textual, no existe para quien usa lector de pantalla (misma
// familia que la issue #147, marcas que solo se distinguen por color). Se
// añade un `sr-only` (mismo patrón que `agenda-list.tsx`) con `labels.noSlot`
// — texto en `messages/es.json`, nunca embebido. La redacción evita
// "sin clasificar" (vocabulario de curador, ya usado en el aviso de deuda) y
// dice en su lugar el hecho llano: no tiene un hueco asignado en el orden.
function MemberCell({
  m,
  labels,
}: {
  m: DetailMember;
  labels: { done: string; reading: string; optional: string; noSlot: string };
}) {
  return (
    <>
      <Link href={m.href} className="block">
        <div
          className={`relative aspect-[2/3] overflow-hidden rounded-cover border border-border bg-surface-muted shadow-cover ${
            m.placement === null ? "outline-dashed outline-1 -outline-offset-1 outline-gold" : ""
          }`}
        >
          {m.coverUrl ? (
            <Image src={m.coverUrl} alt={m.title} fill sizes="120px" className="object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center px-1.5 text-center text-[10px] text-muted-foreground">
              {m.title}
            </div>
          )}
          {m.placement === null && <span className="sr-only">{labels.noSlot}</span>}
          {m.position !== null && (
            <span className="absolute left-1 top-1 rounded bg-foreground/70 px-1 font-mono text-[8.5px] text-background">
              {m.position}
            </span>
          )}
          {m.optional && (
            <span className="absolute bottom-1 left-1 rounded bg-foreground/70 px-1 font-mono text-[8px] uppercase text-background">
              {labels.optional}
            </span>
          )}
          {m.status === "completed" && (
            <span
              aria-label={labels.done}
              className="absolute bottom-1 right-1 grid h-4 w-4 place-items-center rounded-full bg-green text-[9px] text-white"
            >
              ✓
            </span>
          )}
          {m.status === "in_progress" && (
            <span
              aria-label={labels.reading}
              className="absolute inset-0 grid place-items-center bg-foreground/40 text-base text-white"
            >
              ◉
            </span>
          )}
        </div>
        <p className="mt-1.5 line-clamp-2 text-[11px] font-semibold leading-tight">{m.title}</p>
      </Link>
      {m.role !== null && (
        <p className="mt-0.5">
          <RoleChip role={m.role} />
        </p>
      )}
    </>
  );
}

// La grid de un grupo (2026-07-26, fusión de secciones): una sola lista, sin
// separar "sin número" en su propia sección — ese hecho ya lo dice el
// contorno punteado de MemberCell y, para collaborator+, el aviso de deuda
// de curación de SagaInfo.
//
// Fix Task 7 / Finding 1 (review): `members` aquí es SIEMPRE la lista ya
// filtrada de "lo que toca pintar en esta grid" — decidida una única vez por
// `SagaInfo` (ver `eligible` en `groups.map`) y reutilizada tanto para el
// contador de la cabecera como para esto. Antes GroupBody filtraba los
// `libre` por su cuenta mientras la cabecera pintaba `group.members.length`
// sin filtrar: con un `libre` en el grupo, el número no bajaba aunque la
// grid sí. GroupBody ya no filtra nada — solo pinta lo que recibe — así que
// cabecera y grid no pueden volver a divergir por definición.
function GroupBody({
  members,
  labels,
}: {
  members: DetailMember[];
  labels: { done: string; reading: string; optional: string; noSlot: string };
}) {
  if (members.length === 0) return null;

  return (
    <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-7">
      {members.map((m) => (
        <li key={`${m.itemType}-${m.itemId}`}>
          <MemberCell m={m} labels={labels} />
        </li>
      ))}
    </ul>
  );
}

export async function SagaInfo({
  overview,
  groups,
  hasGraph,
  canConfigure,
  sagaId,
  hasParent,
}: {
  overview: string | null;
  groups: MemberGroup[];
  hasGraph: boolean;
  canConfigure?: boolean;
  sagaId: string;
  hasParent: boolean;
}) {
  const t = await getTranslations("saga");
  const cellLabels = {
    done: t("statusDone"),
    reading: t("statusReading"),
    optional: t("optionalChip"),
    noSlot: t("noOrderSlotHint"),
  };
  const freeMembers = groups.flatMap((g) => g.members.filter((m) => m.placement === "libre"));
  const unclassified = groups.flatMap((g) => g.members).filter((m) => m.placement === null).length;
  return (
    <div className="flex flex-col gap-5 px-4 pb-10">
      <section>
        <h2 className="mb-2 font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
          {t("synopsis")}
        </h2>
        <p className="text-[13.5px] leading-relaxed text-foreground sm:columns-2 sm:gap-11">
          {overview ?? t("noSynopsis")}
        </p>
      </section>

      {/* Infonote (spec §2.3): avisa de que hay un orden de lectura configurado
          antes de que el usuario llegue a la grid de portadas — el enlace real
          a la pestaña vive en SagaTabs, esto solo anuncia que existe. */}
      {hasGraph && (
        <aside className="flex items-start gap-2.5 rounded-xl border border-gold/30 bg-gold/10 px-3.5 py-3">
          <span className="text-[15px] text-gold">◆</span>
          <p className="text-xs leading-relaxed text-foreground">
            <b>{t("graphAvailableTitle")}</b> {t("graphAvailableBody")}
          </p>
        </aside>
      )}

      {/* Aviso de deuda de curación (Task 7): solo collaborator+ — un lector
          normal no puede resolverlo, así que no debe verlo — y solo si queda
          algo sin clasificar (`placement === null`). Los `libre` NO cuentan
          aquí: están declarados, no son deuda. */}
      {canConfigure && unclassified > 0 && (
        <aside className="flex items-start gap-2.5 rounded-xl border border-border px-3.5 py-3">
          <span className="text-[15px] text-muted-foreground">◇</span>
          <p className="text-xs leading-relaxed text-foreground">
            {t("unclassifiedNotice", { count: unclassified })}{" "}
            <Link href={`/saga/${sagaId}/editar`} className="font-semibold underline">
              {t("unclassifiedCta")}
            </Link>
          </p>
        </aside>
      )}

      <section>
        {/* flex-wrap en AMBOS niveles: con 3 botones de curación a 390px la
            fila no cabe; el shrink-0 del bloque de botones impedía encoger y
            desbordaba la página entera en horizontal. */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
            {t("itemsTitle")}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {canConfigure && (
              <Link
                href={`/saga/${sagaId}/editar`}
                className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-[11px] font-semibold text-muted-foreground"
              >
                ✎ {t("editSheet")}
              </Link>
            )}
            {canConfigure && !hasParent && (
              <Link
                href={`/saga/${sagaId}/editar#universo`}
                className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-[11px] font-semibold text-muted-foreground"
              >
                ⌂ {t("nestInUniverse")}
              </Link>
            )}
            {canConfigure && !hasGraph && (
              <Link
                href={`/saga/${sagaId}/mapa/editar`}
                className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-[11px] font-semibold text-muted-foreground"
              >
                ✎ {t("configureGraph")}
              </Link>
            )}
            {/* Punto de entrada a la curación de itinerarios, SIEMPRE visible
                para collaborator+ (haya o no grafo, haya o no itinerarios ya
                creados). Antes el único enlace a /rutas vivía en RouteView, y
                RouteView solo se monta cuando la ruta activa YA es una
                curada: en una saga sin itinerarios era inalcanzable desde la
                interfaz — el mismo agujero que mató las colas (backlog §7.22,
                "quedó inalcanzable, sin ningún enlace"). Se llega solo
                tecleando la URL, así que aquí queda un enlace que no depende
                de que ya exista nada. */}
            {canConfigure && (
              <Link
                href={`/saga/${sagaId}/rutas`}
                className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-[11px] font-semibold text-muted-foreground"
              >
                ✎ {t("routesManage")}
              </Link>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-5">
          {/* group-members.ts: sagaId null = "Nexo" si hay hijas, único grupo
              si no. Con un único grupo directo (saga hoja, sin subsagas) la
              cabecera "Nexo" no tiene sentido — la sección ya dice "Títulos
              que la componen", así que aquí se omite (sin tick/nombre/contador)
              y se pinta la grid pelada. Con 2+ grupos, o un único grupo que SÍ
              es de subsaga, la cabecera se mantiene como siempre. */}
          {groups.map((group) => {
            const isSoleDirectGroup = groups.length === 1 && group.sagaId === null;
            // Fix Task 7 / Finding 1 (review): un único filtrado, reutilizado
            // por la cabecera Y la grid — ver el comentario de `GroupBody`
            // para el porqué. Si un grupo se queda sin nada que pintar (p.
            // ej. todos sus miembros son `libre`), se omite el grupo entero:
            // una cabecera con un número y una grid vacía debajo no explica
            // nada al lector.
            const eligible = group.members.filter((m) => m.placement !== "libre");
            if (eligible.length === 0) return null;
            return (
              <div key={group.sagaId ?? "nexus"}>
                {!isSoleDirectGroup && (
                  <div className="mb-3 flex items-center gap-2">
                    <span className={`h-[15px] w-1 rounded-full ${SAGA_ACCENT[group.accent].tick}`} />
                    <h3 className="font-serif text-[15px] font-semibold">
                      {group.name ?? t("nexusGroup")}
                    </h3>
                    <span className="ml-auto font-mono text-[9.5px] text-muted-foreground">
                      {eligible.length}
                    </span>
                  </div>
                )}
                <GroupBody members={eligible} labels={cellLabels} />
              </div>
            );
          })}
        </div>
      </section>

      {/* Los `libre` salen de la columna del orden y viven aquí: su «dónde» no
          es un hueco. Ojo, esto NO es lo mismo que `optional` — un libre puede
          contar perfectamente en el progreso (spec 2026-07-25, «Dos ejes
          ortogonales»). */}
      {freeMembers.length > 0 && (
        <section>
          <h2 className="mb-3 font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
            {t("freeSection")}
          </h2>
          <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-7">
            {freeMembers.map((m) => (
              <li key={`${m.itemType}-${m.itemId}`}>
                <MemberCell m={m} labels={cellLabels} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
