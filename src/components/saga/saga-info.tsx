import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { SAGA_ACCENT } from "@/lib/sagas/accents";
import { freeBlockWindow, freeItemWindow } from "@/lib/sagas/get-saga-detail";
import { partitionGroups, type MemberGroup } from "@/lib/sagas/group-members";
import { esColocable } from "@/lib/sagas/placement";
import type { DetailMember, ResolvedWindow } from "@/lib/sagas/types";
import { RoleChip } from "./role-chip";

// `freeItemWindow`/`freeBlockWindow` (la guarda «solo lo libre tiene
// ventana») viven en get-saga-detail.ts junto a `resolveWindows` — extraídas
// de aquí en la revisión de Task 6 para poder probarlas sin renderizar React.
// Ver su comentario ahí para el porqué de la comprobación de `placement`/
// `placementInParent`.

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
// — texto en `messages/es.json`, nunca embebido.
//
// Fix Task 7 (cierre, segunda vuelta): la redacción original decía "…en el
// orden de lectura", y "el orden de lectura" ya es el nombre propio del
// GRAFO (`saga_nodes`/`saga_edges` — ver `t("orderReading")`; su editor se
// retiró en la fase 2a, Task 11, y el grafo queda congelado en modo lectura
// hasta que la fase 3 lo retire del todo), un sistema distinto de
// `placement` (curado en `/saga/[id]/editar`) y sin ningún constraint que los
// mantenga sincronizados. Cuando la saga SÍ tenía grafo, un aviso arriba
// («Orden de lectura disponible.») ya afirmaba lo mismo en la misma
// pantalla (retirado en fase 3, Task 4-bis: al derivarse el mapa de la
// curación, «hay grafo» dejó de ser señal de que aporte, así que el aviso
// dejó de significar nada) — con la redacción vieja, esta celda podía decir
// en el mismo aliento que la obra NO tiene sitio en "el orden de lectura", lo
// cual puede ser sencillamente falso (nada impide `order_no` en el grafo con
// `placement = null` a la vez) justo debajo del cartel que decía que ese
// orden existe y la incluye. Para quien depende de este texto, eso es peor
// que no decir nada. La redacción actual no nombra ningún sistema: usa
// "hueco" (vocabulario correcto — es el de `memberPlacementFixed`, "Hueco
// fijo", en el editor de miembros) y ancla el hecho a lo que el lector tiene
// delante ("esta lista", la propia grid donde vive la celda) en vez de a un
// grafo que puede no ver o que puede decir otra cosa.
function MemberCell({
  m,
  labels,
  windowLine,
}: {
  m: DetailMember;
  labels: { done: string; reading: string; optional: string; noSlot: string };
  /** Línea de ventana (fase 2b, Task 6; ampliada a `anclado` en Task 10), ya
   *  resuelta a JSX por el llamante — `undefined`/`null` si el miembro no es
   *  colocable (`esColocable`) o no tiene ventana resuelta. Se pinta tanto en
   *  «Cuando quieras» (siempre `libre`) como en la grid ordenada (un
   *  `anclado` vive ahí, en su hueco relativo, con su chip de ventana — no se
   *  lista aparte). Bajo la celda, como pide el brief. */
  windowLine?: ReactNode;
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
      {windowLine}
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
  windows,
  renderWindow,
}: {
  members: DetailMember[];
  labels: { done: string; reading: string; optional: string; noSlot: string };
  /** Mapa de ventanas resueltas + su traductor a JSX (Task 10): un miembro
   *  `anclado` vive en esta grid (nunca en «Cuando quieras», ver
   *  `partitionGroups`/el filtro `!== "libre"` de la llamante) pero SÍ debe
   *  pintar su ventana — `esColocable` es la misma guarda que ya usa
   *  `freeItemWindow` por dentro; se repite aquí para no llamarla a ciegas en
   *  un miembro `fijo`/sin clasificar que nunca tendrá fila. */
  windows: Record<string, ResolvedWindow>;
  renderWindow: (w: ResolvedWindow | null) => ReactNode;
}) {
  if (members.length === 0) return null;

  return (
    <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-7">
      {members.map((m) => (
        <li key={`${m.itemType}-${m.itemId}`}>
          <MemberCell
            m={m}
            labels={labels}
            windowLine={esColocable(m.placement) ? renderWindow(freeItemWindow(windows, m)) : undefined}
          />
        </li>
      ))}
    </ul>
  );
}

