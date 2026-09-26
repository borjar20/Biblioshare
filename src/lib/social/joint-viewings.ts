import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { UNTITLED_FALLBACK } from "@/lib/catalog/untitled";

// Lecturas de los visionados conjuntos (#1220). La escritura va por las
// funciones SQL (`create_joint_viewing`, `respond_joint_viewing`,
// `leave_joint_viewing`) desde `joint-viewing-actions.ts`; aquí solo se lee, y
// SIEMPRE con el cliente de la petición: lo que se ve depende de quién mira
// (RLS), así que nada de esto se cachea (regla #437).

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type JointMemberStatus = "invited" | "accepted" | "declined";

export type JointPerson = {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
};

export type JointMember = JointPerson & { status: JointMemberStatus; passId: string | null };

// Resuelve identidades en UN viaje, conservando el orden de entrada y
// descartando las que no resuelven (mismo patrón que follows.ts).
export async function resolvePeople(
  supabase: SupabaseServerClient,
  userIds: string[],
): Promise<Map<string, JointPerson>> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase
    .from("profile_identities")
    .select("user_id, username, display_name, avatar_url")
    .in("user_id", ids);
  if (error) throw error;
  const byId = new Map<string, JointPerson>();
  for (const p of data ?? []) {
    if (!p.user_id || !p.username) continue;
    byId.set(p.user_id, {
      userId: p.user_id,
      username: p.username,
      displayName: p.display_name,
      avatarUrl: p.avatar_url,
    });
  }
  return byId;
}

