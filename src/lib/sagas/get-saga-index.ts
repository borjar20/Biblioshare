import type { createClient } from "@/lib/supabase/server";
import { getCurrentUserRole, type UserRole } from "@/lib/auth/roles";
import { buildSagaIndex, type SagaIndexCard } from "./build-saga-index";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

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

  return {
    cards: buildSagaIndex(sagasRes.data ?? [], itemsRes.data ?? [], query, {
      isAuthenticated: user !== null,
      routes: routesRes.data ?? [],
      passes: passesRes.data ?? [],
      routeChoices: choicesRes.data ?? [],
      followedIds,
    }),
    followedIds,
    isAuthenticated: user !== null,
    viewerRole,
  };
}
