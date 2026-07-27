import { getTranslations } from "next-intl/server";
import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { UserRole } from "@/lib/auth/roles";
import { itemHref } from "@/lib/catalog/item-href";
import { getSagaBase } from "./get-saga";
import { deriveSagaMap } from "./derive-map";
import type { SagaGraph } from "./map-types";
import type { SagaAccentToken } from "./accents";
import {
  averageSagaRating,
  computeProgress,
  groupMembers,
  type MemberGroup,
} from "./group-members";
import { buildRouteList, getRouteChoice, getSagaRoutes } from "./get-saga-routes";
import type { OrderMembership, OrderSaga } from "./curated-order";
import { countedKeys, type ProgressMembership, type ProgressSaga } from "./progress";
import type {
  DetailMember,
  MemberStatus,
  ResolvedWindow,
  Saga,
  SagaChildRef,
  SagaItemRole,
  SagaPlacement,
} from "./types";
import type { SagaRoute } from "./route-types";
import type { RawWindowRow } from "./get-saga-sequence";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const CATALOG_TABLE: Record<ItemType, "books" | "movies" | "series"> = {
  book: "books",
  movie: "movies",
  series: "series",
};

// Roles "de autoría" en `credits` (verificado contra src/lib/people/enrich-item.ts
// y src/lib/catalog/tmdb.ts: libros insertan role="author"; películas/series
// mapean CREW_JOB_ROLES a "director"/"writer" y el creador de una serie a
// "creator"). "writer" queda fuera a propósito: puede haber varios y diluiría
// el criterio de "dominante".
const AUTHORSHIP_ROLES = ["author", "director", "creator"] as const;

export type SagaDetail = {
  saga: Saga;
  parent: { id: string; name: string } | null;
  /** Autor/creador dominante entre los miembros, o null. */
  byline: string | null;
  groups: MemberGroup[];
  memberCount: number;
  childCount: number;
  progress: ReturnType<typeof computeProgress>;
  avgRating: number | null;
  isFollowing: boolean;
  isAuthenticated: boolean;
  /**
   * Grafo resuelto, o null si no hay nada curado que dibujar O si el curador
   * apagó el interruptor `show_map` (fase 3, Task 4-bis, arreglo tras
   * revisión: `resolveSagaGraph` aplica el interruptor EN EL ORIGEN, antes de
   * que `graph` salga de `getSagaDetail`). Todo consumidor que compruebe
   * `graph !== null` respeta el interruptor por construcción — no hace falta
   * que cada uno mire `hasGraph`/`saga.showMap` por su cuenta.
   */
  graph: SagaGraph | null;
  /** `graph !== null` (tautología, fase 3 Task 4-bis): nombre aparte porque
   *  alimenta el aviso retirado, el badge de la card y la ruta sintética
   *  `lectura` del selector — la intención de esos tres sitios es "¿esta saga
   *  ENSEÑA su mapa?", no "¿hay un `SagaGraph`?", aunque hoy respondan igual. */
  hasGraph: boolean;
  /** Rol del usuario que visita, o null sin sesión (botones de edición del grafo). */
  viewerRole: UserRole | null;
  /** Itinerarios disponibles: sintéticas (lectura/publicación) + curadas. */
  routes: SagaRoute[];
  /** Slug de ruta adoptado por el usuario para esta saga, o null. */
  routeChoice: string | null;
  /**
   * Insumos de `createCuratedOrder` ya calculados aquí (spec §1.5): RouteView
   * (Task 6) necesita reconstruir el orden principal de una subsaga para
   * expandir un bloque, y estos dos arrays son exactamente lo que la función
   * pide — recalcularlos ahí sería una segunda fuente de verdad.
   */
  orderSagas: OrderSaga[];
  orderMemberships: OrderMembership[];
  /**
   * TODOS los descendientes del árbol (haya o no miembros), con su nombre y
   * accent_color persistido. `groups` (groupMembers) solo crea grupo para una
   * hija con al menos un miembro, así que no sirve como fuente de "¿existe
   * esta subsaga?": un bloque de ruta a una subsaga vacía desaparecía en
   * silencio al usar `groups` como origen (hallazgo 2). RouteView construye
   * childNames/childAccent a partir de esta lista, no de `groups`.
   */
  childRefs: SagaChildRef[];
  /**
   * Ventana de cada entrada `libre` que tiene una (fase 2b, Task 6), ya
   * resuelta a texto: objeto plano, no `Map` — cruza la frontera
   * servidor→cliente, la misma trampa que ya obligó a cambiar la forma del
   * rail en la fase 2a. Clave = la de la entrada en el borrador
   * (`i:<tipo>:<uuid>` / `s:<uuid>`). El render ignora la ventana de una
   * entrada que no sea `libre` en vez de confiar en que esta tabla no tenga
   * fila para ella.
   */
  windows: Record<string, ResolvedWindow>;
};