// Seguidos mutuos de `userId`: los únicos a los que se puede etiquetar. Es solo
// el selector; la regla la vuelve a comprobar `create_joint_viewing` en la base.
export async function getMutualFollows(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<JointPerson[]> {
  const [following, followers] = await Promise.all([
    supabase.from("follows").select("followee_id").eq("follower_id", userId).eq("status", "accepted"),
    supabase.from("follows").select("follower_id").eq("followee_id", userId).eq("status", "accepted"),
  ]);
  if (following.error) throw following.error;
  if (followers.error) throw followers.error;
  const followerIds = new Set((followers.data ?? []).map((r) => r.follower_id));
  const mutualIds = (following.data ?? []).map((r) => r.followee_id).filter((id) => followerIds.has(id));
  const people = await resolvePeople(supabase, mutualIds);
  return [...people.values()].sort((a, b) =>
    (a.displayName ?? a.username).localeCompare(b.displayName ?? b.username, "es"),
  );
}

export type PassJointViewing = {
  viewingId: string;
  isCreator: boolean;
  // Los demás miembros visibles (sin quien mira), con su estado.
  others: JointMember[];
};

// Visionado conjunto de cada pase propio, para el diario de la ficha. Solo pases
// de quien mira: la RLS le deja ver todas las filas de sus visionados.
export async function getJointViewingsForPasses(
  supabase: SupabaseServerClient,
  viewerId: string,
  passIds: string[],
): Promise<Map<string, PassJointViewing>> {
  const result = new Map<string, PassJointViewing>();
  if (passIds.length === 0) return result;

  const { data: own, error: ownError } = await supabase
    .from("joint_viewing_members")
    .select("viewing_id, pass_id")
    .eq("user_id", viewerId)
    .in("pass_id", passIds);
  if (ownError) throw ownError;
  if (!own || own.length === 0) return result;

  const viewingIds = own.map((r) => r.viewing_id);
  const [{ data: members, error: membersError }, { data: viewings, error: viewingsError }] = await Promise.all([
    supabase
      .from("joint_viewing_members")
      .select("viewing_id, user_id, status, pass_id")
      .in("viewing_id", viewingIds)
      .neq("user_id", viewerId),
    supabase.from("joint_viewings").select("id, created_by").in("id", viewingIds),
  ]);
  if (membersError) throw membersError;
  if (viewingsError) throw viewingsError;

  const people = await resolvePeople(supabase, (members ?? []).map((m) => m.user_id));
  const creatorById = new Map((viewings ?? []).map((v) => [v.id, v.created_by]));

  for (const row of own) {
    if (!row.pass_id) continue;
    const others: JointMember[] = [];
    for (const m of members ?? []) {
      if (m.viewing_id !== row.viewing_id) continue;
      const person = people.get(m.user_id);
      if (!person) continue;
      others.push({ ...person, status: m.status as JointMemberStatus, passId: m.pass_id });
    }
    result.set(row.pass_id, {
      viewingId: row.viewing_id,
      isCreator: creatorById.get(row.viewing_id) === viewerId,
      others,
    });
  }
  return result;
}

export type JointViewingPage = {
  id: string;
  itemType: ItemType;
  itemId: string;
  itemTitle: string;
  itemCoverUrl: string | null;
  watchedOn: string | null;
  createdBy: JointPerson | null;
  members: JointMember[];
  viewerStatus: JointMemberStatus | null;
  // Pases completados de quien mira sobre la obra que aún no están en ningún
  // visionado: entre ellos elige cuál enlazar al aceptar.
  linkablePasses: { id: string; finishedOn: string | null }[];
};

// La página `/juntos/[id]`: la invitación y quién está. `null` = no existe o
// quien mira no puede verla (la RLS no distingue, y está bien que no lo haga).
export async function getJointViewingPage(
  supabase: SupabaseServerClient,
  viewerId: string,
  viewingId: string,
): Promise<JointViewingPage | null> {
  const { data: viewing, error } = await supabase
    .from("joint_viewings")
    .select("id, item_type, item_id, watched_on, created_by")
    .eq("id", viewingId)
    .maybeSingle();
  if (error) throw error;
  if (!viewing) return null;

  const itemType = viewing.item_type as ItemType;
  const table = itemType === "book" ? "books" : itemType === "movie" ? "movies" : "series";
  const [{ data: members, error: membersError }, { data: item, error: itemError }, { data: passes, error: passesError }] =
    await Promise.all([
      supabase
        .from("joint_viewing_members")
        .select("user_id, status, pass_id, invited_at")
        .eq("viewing_id", viewingId)
        .order("invited_at", { ascending: true }),
      supabase.from(table).select("title, cover_url").eq("id", viewing.item_id).maybeSingle(),
      supabase
        .from("passes")
        .select("id, finished_on, created_at")
        .eq("user_id", viewerId)
        .eq("item_type", itemType)
        .eq("item_id", viewing.item_id)
        .eq("status", "completed")
        .order("finished_on", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false }),
    ]);
  if (membersError) throw membersError;
  if (itemError) throw itemError;
  if (passesError) throw passesError;

  const passIds = (passes ?? []).map((p) => p.id);
  const { data: linked, error: linkedError } = passIds.length
    ? await supabase.from("joint_viewing_members").select("pass_id").in("pass_id", passIds)
    : { data: [] as { pass_id: string | null }[], error: null };
  if (linkedError) throw linkedError;
  const linkedIds = new Set((linked ?? []).map((l) => l.pass_id));

  const people = await resolvePeople(supabase, [viewing.created_by, ...(members ?? []).map((m) => m.user_id)]);
  const memberList: JointMember[] = [];
  for (const m of members ?? []) {
    const person = people.get(m.user_id);
    if (person) memberList.push({ ...person, status: m.status as JointMemberStatus, passId: m.pass_id });
  }

  return {
    id: viewing.id,
    itemType,
    itemId: viewing.item_id,
    itemTitle: item?.title ?? UNTITLED_FALLBACK,
    itemCoverUrl: item?.cover_url ?? null,
    watchedOn: viewing.watched_on,
    createdBy: people.get(viewing.created_by) ?? null,
    members: memberList,
    viewerStatus: ((members ?? []).find((m) => m.user_id === viewerId)?.status as JointMemberStatus | undefined) ?? null,
    linkablePasses: (passes ?? [])
      .filter((p) => !linkedIds.has(p.id))
      .map((p) => ({ id: p.id, finishedOn: p.finished_on })),
  };
}
