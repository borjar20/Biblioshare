import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { DraftAnchor, DraftEntry, DraftWindow, NestedSubject, SequenceDraft } from "./sequence-draft";
import type { SagaItemRole, SagaPlacement } from "./types";
import { getAnchorOptions } from "./get-anchor-options";
import { buildWindowOwners, type OwnerRow } from "./window-owners";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const CATALOG_TABLE: Record<ItemType, "books" | "movies" | "series"> = {
  book: "books", movie: "movies", series: "series",
};

// Carga los insumos del EDITOR, que no son los de la ficha. getSagaDetail baja
// todo el subárbol y lo deduplica para pintarlo; aquí hace falta lo contrario:
// SOLO las filas cuyo saga_id es esta saga, porque son las únicas que esta
// pantalla puede escribir. Los miembros de una subsaga se editan en la pantalla
// de esa subsaga (#187), y usar getSagaDetail aquí reintroduciría justo la
// lista plana que aquella issue cerró.
// Sin caso `null`: la existencia de la saga la comprueba la página (un
// `maybeSingle()` sobre `sagas` seguido de `notFound()`) ANTES de llamar
// aquí. Una saga real sin miembros ni hijas —p. ej. recién creada— es un
// estado legítimo, y su borrador vacío (slots/free/unclassified vacíos) es
// exactamente lo que el editor tiene que pintar en ese caso.
export async function getSagaSequence(
  supabase: SupabaseServerClient,
  sagaId: string,
): Promise<{
  draft: SequenceDraft;
  childIds: string[];
  /** Datos planos y serializables de las hijas para el rail. Nunca un `Map`:
   *  esto cruza la frontera servidor→cliente. */
  childSagas: Array<{ id: string; name: string; accentColor: string | null; count: number }>;
}> {
  const [{ data: itemRows }, { data: childRows }, { data: windowRows }] = await Promise.all([
    supabase
      .from("saga_items")
      // `is_primary` viaja porque decide la DUEÑA de la ventana (fase 4,
      // windowOwnerFor): sin él, una obra con doble membresía se resolvería
      // aquí distinto que en el servidor (loadWindowOwners, que sí ve las filas
      // propias) y el guardado del padre se llevaría por delante la ventana de
      // la hija.
      .select("item_type, item_id, position, placement, optional, role, is_primary")
      .eq("saga_id", sagaId)
      .order("position", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
    supabase
      .from("sagas")
      .select("id, name, accent_color, position_in_parent, placement_in_parent, optional_in_parent")
      .eq("parent_saga_id", sagaId),
    // Ventanas de ESTA saga (20260727_saga_placement_windows.sql). Los títulos
    // de sus anclas NO salen de itemRows/childRows: un ancla puede apuntar a
    // una obra de un nieto, así que se resuelven con getAnchorOptions, que
    // recorre el subárbol entero, más abajo. `created_at` viaja en el select
    // porque hydrateWindows desempata con ella (hoy este editor solo escribe
    // ventanas de la saga propia, así que el unique impide que ESTA query
    // devuelva dos filas para el mismo sujeto, pero hydrateWindows es pura y
    // hermana de resolveWindows en get-saga-detail.ts, que sí puede
    // recibirlas — mismo criterio ahí y aquí, ver el comentario de la
    // función).
    supabase
      .from("saga_placement_windows")
      .select(
        "item_type, item_id, child_saga_id, after_item_type, after_item_id, after_child_saga_id, before_item_type, before_item_id, before_child_saga_id, created_at",
      )
      .eq("saga_id", sagaId),
  ]);

  const rows = (itemRows ?? []) as Array<{
    item_type: ItemType; item_id: string; position: number | null;
    placement: SagaPlacement | null; optional: boolean; role: SagaItemRole | null;
    is_primary: boolean;
  }>;
  const children = (childRows ?? []) as Array<{
    id: string; name: string; accent_color: string | null;
    position_in_parent: number | null; placement_in_parent: SagaPlacement | null; optional_in_parent: boolean;
  }>;

  const idsByType: Record<ItemType, string[]> = { book: [], movie: [], series: [] };
  for (const r of rows) idsByType[r.item_type].push(r.item_id);
  const meta = new Map<string, { title: string; coverUrl: string | null }>();
  const counts = new Map<string, number>();
  const rawWindows = (windowRows ?? []) as RawWindowRow[];
  let windowsByKey = new Map<string, DraftWindow>();

  type ChildItemRow = {
    saga_id: string;
    item_type: ItemType;
    item_id: string;
    placement: SagaPlacement | null;
    is_primary: boolean;
  };
  const childItems: ChildItemRow[] = [];
  let childWindows: RawWindowRow[] = [];
  let anchorTitles = new Map<string, string>();

  await Promise.all([
    // Metadatos de catálogo, una consulta por tabla (mismo patrón que
    // get-saga-detail.ts:200-216).
    ...(Object.keys(idsByType) as ItemType[]).map(async (type) => {
      if (idsByType[type].length === 0) return;
      const { data } = await supabase
        .from(CATALOG_TABLE[type]).select("id, title, cover_url").in("id", idsByType[type]);
      for (const r of data ?? []) meta.set(`${type}:${r.id}`, { title: r.title as string, coverUrl: (r.cover_url as string | null) ?? null });
    }),
    // Obras de las hijas DIRECTAS: alimentan el «BLOQUE · 8 OBRAS» de su fila y
    // el cajón de ventanas anidadas (fase 4). Una sola consulta para las dos
    // cosas — antes solo pedía `saga_id` para contar.
    (async () => {
      if (children.length === 0) return;
      const { data } = await supabase
        .from("saga_items")
        .select("saga_id, item_type, item_id, placement, is_primary")
        .in("saga_id", children.map((c) => c.id));
      for (const r of (data ?? []) as ChildItemRow[]) {
        counts.set(r.saga_id, (counts.get(r.saga_id) ?? 0) + 1);
        childItems.push(r);
      }
    })(),
    // Anclas del subárbol entero: hacen falta para resolver los títulos de las
    // ventanas propias Y de las anidadas. Se salta el recorrido solo cuando no
    // puede haber ninguna ventana que resolver: ni filas propias ni hijas.
    (async () => {
      if (rawWindows.length === 0 && children.length === 0) return;
      const anchors = await getAnchorOptions(supabase, sagaId);
      anchorTitles = new Map(
        anchors.map((a) => [a.kind === "item" ? `i:${a.itemType}:${a.itemId}` : `s:${a.childSagaId}`, a.title] as const),
      );
    })(),
    // Ventanas de las hijas DIRECTAS (fase 4): el cajón tiene que ENSEÑAR la
    // que la obra ya tenga curada desde su propia saga, en vez de dejar crear
    // una segunda que el unique parcial no impediría (viven bajo `saga_id`
    // distintos). Y enseñarla es además lo que hace que el padre la reemita al
    // guardar, en vez de borrarla.
    (async () => {
      if (children.length === 0) return;
      const { data } = await supabase
        .from("saga_placement_windows")
        .select(
          "item_type, item_id, child_saga_id, after_item_type, after_item_id, after_child_saga_id, before_item_type, before_item_id, before_child_saga_id, created_at",
        )
        .in("saga_id", children.map((c) => c.id));
      childWindows = (data ?? []) as RawWindowRow[];
    })(),
  ]);

  windowsByKey = hydrateWindows(rawWindows, anchorTitles);

  // Dueña de cada sujeto: las MISMAS reglas y los MISMOS insumos que aplicará
  // `saveSequence` en servidor (`loadWindowOwners`) — dos derivaciones distintas
  // del dueño acabarían discrepando, que es la familia de la #203.
  //
  // Por eso entran también las filas PROPIAS, no solo las de las hijas: una obra
  // con doble membresía (fila en esta saga Y en una hija) tiene su dueña
  // decidida por `is_primary`, y calcularla aquí sin las propias daría «la
  // hija» donde el servidor dice «el padre». Esa discrepancia no se quedaría en
  // un error de validación: el sujeto viaja en `windowSubjects`, que el RPC
  // borra sin validar, así que el guardado del padre se llevaría por delante la
  // ventana que la hija tiene curada sobre esa misma obra.
  //
  // `blocks` va vacío a propósito: la colocación de una hija en el padre ya se
  // resuelve arriba con `ownerSagaId: sagaId`, y meterla aquí no cambiaría nada.
  const owners = buildWindowOwners(
    [
      ...rows.map(
        (r): OwnerRow => ({
          sagaId, itemType: r.item_type, itemId: r.item_id,
          placement: r.placement, isPrimary: r.is_primary,
        }),
      ),
      ...childItems.map(
        (r): OwnerRow => ({
          sagaId: r.saga_id, itemType: r.item_type, itemId: r.item_id,
          placement: r.placement, isPrimary: r.is_primary,
        }),
      ),
    ],
    [],
    sagaId,
  );

  const entries: Array<{ entry: DraftEntry; position: number | null; placement: SagaPlacement | null }> = [];
  for (const r of rows) {
    const m = meta.get(`${r.item_type}:${r.item_id}`);
    if (!m) continue; // huérfana de catálogo: no se pinta ni se toca
    entries.push({
      position: r.position, placement: r.placement,
      entry: {
        key: `i:${r.item_type}:${r.item_id}`, kind: "item", itemType: r.item_type, itemId: r.item_id,
        childSagaId: null, title: m.title, coverUrl: m.coverUrl, accentColor: null, count: null,
        optional: r.optional, role: r.role,
        // Defensivo, como sendTo/pairWith al escribir: `window` SIEMPRE null
        // fuera de `libre`, aunque quedara una fila huérfana en la tabla de
        // ventanas por un cambio de placement que no pasó por el borrador.
        window: r.placement === "libre" ? windowsByKey.get(`i:${r.item_type}:${r.item_id}`) ?? null : null,
        // `owners` se construye SOLO con las filas de las hijas, así que una
        // obra propia sin doble membresía no está ahí y cae en `sagaId`, que es
        // lo correcto: su fila de `saga_items` vive bajo esta saga.
        ownerSagaId: owners.get(`i:${r.item_type}:${r.item_id}`) ?? sagaId,
        isNew: false,
      },
    });
  }
  for (const c of children) {
    entries.push({
      position: c.position_in_parent, placement: c.placement_in_parent,
      entry: {
        key: `s:${c.id}`, kind: "block", itemType: null, itemId: null, childSagaId: c.id,
        title: c.name, coverUrl: null, accentColor: c.accent_color, count: counts.get(c.id) ?? 0,
        optional: c.optional_in_parent, role: null,
        window: c.placement_in_parent === "libre" ? windowsByKey.get(`s:${c.id}`) ?? null : null,
        // La colocación de la hija en el padre es del padre: su fila de ventana
        // vive bajo esta saga, siempre.
        ownerSagaId: sagaId,
        isNew: false,
      },
    });
  }

  // Sujetos anidados: obras `libre` de las hijas directas que NO sean ya fila
  // propia de esta saga — esas se curan en su zona, no en el cajón. Así la
  // clave de un `NestedSubject` nunca choca con la de una `DraftEntry`.
  const nestedWindows = hydrateWindows(childWindows, anchorTitles);
  const ownKeys = new Set(entries.map((e) => e.entry.key));
  const nestedRows = childItems.filter((r) => {
    const key = `i:${r.item_type}:${r.item_id}`;
    return owners.has(key) && !ownKeys.has(key);
  });

  const nestedIds: Record<ItemType, string[]> = { book: [], movie: [], series: [] };
  for (const r of nestedRows) nestedIds[r.item_type].push(r.item_id);
  const nestedMeta = new Map<string, { title: string; coverUrl: string | null }>();
  await Promise.all(
    (Object.keys(nestedIds) as ItemType[]).map(async (type) => {
      if (nestedIds[type].length === 0) return;
      const { data } = await supabase
        .from(CATALOG_TABLE[type]).select("id, title, cover_url").in("id", nestedIds[type]);
      for (const r of data ?? []) {
        nestedMeta.set(`${type}:${r.id}`, {
          title: r.title as string,
          coverUrl: (r.cover_url as string | null) ?? null,
        });
      }
    }),
  );

  const nested: NestedSubject[] = nestedRows.flatMap((r) => {
    const m = nestedMeta.get(`${r.item_type}:${r.item_id}`);
    if (!m) return []; // huérfana de catálogo: ni se pinta ni se toca
    const key = `i:${r.item_type}:${r.item_id}`;
    return [{
      key,
      ownerSagaId: owners.get(key)!,
      childSagaId: r.saga_id,
      itemType: r.item_type,
      itemId: r.item_id,
      title: m.title,
      coverUrl: m.coverUrl,
      window: nestedWindows.get(key) ?? null,
    }];
  });
  nested.sort((a, b) => a.title.localeCompare(b.title));

  return {
    draft: hydrateSequenceDraft(entries, nested),
    childIds: children.map((c) => c.id),
    childSagas: children.map((c) => ({
      id: c.id, name: c.name, accentColor: c.accent_color, count: counts.get(c.id) ?? 0,
    })),
  };
}

/** Reparte las filas en las tres zonas y agrupa por hueco. Exportada aparte —y
 *  pura— para poder probarla sin Supabase: es donde vive la única lógica de
 *  este fichero (el empate de `position` ES el tándem, así que dos filas con el
 *  mismo número tienen que caer en el MISMO hueco, no en dos). */
export function hydrateSequenceDraft(
  rows: Array<{ entry: DraftEntry; position: number | null; placement: SagaPlacement | null }>,
  nested: NestedSubject[] = [],
): SequenceDraft {
  const byPosition = new Map<number, DraftEntry[]>();
  const free: DraftEntry[] = [];
  const unclassified: DraftEntry[] = [];
  for (const r of rows) {
    if (r.placement === "fijo" && r.position !== null) {
      byPosition.set(r.position, [...(byPosition.get(r.position) ?? []), r.entry]);
    } else if (r.placement === "libre") {
      free.push(r.entry);
    } else {
      unclassified.push(r.entry);
    }
  }
  const slots = [...byPosition.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
  return { slots, free, unclassified, removed: [], nested };
}

/** Forma cruda de una fila de `saga_placement_windows`
 *  (20260727_saga_placement_windows.sql). */
export type RawWindowRow = {
  item_type: ItemType | null;
  item_id: string | null;
  child_saga_id: string | null;
  after_item_type: ItemType | null;
  after_item_id: string | null;
  after_child_saga_id: string | null;
  before_item_type: ItemType | null;
  before_item_id: string | null;
  before_child_saga_id: string | null;
  /** Para el desempate determinista entre dos sagas hermanas con ventana
   *  sobre la misma obra, ver `hydrateWindows`. */
  created_at: string;
};

/** Resuelve las filas crudas de `saga_placement_windows` a un mapa de
 *  `DraftWindow` por clave de SUJETO (mismo formato que `DraftEntry.key`:
 *  `i:<tipo>:<uuid>` / `s:<uuid>`), usando `anchorTitles` —el subárbol
 *  ENTERO, de `getAnchorOptions`, no las filas que ya carga esta función—
 *  para resolver el título de cada ancla. Pura y exportada aparte para
 *  poder probarla sin Supabase, mismo patrón que `hydrateSequenceDraft`.
 *
 *  Un ancla rota (su clave no está en `anchorTitles`: la obra o el bloque ya
 *  no está en el árbol) NO se limpia — queda a `null`. Si la ventana se queda
 *  sin ninguna ancla que resuelva, el sujeto no aparece en el mapa devuelto
 *  (equivale a `window: null` en el borrador). */
export function hydrateWindows(
  rows: RawWindowRow[],
  anchorTitles: Map<string, string>,
): Map<string, DraftWindow> {
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

  const resolveAnchor = (
    itemType: ItemType | null,
    itemId: string | null,
    childSagaId: string | null,
  ): DraftAnchor | null => {
    const key = keyOf(itemType, itemId, childSagaId);
    if (key === null) return null;
    const title = anchorTitles.get(key);
    if (title === undefined) return null; // ancla rota: no resuelve
    return itemId !== null && itemType !== null
      ? { kind: "item", itemType, itemId, childSagaId: null, title }
      : { kind: "block", itemType: null, itemId: null, childSagaId, title };
  };

  // Desempate determinista: los uniques de `saga_placement_windows` son POR
  // SAGA (ver la migración), así que nada impide que dos sagas HERMANAS del
  // mismo subárbol tengan cada una su propia fila de ventana para la MISMA
  // obra compartida (multi-membership). Hoy `rows` solo trae las de ESTA
  // saga (el unique ya lo impide dentro de una sola), pero esta función es
  // pura y hermana de `resolveWindows` (get-saga-detail.ts), que sí puede
  // recibir el choque — mismo criterio ahí que aquí: gana la fila más
  // antigua (`created_at` menor) en vez de depender del orden físico que
  // devuelva Postgres, y se ordena dentro de la función (no se confía en que
  // el llamador ya lo haya hecho) para que el resultado sea determinista por
  // sí solo pase lo que pase el orden en que lleguen las filas.
  const sorted = [...rows].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const seenSubjects = new Set<string>();
  const result = new Map<string, DraftWindow>();
  for (const r of sorted) {
    const subjectKey = keyOf(r.item_type, r.item_id, r.child_saga_id);
    if (subjectKey === null) continue; // fila imposible: el CHECK del sujeto lo impide
    if (seenSubjects.has(subjectKey)) continue; // ya resuelto por la fila más antigua
    seenSubjects.add(subjectKey);
    const after = resolveAnchor(r.after_item_type, r.after_item_id, r.after_child_saga_id);
    const before = resolveAnchor(r.before_item_type, r.before_item_id, r.before_child_saga_id);
    if (after === null && before === null) continue; // sin ninguna ancla que resuelva: sin ventana
    result.set(subjectKey, { after, before });
  }
  return result;
}