export type DescendantRow = {
  id: string;
  name: string;
  accent_color: string | null;
  parent_saga_id: string | null;
  position_in_parent: number | null;
  placement_in_parent: SagaPlacement | null;
  optional_in_parent: boolean;
};

// Descendientes hasta profundidad 4 (spec §1.5: cap como cinturón frente a
// ciclos, el trigger ya los impide). Iterativo: una query por nivel.
// Exportada: get-anchor-options.ts (fase 2b) la reutiliza tal cual en vez de
// reinventar el mismo recorrido — mismo cinturón de profundidad, una sola
// fuente de verdad.
export async function fetchDescendants(
  supabase: SupabaseServerClient,
  rootId: string,
): Promise<Map<string, DescendantRow>> {
  const found = new Map<string, DescendantRow>();
  let frontier = [rootId];
  for (let depth = 0; depth < 4 && frontier.length > 0; depth++) {
    const { data } = await supabase
      .from("sagas")
      .select(
        "id, name, accent_color, parent_saga_id, position_in_parent, placement_in_parent, optional_in_parent",
      )
      .in("parent_saga_id", frontier);
    const next: string[] = [];
    for (const row of (data ?? []) as DescendantRow[]) {
      if (!found.has(row.id)) {
        found.set(row.id, row);
        next.push(row.id);
      }
    }
    frontier = next;
  }
  return found;
}

// Hija DIRECTA del root bajo la que cae una saga descendiente (sube por la
// cadena de padres dentro del set descargado).
function directChildFor(
  sagaId: string,
  rootId: string,
  descendants: Map<string, DescendantRow>,
): string | null {
  let cur = descendants.get(sagaId);
  while (cur) {
    if (cur.parent_saga_id === rootId) return cur.id;
    cur = cur.parent_saga_id ? descendants.get(cur.parent_saga_id) : undefined;
  }
  return null;
}

/** Resuelve las filas crudas de `saga_placement_windows` (todo el subárbol) a
 *  un `Record` plano por clave de SUJETO (`i:<tipo>:<uuid>` / `s:<uuid>`,
 *  mismo formato que `DraftEntry.key`), usando `anchorTitles` para el título
 *  de cada ancla. Objeto plano y no `Map` a propósito: `SagaDetail.windows`
 *  cruza la frontera servidor→cliente. Hermana de `hydrateWindows`
 *  (get-saga-sequence.ts) pero con una forma de salida distinta —
 *  `ResolvedWindow` es solo los dos títulos, sin el resto de `DraftAnchor`,
 *  que la ficha (a diferencia del editor) no necesita repintar.
 *
 *  Un ancla rota (su clave no está en `anchorTitles`: la obra o el bloque ya
 *  no está en el árbol) llega como `null` — no se limpia la fila. Si las dos
 *  anclas quedan a `null`, el sujeto no aparece en el resultado (equivale a
 *  "sin ventana"). Pura y exportada aparte para poder probarla sin Supabase,
 *  mismo patrón que `hydrateSequenceDraft`/`hydrateWindows`. */
