import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { itemHref } from "@/lib/catalog/item-href";
import { getSaga } from "./get-saga";
import {
  averageSagaRating,
  computeProgress,
  groupMembers,
  type MemberGroup,
} from "./group-members";
import type { DetailMember, MemberStatus, Saga, SagaChildRef } from "./types";

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
  hasGraph: boolean;
};

type DescendantRow = {
  id: string;
  name: string;
  accent_color: string | null;
  parent_saga_id: string | null;
};

// Descendientes hasta profundidad 4 (spec §1.5: cap como cinturón frente a
// ciclos, el trigger ya los impide). Iterativo: una query por nivel.
async function fetchDescendants(
  supabase: SupabaseServerClient,
  rootId: string,
): Promise<Map<string, DescendantRow>> {
  const found = new Map<string, DescendantRow>();
  let frontier = [rootId];
  for (let depth = 0; depth < 4 && frontier.length > 0; depth++) {
    const { data } = await supabase
      .from("sagas")
      .select("id, name, accent_color, parent_saga_id")
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

export async function getSagaDetail(
  supabase: SupabaseServerClient,
  id: string,
): Promise<SagaDetail | null> {
  // getSaga mantiene el rellenado perezoso TMDB y devuelve saga+miembros
  // directos; aquí se añade todo lo demás.
  const base = await getSaga(supabase, id);
  if (!base) return null;
  const { saga } = base;

  const descendants = await fetchDescendants(supabase, id);
  const children: SagaChildRef[] = [...descendants.values()]
    .filter((d) => d.parent_saga_id === id)
    .map((d) => ({ id: d.id, name: d.name, accentColor: d.accent_color }));

  // Membresías del root + descendientes, con su saga de origen.
  const sagaIds = [id, ...descendants.keys()];
  const { data: itemRows } = await supabase
    .from("saga_items")
    .select("saga_id, item_type, item_id, position")
    .in("saga_id", sagaIds)
    .order("created_at", { ascending: true });
  const rows = (itemRows ?? []) as Array<{
    saga_id: string;
    item_type: ItemType;
    item_id: string;
    position: number | null;
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

  // Metadatos de catálogo por tipo.
  const idsByType: Record<ItemType, string[]> = { book: [], movie: [], series: [] };
  for (const { row } of byItem.values()) idsByType[row.item_type].push(row.item_id);
  const meta = new Map<string, { title: string; coverUrl: string | null }>();
  await Promise.all(
    (Object.keys(idsByType) as ItemType[]).map(async (type) => {
      if (idsByType[type].length === 0) return;
      const { data } = await supabase
        .from(CATALOG_TABLE[type])
        .select("id, title, cover_url")
        .in("id", idsByType[type]);
      for (const r of data ?? []) meta.set(`${type}:${r.id}`, { title: r.title, coverUrl: r.cover_url });
    }),
  );

  // Estado del usuario (RLS: solo sus filas) — puede no haber sesión.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const statusByItem = new Map<string, MemberStatus>();
  if (user) {
    await Promise.all(
      (Object.keys(idsByType) as ItemType[]).map(async (type) => {
        if (idsByType[type].length === 0) return;
        const { data } = await supabase
          .from("library_entries")
          .select("item_id, status")
          .eq("user_id", user.id)
          .eq("item_type", type)
          .in("item_id", idsByType[type]);
        for (const r of data ?? []) {
          const s = r.status as string;
          statusByItem.set(
            `${type}:${r.item_id}`,
            s === "completed" ? "completed" : s === "in_progress" ? "in_progress" : null,
          );
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
      status: statusByItem.get(`${row.item_type}:${row.item_id}`) ?? null,
      groupSagaId,
    });
  }

  const groups = groupMembers(members, children);
  const progress = computeProgress(groups);

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

  const [{ count: nodeCount }, followRow, parentRow] = await Promise.all([
    supabase.from("saga_nodes").select("id", { count: "exact", head: true }).eq("saga_id", id),
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
  ]);

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
    hasGraph: (nodeCount ?? 0) > 0,
  };
}
