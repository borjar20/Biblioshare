import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { getCurrentUserRole, type UserRole } from "@/lib/auth/roles";
import { buildSagaIndex, type SagaIndexCard, type SagaIndexCreditRow } from "./build-saga-index";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Misma lista y mismo motivo que get-saga-detail.ts:46 (byline del hero) y
// get-followed-sagas.ts:34: "writer" queda fuera a propósito porque puede
// haber varios y diluiría el criterio de "dominante".
const AUTHORSHIP_ROLES = ["author", "director", "creator"] as const;

export type SagaIndexData = {
  cards: SagaIndexCard[];
  followedIds: Set<string>;
  isAuthenticated: boolean;
  viewerRole: UserRole | null;
};

// Datos del índice /sagas: catálogo completo de sagas + membresías en
// consultas planas (el catálogo de sagas es pequeño; agregar en JS evita
// aggregates de PostgREST), más rutas curadas, follows, pases activos y ruta
// adoptada del viewer si hay sesión (spec 2026-07-29: tipo/grafo/itinerarios/
// progreso/colección, todo derivado, sin tablas nuevas).
export async function getSagaIndexData(
  supabase: SupabaseServerClient,
  query: string,
): Promise<SagaIndexData> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [sagasRes, itemsRes, routesRes, followsRes, passesRes, choicesRes, viewerRole] =
    await Promise.all([
      supabase
        .from("sagas")
        .select("id, name, parent_saga_id, accent_color, cover_url, optional_in_parent, show_map"),
      supabase.from("saga_items").select("saga_id, item_type, item_id, optional"),
      supabase.from("saga_routes").select("saga_id, slug, name"),
      user
        ? supabase.from("saga_follows").select("saga_id").eq("user_id", user.id)
        : Promise.resolve({ data: [] as { saga_id: string }[] }),
      user
        ? supabase
            .from("passes")
            .select("item_type, item_id, status")
            .eq("user_id", user.id)
            .eq("is_active", true)
        : Promise.resolve({ data: [] as { item_type: string; item_id: string; status: string }[] }),
      user
        ? supabase.from("saga_route_choices").select("saga_id, route_slug").eq("user_id", user.id)
        : Promise.resolve({ data: [] as { saga_id: string; route_slug: string }[] }),
      user ? getCurrentUserRole(supabase) : Promise.resolve(null),
    ]);

  const followedIds = new Set((followsRes.data ?? []).map((f) => f.saga_id));

  // Créditos de autoría, para el byline de la línea meta. Va en un segundo
  // viaje porque las claves salen de `saga_items`, que acaba de llegar: una
  // consulta por tipo (el `.in` de PostgREST no acepta la pareja polimórfica
  // (item_type, item_id) de golpe), mismo patrón que get-followed-sagas.ts.
  const idsByType: Record<ItemType, string[]> = { book: [], movie: [], series: [] };
  const seenItem = new Set<string>();
  for (const m of itemsRes.data ?? []) {
    const key = `${m.item_type}:${m.item_id}`;
    if (seenItem.has(key)) continue;
    seenItem.add(key);
    idsByType[m.item_type as ItemType]?.push(m.item_id);
  }
  const credits: SagaIndexCreditRow[] = [];
  await Promise.all(
    (Object.keys(idsByType) as ItemType[]).map(async (type) => {
      if (idsByType[type].length === 0) return;
      const { data } = await supabase
        .from("credits")
        .select("person:people(name), item_type, item_id")
        .eq("item_type", type)
        .in("item_id", idsByType[type])
        .in("role", AUTHORSHIP_ROLES);
      for (const r of data ?? []) {
        const name = (r.person as { name: string } | null)?.name;
        if (!name) continue;
        credits.push({ item_type: r.item_type, item_id: r.item_id, name });
      }
    }),
  );

  return {
    cards: buildSagaIndex(sagasRes.data ?? [], itemsRes.data ?? [], query, {
      isAuthenticated: user !== null,
      routes: routesRes.data ?? [],
      passes: passesRes.data ?? [],
      routeChoices: choicesRes.data ?? [],
      followedIds,
      credits,
    }),
    followedIds,
    isAuthenticated: user !== null,
    viewerRole,
  };
}