export function resolveWindows(
  rows: RawWindowRow[],
  anchorTitles: Map<string, string>,
): Record<string, ResolvedWindow> {
  const keyOf = (
    itemType: ItemType | null,
    itemId: string | null,
    childSagaId: string | null,
  ): string | null =>
    itemId !== null && itemType !== null
      ? `i:${itemType}:${itemId}`
      : childSagaId !== null
        ? `s:${childSagaId}`
        : null;

  const resolveTitle = (
    itemType: ItemType | null,
    itemId: string | null,
    childSagaId: string | null,
  ): string | null => {
    const key = keyOf(itemType, itemId, childSagaId);
    return key === null ? null : (anchorTitles.get(key) ?? null);
  };

  // Desempate determinista: los uniques de `saga_placement_windows` son POR
  // SAGA (ver la migración), así que nada impide que dos sagas HERMANAS del
  // mismo subárbol tengan cada una su propia fila de ventana para la MISMA
  // obra compartida (multi-membership) — `rows` aquí es el subárbol entero
  // (sagaIds), no una sola saga. Mismo criterio que `byItem` más arriba: gana
  // la fila más antigua (`created_at` menor) en vez de depender del orden
  // físico que devuelva Postgres. A diferencia de `byItem`, que confía en el
  // `.order()` de su query, aquí se ordena dentro de la función: es pura y se
  // prueba sin Supabase, así que tiene que ser determinista por sí sola
  // pase lo que pase el orden en que lleguen las filas.
  const sorted = [...rows].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const seenSubjects = new Set<string>();
  const result: Record<string, ResolvedWindow> = {};
  for (const r of sorted) {
    const subjectKey = keyOf(r.item_type, r.item_id, r.child_saga_id);
    if (subjectKey === null) continue; // fila imposible: el CHECK del sujeto lo impide
    if (seenSubjects.has(subjectKey)) continue; // ya resuelto por la fila más antigua
    seenSubjects.add(subjectKey);
    const afterTitle = resolveTitle(r.after_item_type, r.after_item_id, r.after_child_saga_id);
    const beforeTitle = resolveTitle(r.before_item_type, r.before_item_id, r.before_child_saga_id);
    if (afterTitle === null && beforeTitle === null) continue; // sin ninguna ancla que resuelva: sin ventana
    // La clave solo se rellena si el título resolvió, para que afterKey/
    // afterTitle (y beforeKey/beforeTitle) no puedan discrepar: un ancla rota
    // es null en las dos a la vez.
    result[subjectKey] = {
      afterTitle,
      beforeTitle,
      afterKey: afterTitle === null ? null : keyOf(r.after_item_type, r.after_item_id, r.after_child_saga_id),
      beforeKey: beforeTitle === null ? null : keyOf(r.before_item_type, r.before_item_id, r.before_child_saga_id),
    };
  }
  return result;
}

/** Ventana de una entrada `libre` (fase 2b, Task 6) — solo aplica a una entrada
 *  realmente `libre` AHORA MISMO: no confía en que `windows` no traiga fila
 *  para algo que dejó de serlo (un cambio de colocación no borra la fila de
 *  `saga_placement_windows`, ver el comentario de `windows` en `SagaDetail`),
 *  así que comprueba `placement` ella misma antes de mirar el mapa, en vez de
 *  confiar en que la lista que recibe ya está filtrada. Extraída de
 *  `saga-info.tsx` (revisión Task 6) para poder probarla sin renderizar React
 *  — es la única guarda que sostiene «solo lo libre tiene ventana», y ningún
 *  constraint de BD puede imponerla. */
export function freeItemWindow(
  windows: Record<string, ResolvedWindow>,
  m: DetailMember,
): ResolvedWindow | null {
  if (m.placement !== "libre") return null;
  return windows[`i:${m.itemType}:${m.itemId}`] ?? null;
}

/** Hermana de {@link freeItemWindow} para un bloque-subsaga: misma guarda,
 *  sobre `placementInParent` en vez de `placement`. */
