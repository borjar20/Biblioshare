import type { ItemType } from "@/lib/catalog/types";
import { getCurrentUser, type createClient } from "@/lib/supabase/server";
import { deriveFriends, type FriendIdentity, type FriendOnSaga, type FriendPass, type FriendsInput } from "./friends";
import type { SagaDetail } from "./get-saga-detail";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Lectura de «Entre amigos» (fase 3). Depende de la sesión: sin `use cache`
// (regla #437) y se monta detrás de <Suspense>. Qué pases ve el que mira lo
// decide RLS (can_view_profile): no se filtra a mano por perfil público o
// privado; lo que la base no devuelve no aparece.
export async function getSagaFriends(
  supabase: SupabaseServerClient,
  detail: SagaDetail,
  order: FriendsInput["order"],
): Promise<FriendOnSaga[]> {
  if (!detail.isAuthenticated) return [];
  const user = await getCurrentUser();
  if (!user) return [];

  const { data: follows, error: followsError } = await supabase
    .from("follows")
    .select("followee_id")
    .eq("follower_id", user.id)
    .eq("status", "accepted");
  if (followsError) throw followsError;
  const followees = [...new Set((follows ?? []).map((f) => f.followee_id))];
  if (followees.length === 0) return [];

  const idsByType: Record<ItemType, Set<string>> = { book: new Set(), movie: new Set(), series: new Set() };
  for (const m of detail.groups.flatMap((g) => g.members)) idsByType[m.itemType].add(m.itemId);

  const passes: FriendPass[] = [];
  await Promise.all(
    (Object.keys(idsByType) as ItemType[]).map(async (type) => {
      if (idsByType[type].size === 0) return;
      const { data, error } = await supabase
        .from("passes")
        .select("user_id, item_id, status, is_active, rating, started_on, finished_on, created_at")
        .in("user_id", followees)
        .eq("item_type", type)
        .in("item_id", [...idsByType[type]]);
      if (error) throw error;
      for (const r of data ?? []) {
        passes.push({
          userId: r.user_id,
          itemKey: `${type}:${r.item_id}`,
          status: r.status,
          isActive: r.is_active,
          rating: r.rating,
          startedOn: r.started_on,
          finishedOn: r.finished_on,
          createdAt: r.created_at,
        });
      }
    }),
  );
  if (passes.length === 0) return [];

  const userIds = [...new Set(passes.map((p) => p.userId))];
  const { data: rows, error: identitiesError } = await supabase
    .from("profile_identities")
    .select("user_id, username, display_name, avatar_url")
    .in("user_id", userIds);
  if (identitiesError) throw identitiesError;
  // profile_identities es una vista (columnas nullable en los tipos): se
  // descartan filas sin user_id o username, como resolveUsers.
  const identities: FriendIdentity[] = (rows ?? []).flatMap((p) =>
    p.user_id != null && p.username != null
      ? [{ userId: p.user_id, username: p.username, displayName: p.display_name, avatarUrl: p.avatar_url }]
      : [],
  );

  return deriveFriends({ passes, identities, order });
}