export async function SagaInfo({
  overview,
  groups,
  canConfigure,
  sagaId,
  hasParent,
  windows,
}: {
  overview: string | null;
  groups: MemberGroup[];
  canConfigure?: boolean;
  sagaId: string;
  hasParent: boolean;
  /** Ventana de cada entrada `libre`, resuelta a texto en `getSagaDetail`
   *  (fase 2b, Task 6). Clave = `i:<tipo>:<uuid>` / `s:<uuid>`, ver
   *  `SagaDetail.windows`. */
  windows: Record<string, ResolvedWindow>;
}) {
  const t = await getTranslations("saga");
  const cellLabels = {
    done: t("statusDone"),
    reading: t("statusReading"),
    optional: t("optionalChip"),
    noSlot: t("noOrderSlotHint"),
  };
  // Traduce una ventana ya resuelta a la frase del brief («a partir de X ·
  // recomendable antes de Y»), con el título en negrita — mismo patrón que
  // `t.rich` ya usa el resto de la app (episode-panel.tsx, "watchedProgress").
  // Con una sola ancla, media frase; `w` nunca llega con las dos a `null`
  // (resolveWindows ya descarta ese caso, no habría entrada en el mapa).
  const renderWindow = (w: ResolvedWindow | null): ReactNode => {
    if (!w) return null;
    const bold = { b: (chunks: ReactNode) => <b>{chunks}</b> };
    const body =
      w.afterTitle && w.beforeTitle
        ? t.rich("windowBothText", { afterTitle: w.afterTitle, beforeTitle: w.beforeTitle, ...bold })
        : w.afterTitle
          ? t.rich("windowAfterText", { title: w.afterTitle, ...bold })
          : w.beforeTitle
            ? t.rich("windowBeforeText", { title: w.beforeTitle, ...bold })
            : null;
    if (!body) return null;
    return <p className="mt-0.5 text-[10.5px] leading-tight text-muted-foreground">{body}</p>;
  };
  const freeMembers = groups.flatMap((g) => g.members.filter((m) => m.placement === "libre"));
  const unclassified = groups.flatMap((g) => g.members).filter((m) => m.placement === null).length;
  // Issue #198: un bloque `libre` es una entrada sin hueco, igual que una obra
  // `libre`, así que vive en «Cuando quieras» y no en la lista ordenada.
  // Reparto delegado en `partitionGroups` (fase 3, Task 1): el mapa necesita
  // el MISMO criterio, y dos vistas repartiendo cada una por su cuenta acaban
  // discrepando (issues #91 y #203). `groupMembers` sigue devolviendo todos
  // los grupos sin filtrar: `computeProgress` los recorre para emitir los
  // segmentos de color del hero.
  const { ordered: orderedGroups, free: freeGroups } = partitionGroups(groups);
  // Fix Task 2 / Finding 1 (review): un grupo se salta cuando su `eligible`
  // queda vacío (todos sus miembros son `libre` sueltos), así que
  // `orderedGroups.length === 0` no basta para decidir si hay algo que
  // pintar aquí abajo — una saga-universo sin miembros directos con TODAS
  // sus subsagas marcadas `libre` tiene `orderedGroups` no vacío pero cada
  // `eligible` vacío. Se calcula una sola vez, junto al `eligible` de cada
  // grupo, y se reutiliza tanto para decidir la sección como para el `map` —
  // el mismo criterio que ya obligaba `GroupBody`/Fix Task 7 Finding 1: un
  // filtrado, compartido, nunca dos que puedan divergir.
  const orderedGroupsWithEligible = orderedGroups.map((group) => ({
    group,
    eligible: group.members.filter((m) => m.placement !== "libre"),
  }));
  const hasVisibleOrderedGroup = orderedGroupsWithEligible.some(({ eligible }) => eligible.length > 0);
  // Fix revisión final #198 (Important 1): `freeGroups` puede traer bloques sin
  // ningún miembro elegible (mismo caso que `orderedGroupsWithEligible` de
  // arriba), así que se filtra aquí una sola vez y se reutiliza tanto para
  // decidir si «Cuando quieras» tiene algo real como para pintarlo más abajo —
  // el mismo criterio de "un filtrado, nunca dos que puedan divergir" que ya
  // exigían los Fix Task 7/Task 2 de más arriba.
  const freeGroupsWithEligible = freeGroups.map((group) => ({
    group,
    eligible: group.members.filter((m) => m.placement !== "libre"),
  }));
  const hasVisibleFreeSection =
    freeMembers.length > 0 || freeGroupsWithEligible.some(({ eligible }) => eligible.length > 0);
  return (
    <div className="flex flex-col gap-5 px-4 pb-10">
      <section>
        <h2 className="mb-2 label-section">
          {t("synopsis")}
        </h2>
        <p className="text-[13.5px] leading-relaxed text-foreground sm:columns-2 sm:gap-11">
          {overview ?? t("noSynopsis")}
        </p>
      </section>

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
          <h2 className="label-section">
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
        {hasVisibleOrderedGroup ? (
          <div className="flex flex-col gap-5">
            {/* group-members.ts: sagaId null = "Nexo" si hay hijas, único grupo
                si no. Con un único grupo directo (saga hoja, sin subsagas) la
                cabecera "Nexo" no tiene sentido — la sección ya dice "Títulos
                que la componen", así que aquí se omite (sin tick/nombre/contador)
                y se pinta la grid pelada. Con 2+ grupos, o un único grupo que SÍ
                es de subsaga, la cabecera se mantiene como siempre. */}
            {orderedGroupsWithEligible.map(({ group, eligible }) => {
              const isSoleDirectGroup = orderedGroups.length === 1 && group.sagaId === null;
              // Fix Task 7 / Finding 1 (review): un único filtrado, reutilizado
              // por la cabecera Y la grid — ver el comentario de `GroupBody`
              // para el porqué. Si un grupo se queda sin nada que pintar (p.
              // ej. todos sus miembros son `libre`), se omite el grupo entero:
              // una cabecera con un número y una grid vacía debajo no explica
              // nada al lector.
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
                  <GroupBody members={eligible} labels={cellLabels} windows={windows} renderWindow={renderWindow} />
                </div>
              );
            })}
          </div>
        ) : hasVisibleFreeSection ? (
          // Fix Task 2 / Finding 1 (review): la cabecera y la fila de botones
          // de curación (Editar ficha / Anidar en universo / Itinerarios) se
          // quedan SIEMPRE — son la vía de entrada a la curación para
          // collaborator+ (issue #181). Solo se sustituye la rejilla vacía
          // por esta línea, nunca la sección entera.
          //
          // Fix revisión final #198 (Important 1): esta frase afirma que hay
          // obras y todas viven en «Cuando quieras» — falso en una saga
          // GENUINAMENTE vacía (0 miembros, 0 bloques elegibles en absoluto,
          // caso real "[QA Sagas v2] Era Vacía" en dev). Solo se pinta cuando
          // `hasVisibleFreeSection` confirma que esa sección va a existir de
          // verdad más abajo; si no hay nada en ningún sitio, no se dice nada.
          <p className="text-[13px] text-muted-foreground">{t("allFreeHint")}</p>
        ) : null}
      </section>

      {/* Los `libre` salen de la columna del orden y viven aquí: su «dónde» no
          es un hueco. Ojo, esto NO es lo mismo que `optional` — un libre puede
          contar perfectamente en el progreso (spec 2026-07-25, «Dos ejes
          ortogonales»). Desde la #198 la sección acoge dos formas: obras
          sueltas y bloques-subsaga enteros, que se pintan con su cabecera
          porque un bloque sin sus obras no dice nada. */}
      {hasVisibleFreeSection && (
        <section>
          <h2 className="mb-3 label-section">
            {t("freeSection")}
          </h2>
          <div className="flex flex-col gap-5">
            {freeMembers.length > 0 && (
              <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-7">
                {freeMembers.map((m) => (
                  <li key={`${m.itemType}-${m.itemId}`}>
                    <MemberCell m={m} labels={cellLabels} windowLine={renderWindow(freeItemWindow(windows, m))} />
                  </li>
                ))}
              </ul>
            )}
            {freeGroupsWithEligible.map(({ group, eligible }) => {
              if (eligible.length === 0) return null;
              return (
                <div key={group.sagaId}>
                  <div className="mb-3 flex items-center gap-2">
                    <span className={`h-[15px] w-1 rounded-full ${SAGA_ACCENT[group.accent].tick}`} />
                    <h3 className="font-serif text-[15px] font-semibold">
                      {group.name}
                    </h3>
                    <span className="font-mono text-[9px] tracking-[0.08em] text-muted-foreground uppercase">
                      {t("freeBlockHint")}
                    </span>
                    <span className="ml-auto font-mono text-[9.5px] text-muted-foreground">
                      {eligible.length}
                    </span>
                  </div>
                  {renderWindow(freeBlockWindow(windows, group))}
                  <GroupBody members={eligible} labels={cellLabels} windows={windows} renderWindow={renderWindow} />
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