export function freeBlockWindow(
  windows: Record<string, ResolvedWindow>,
  group: MemberGroup,
): ResolvedWindow | null {
  if (group.placementInParent !== "libre" || group.sagaId === null) return null;
  return windows[`s:${group.sagaId}`] ?? null;
}

/**
 * La regla «con el interruptor apagado no hay mapa» (fase 3, Task 4-bis,
 * arreglo tras revisión), aislada y pura: EN EL ORIGEN, no en cada
 * consumidor. Antes `SagaDetail.graph` salía del grafo derivado sin más
 * (`derivedGraph.nodes.length > 0 ? derivedGraph : null`) y solo `hasGraph`
 * miraba `saga.showMap` — así que cualquier sitio que comprobara
 * `graph !== null` en vez de `hasGraph` se saltaba el interruptor. Dos lo
 * hacían de hecho: `/saga/[id]/mapa/page.tsx` (`if (!graph) redirect(...)`) y
 * el panel de grafo resaltado de una ruta curada en `saga-map-tab.tsx`
 * (`... && graph`), los dos verificados en vivo con el interruptor apagado.
 *
 * Con `graph` ya `null` cuando `showMap` es `false`, TODO consumidor que
 * comprueba `graph !== null` —los dos de arriba y cualquiera que venga
 * después— respeta el interruptor por construcción, sin tener que acordarse
 * de mirar `showMap` en cada sitio nuevo. `hasGraph` se queda en
 * `graph !== null`, que vuelve a ser una tautología cierta (como antes de que
 * `showMap` existiera), así que no hace falta tocarla ni a sus consumidores.
 *
 * Pura y exportada para poder probarla sin Supabase — es la única función que
 * sostiene esta regla, y ningún tipo la impone: `SagaGraph | null` acepta
 * perfectamente un grafo no vacío con el interruptor apagado si nadie llama a
 * esta función antes de asignarlo.
 */
export function resolveSagaGraph(showMap: boolean, derivedGraph: SagaGraph): SagaGraph | null {
  if (!showMap) return null;
  return derivedGraph.nodes.length > 0 ? derivedGraph : null;
}

