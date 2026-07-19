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

// Datos del índice /sagas: catálogo completo de sagas + membresías en dos
// consultas planas (el catálogo de sagas es pequeño; agregar en JS evita
// aggregates de PostgREST), más follows y rol del viewer si hay sesión.
export async function getSagaIndexData(
  supabase: SupabaseServerClient,
  query: string,
): Promise<SagaIndexData> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [sagasRes, itemsRes, followsRes, viewerRole] = await Promise.all([
    supabase.from("sagas").select("id, name, parent_saga_id, accent_color, cover_url"),
    supabase.from("saga_items").select("saga_id, item_type, item_id"),
    user
      ? supabase.from("saga_follows").select("saga_id").eq("user_id", user.id)
      : Promise.resolve({ data: [] as { saga_id: string }[] }),
    user ? getCurrentUserRole(supabase) : Promise.resolve(null),
  ]);

  return {
    cards: buildSagaIndex(sagasRes.data ?? [], itemsRes.data ?? [], query),
    followedIds: new Set((followsRes.data ?? []).map((f) => f.saga_id)),
    isAuthenticated: user !== null,
    viewerRole,
  };
}