export async function getSagaDetail(
  supabase: SupabaseServerClient,
  id: string,
): Promise<SagaDetail | null> {
  // getSagaBase mantiene el rellenado perezoso TMDB; aquí se resuelven
  // miembros (con jerarquía y estados), grafo y todo lo demás.
  const saga = await getSagaBase(supabase, id);
  if (!saga) return null;

  // Estado del usuario (RLS: solo sus filas) — puede no haber sesión. Una
  // sola llamada para toda la función (antes había una segunda a mitad de
  // fichero y otra en el page component).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const descendants = await fetchDescendants(supabase, id);
  const children: SagaChildRef[] = [...descendants.values()]
    .filter((d) => d.parent_saga_id === id)
    .map((d) => ({
      id: d.id,
      name: d.name,
      accentColor: d.accent_color,
      positionInParent: d.position_in_parent,
      placementInParent: d.placement_in_parent,
      optionalInParent: d.optional_in_parent,
    }));

  // Membresías del root + descendientes, con su saga de origen.
  const sagaIds = [id, ...descendants.keys()];
  const { data: itemRows } = await supabase
    .from("saga_items")
    .select("saga_id, item_type, item_id, position, role, placement, optional")
    .in("saga_id", sagaIds)
    .order("created_at", { ascending: true });
  const rows = (itemRows ?? []) as Array<{
    saga_id: string;
    item_type: ItemType;
    item_id: string;
    position: number | null;
    role: SagaItemRole | null;
    placement: SagaPlacement | null;
    optional: boolean;
  }>;

  // Dedupe multi-membresía: la fila con subsaga gana sobre la directa (spec
  // §2.3: el ítem se pinta en su grupo, no en el nexo). Entre dos subsagas
  // HERMANAS (mismo ítem en ambas, ninguna es la directa) no hay criterio de
  // spec para desempatar, así que se necesita un orden determinista: el
  // `.order("created_at", ...)` de arriba hace que el bucle procese primero
  // la fila más antigua, y como ninguna de las dos condiciones de reemplazo
  // se cumple entre dos no-null, gana la membresía más antigua en vez de
  // depender del orden físico que devuelva Postgres.
  const byItem = new Map<string, { row: (typeof rows)[number]; groupSagaId: string | null }>();
  for (const row of rows) {
    const groupSagaId =
      row.saga_id === id ? null : directChildFor(row.saga_id, id, descendants);
    if (row.saga_id !== id && groupSagaId === null) continue; // descendiente >1 nivel sin cadena (no debería)
    const key = `${row.item_type}:${row.item_id}`;
    const prev = byItem.get(key);
    if (!prev || (prev.groupSagaId === null && groupSagaId !== null)) {
      byItem.set(key, { row, groupSagaId });
    }
  }

  // Metadatos de catálogo por tipo, con año real de cada tabla (books.published_year
  // / movies|series.release_year) para el orden «Publicación» de fase 2.
  const idsByType: Record<ItemType, string[]> = { book: [], movie: [], series: [] };
  for (const { row } of byItem.values()) idsByType[row.item_type].push(row.item_id);
  const YEAR_COLUMN: Record<ItemType, "published_year" | "release_year"> = {
    book: "published_year",
    movie: "release_year",
    series: "release_year",
  };
  const meta = new Map<string, { title: string; coverUrl: string | null; year: number | null }>();
  await Promise.all(
    (Object.keys(idsByType) as ItemType[]).map(async (type) => {
      if (idsByType[type].length === 0) return;
      const { data } = await supabase
        .from(CATALOG_TABLE[type])
        .select(`id, title, cover_url, ${YEAR_COLUMN[type]}`)
        .in("id", idsByType[type]);
      for (const r of data ?? []) {
        const row = r as unknown as Record<string, unknown>;
        meta.set(`${type}:${row.id}`, {
          title: row.title as string,
          coverUrl: (row.cover_url as string | null) ?? null,
          year: (row[YEAR_COLUMN[type]] as number | null) ?? null,
        });
      }
    }),
  );

  // Estado por ítem desde PASES (dueños del estado desde el hub §Tarea 9;
  // library_entries quedó congelada y aquí marcaba las obras como no leídas).
  // MemberStatus es un solo valor: "completed" gana sobre "in_progress" para
  // que una relectura no reste avance (cuesta el resaltado «Leyendo ahora» de
  // ese nodo, aceptado); in_progress solo cuenta desde el pase activo.
  const statusByItem = new Map<string, MemberStatus>();
  if (user) {
    await Promise.all(
      (Object.keys(idsByType) as ItemType[]).map(async (type) => {
        if (idsByType[type].length === 0) return;
        const { data } = await supabase
          .from("passes")
          .select("item_id, status, is_active")
          .eq("user_id", user.id)
          .eq("item_type", type)
          .in("item_id", idsByType[type]);
        for (const r of data ?? []) {
          const k = `${type}:${r.item_id}`;
          if (r.status === "completed") {
            statusByItem.set(k, "completed");
          } else if (r.is_active && r.status === "in_progress" && statusByItem.get(k) !== "completed") {
            statusByItem.set(k, "in_progress");
          }
        }
      }),
    );
  }

  const members: DetailMember[] = [];
  for (const { row, groupSagaId } of byItem.values()) {
    const m = meta.get(`${row.item_type}:${row.item_id}`);
    if (!m) continue;
    members.push({
      itemType: row.item_type,
      itemId: row.item_id,
      title: m.title,
      coverUrl: m.coverUrl,
      href: itemHref(row.item_type, row.item_id),
      position: row.position,
      role: row.role,
      placement: row.placement,
      optional: row.optional,
      status: statusByItem.get(`${row.item_type}:${row.item_id}`) ?? null,
      groupSagaId,
      ownerSagaId: row.saga_id,
      year: m.year,
    });
  }

  const groups = groupMembers(members, children);
  // `progress` se calcula más abajo con countedKeys (pertenencia, spec
  // 2026-07-25): NO necesita el orden principal. `orderSagas`/
  // `orderMemberships` se construyen más abajo por otro motivo — RouteView
  // (Task 6) los necesita para expandir bloques de un itinerario, ver el
  // comentario de esos dos campos en el tipo `SagaDetail`.

  // Nota media comunitaria: pases puntuados de todos los miembros, sin contar
  // las lecturas abandonadas (dropped) — apply-transition.ts cierra el pase
  // con finished_on al pasar a dropped sin limpiar el rating, así que sin este
  // filtro contaminarían la media (mismo criterio que get-community.ts).
  const ratingRows: Array<{ itemKey: string; userId: string; rating: number; finishedOn: string; passId: string }> = [];
  await Promise.all(
    (Object.keys(idsByType) as ItemType[]).map(async (type) => {
      if (idsByType[type].length === 0) return;
      const { data } = await supabase
        .from("passes")
        .select("id, item_id, user_id, rating, finished_on")
        .eq("item_type", type)
        .in("item_id", idsByType[type])
        .not("rating", "is", null)
        .not("finished_on", "is", null)
        .neq("status", "dropped");
      for (const r of data ?? []) {
        ratingRows.push({
          itemKey: `${type}:${r.item_id}`,
          userId: r.user_id,
          rating: r.rating as number,
          finishedOn: r.finished_on as string,
          passId: r.id,
        });
      }
    }),
  );
  const avgRating = averageSagaRating(ratingRows);

  // Byline: autor/creador dominante — persona con más créditos "de autoría"
  // entre los miembros. Filtrada por tipo con .in("item_id", ...) (la variante
  // preferida por el brief cuando resulta directa: idsByType ya está
  // calculado más arriba para catálogo/estado/nota, así que reutilizarlo aquí
  // evita cargar `credits` sin filtro).
  let byline: string | null = null;
  {
    const counts = new Map<string, number>();
    await Promise.all(
      (Object.keys(idsByType) as ItemType[]).map(async (type) => {
        if (idsByType[type].length === 0) return;
        const { data } = await supabase
          .from("credits")
          .select("person:people(name), role, item_type, item_id")
          .eq("item_type", type)
          .in("item_id", idsByType[type])
          .in("role", AUTHORSHIP_ROLES);
        for (const r of data ?? []) {
          const name = (r.person as { name: string } | null)?.name;
          if (!name) continue;
          counts.set(name, (counts.get(name) ?? 0) + 1);
        }
      }),
    );
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top && top[1] >= 2) byline = top[0];
  }

  // Rol del viewer en el mismo batch: evita el segundo auth.getUser() que fase 2 eliminó (los botones de edición lo consumen).
  // Rutas curadas y elección del viewer también van en este batch: ninguna
  // depende de graph/followRow/parentRow/roleRow, solo de
  // `id` y `user`, ya resueltos arriba — lanzarlas después del Promise.all
  // (como hacía la Task 4) añadía hasta 2 viajes de ida y vuelta en serie al
  // camino caliente de la ficha de saga.
  const [followRow, parentRow, roleRow, curated, routeChoice, windowsRes] = await Promise.all([
    user
      ? supabase
          .from("saga_follows")
          .select("saga_id")
          .eq("user_id", user.id)
          .eq("saga_id", id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    saga.parentSagaId
      ? supabase.from("sagas").select("id, name").eq("id", saga.parentSagaId).maybeSingle()
      : Promise.resolve({ data: null }),
    user
      ? supabase.from("profiles").select("role").eq("user_id", user.id).maybeSingle()
      : Promise.resolve({ data: null }),
    getSagaRoutes(supabase, id),
    // Sin user, se resuelve a null sin lanzar consulta (getRouteChoice exige userId).
    user ? getRouteChoice(supabase, user.id, id) : Promise.resolve(null),
    // Ventanas de TODO el subárbol (fase 2b, Task 6): una entrada `libre` puede
    // vivir en cualquier saga del árbol, igual que `itemRows` más arriba — NO
    // solo las de la raíz. Los títulos de sus anclas se resuelven abajo con
    // `meta`/`descendants`, ya en memoria: sin cargador nuevo, sin llamar a
    // getAnchorOptions desde aquí (ese cargador es del editor, que solo mira
    // una saga a la vez más su subárbol para las OPCIONES, no para hidratar).
    // `created_at` viaja en el select porque resolveWindows desempata con ella
    // (dos sagas hermanas pueden compartir ventana sobre la misma obra, ver su
    // comentario) — sin `.order()` aquí: resolveWindows ordena ella misma, no
    // confía en que el llamador ya lo haya hecho.
    supabase
      .from("saga_placement_windows")
      .select(
        "item_type, item_id, child_saga_id, after_item_type, after_item_id, after_child_saga_id, before_item_type, before_item_id, before_child_saga_id, created_at",
      )
      .in("saga_id", sagaIds),
  ]);

  // Lookup del mapa derivado (fase 3, Task 2): accent y nombre de cada grupo,
  // desde los MISMOS `groups` que pinta la pestaña Info (spec §1.3). Ya no hace
  // falta el lookup de miembros ni el de subsagas del grafo viejo: `deriveSagaMap`
  // solo dibuja obras, nunca un nodo-bloque, así que no necesita más que esto.
  const groupAccent = new Map<string | null, SagaAccentToken>();
  const groupNameMap = new Map<string | null, string | null>();
  for (const g of groups) {
    groupAccent.set(g.sagaId, g.accent);
    groupNameMap.set(g.sagaId, g.name);
  }

  // Insumos de createCuratedOrder (§1.5) para reconstruir el ORDEN de una
  // subsaga (Task 6, RouteView) — NO el denominador del avance del hero desde
  // el 2026-07-25 (ver countedKeys más abajo). Se devuelven en SagaDetail
  // (orderSagas/orderMemberships) tal cual, sin llamar aquí a
  // createCuratedOrder: nada en este fichero necesita ya el orden en sí
  // mismo. La raíz no tiene colocación en un padre (no lo tiene: es la raíz
  // de este árbol), así que sus dos campos van a null — createCuratedOrder
  // solo los mira al ordenar HIJAS, y la raíz nunca es hija de nadie aquí.
  const orderSagas: OrderSaga[] = [
    { id, name: saga.name, parentSagaId: null, positionInParent: null, placementInParent: null },
    ...[...descendants.values()].map((d) => ({
      id: d.id,
      name: d.name,
      parentSagaId: d.parent_saga_id,
      positionInParent: d.position_in_parent,
      placementInParent: d.placement_in_parent,
    })),
  ];
  const orderMemberships: OrderMembership[] = rows.map((r) => ({
    sagaId: r.saga_id,
    itemType: r.item_type,
    itemId: r.item_id,
    position: r.position,
  }));
  // Insumos de countedKeys (el DENOMINADOR, ./progress.ts), construidos con los
  // mismos datos ya en memoria que orderSagas/orderMemberships (sin viaje
  // extra): optionalInParent de la raíz no se usa nunca (walk() solo la mira
  // al descender desde un padre), pero progressSagas debe incluir la raíz o un
  // miembro directo de la saga consultada no contaría.
  const progressSagas: ProgressSaga[] = [
    { id, parentSagaId: null, optionalInParent: false },
    ...[...descendants.values()].map((d) => ({
      id: d.id,
      parentSagaId: d.parent_saga_id,
      optionalInParent: d.optional_in_parent,
    })),
  ];
  const progressMemberships: ProgressMembership[] = rows.map((r) => ({
    sagaId: r.saga_id,
    itemType: r.item_type,
    itemId: r.item_id,
    optional: r.optional,
  }));
  // El denominador ya no es el orden (spec 2026-07-25): countedKeys cuenta la
  // PERTENENCIA. computeProgress no cambia de firma — recibe las claves que
  // cuentan donde antes recibía las del orden principal.
  const progress = computeProgress(groups, countedKeys(id, progressSagas, progressMemberships));

  // Títulos de ancla para las ventanas (Task 6): el subárbol entero YA está en
  // memoria — `meta` (catálogo de toda obra que aparece en `saga_items` del
  // árbol, sea o no ancla) y `descendants` (todo bloque del árbol) — así que se
  // reutilizan en vez de pedirle lo mismo a getAnchorOptions con un viaje
  // aparte. Mismas claves que `DraftEntry.key`/`hydrateWindows`. Se resuelve
  // aquí, antes del grafo: `deriveSagaMap` necesita las ventanas ya resueltas.
  const anchorTitles = new Map<string, string>();
  for (const [key, m] of meta) anchorTitles.set(`i:${key}`, m.title);
  for (const d of descendants.values()) anchorTitles.set(`s:${d.id}`, d.name);
  const windows = resolveWindows((windowsRes.data ?? []) as RawWindowRow[], anchorTitles);

  // El mapa ya no se lee: se deriva de lo curado (fase 3). Los mismos `groups`
  // que pinta la ficha, más las ventanas, más los lookups de acento y nombre
  // que ya estaban construidos aquí para el grafo viejo.
  const derivedGraph = deriveSagaMap(groups, windows, {
    groupAccent,
    groupName: groupNameMap,
  });
  // `SagaDetail.graph` sigue siendo `SagaGraph | null`, y sigue siendo el
  // origen de «/saga/[id]/mapa» (esa página redirige con `!graph`, no con
  // `hasGraph`) y de cualquier otro consumidor que solo mire `graph !== null`
  // — pero ahora el interruptor manda EN EL ORIGEN: `resolveSagaGraph` lo
  // aplica antes de que `graph` salga de esta función, así que `null` cubre
  // los dos motivos a la vez ("no hay nada curado que pintar" Y "el curador
  // apagó el interruptor"), y ningún consumidor tiene que distinguirlos.
  const graph = resolveSagaGraph(saga.showMap, derivedGraph);

  // hasGraph (fase 3, Task 4-bis): vuelve a ser la tautología `graph !== null`
  // — el interruptor ya no hace falta comprobarlo aquí porque `graph` ya lo
  // respeta (ver `resolveSagaGraph`). Se mantiene como campo aparte, no
  // inline en cada consumidor, porque sigue siendo el nombre que cuenta la
  // intención en el aviso retirado, el badge de la card y la ruta sintética
  // `lectura` del selector — los tres sitios listados en el brief original.
  const hasGraph = graph !== null;

  // Itinerarios (spec 2026-07-22). Las etiquetas de las rutas sintéticas se
  // resuelven aquí porque buildRouteList es puro y no debe tocar next-intl.
  // `curated` y `routeChoice` ya llegaron resueltos desde el batch de arriba.
  const tRoutes = await getTranslations("saga");
  const routes = buildRouteList(
    curated,
    { lectura: tRoutes("orderReading"), publicacion: tRoutes("orderPublication") },
    hasGraph,
  );

  // Todos los descendientes, tengan o no miembros (hallazgo 2): el origen de
  // "esta subsaga existe" para un bloque de ruta no puede ser `groups`, que
  // omite las hijas vacías.
  const childRefs: SagaChildRef[] = [...descendants.values()].map((d) => ({
    id: d.id,
    name: d.name,
    accentColor: d.accent_color,
    positionInParent: d.position_in_parent,
    placementInParent: d.placement_in_parent,
    optionalInParent: d.optional_in_parent,
  }));

  return {
    saga,
    parent: (parentRow as { data: { id: string; name: string } | null }).data ?? null,
    byline,
    groups,
    memberCount: members.length,
    childCount: children.length,
    progress,
    avgRating,
    isFollowing: Boolean((followRow as { data: unknown }).data),
    isAuthenticated: Boolean(user),
    graph,
    hasGraph,
    viewerRole: (roleRow as { data: { role: UserRole } | null }).data?.role ?? null,
    routes,
    routeChoice,
    orderSagas,
    orderMemberships,
    childRefs,
    windows,
  };
}
