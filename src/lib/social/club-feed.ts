import type { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

// La quinta fuente del feed (plan 01, P1): la actividad de TUS clubes.
//
// Ojo a la asimetría con las otras cuatro: aquellas miran a quién SIGUES, esta
// mira de qué eres MIEMBRO. Son dos círculos distintos a propósito — la gente
// no sigue a sus clubes, se apunta.
//
// Las actividades no tienen reacciones ni comentarios (los targets de
// interacción son diary_entry, episode_watch, club_post y activity_checkpoint),
// así que la tarjeta enseña "N se apuntan" y nada más — que es justo lo que
// decidió P1.

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type ActivityKind = Database["public"]["Enums"]["activity_kind"];
export type ActivityStatus = Database["public"]["Enums"]["activity_status"];

export type ClubFeedEvent = {
  id: string; // `club_activities:${rowId}`
  activityId: string;
  clubId: string;
  clubName: string;
  clubSlug: string;
  clubCoverUrl: string | null;
  kind: ActivityKind;
  status: ActivityStatus;
  title: string;
  description: string | null;
  proposerUsername: string | null;
  proposerDisplayName: string | null;
  participantCount: number;
  eventDate: string; // created_at
};

export type ClubFeedResult = {
  events: ClubFeedEvent[];
  /** Filas brutas devueltas por la query, para el cálculo de "fuente agotada". */
  rowCount: number;
};

export async function getClubActivityEvents(
  supabase: SupabaseServerClient,
  viewerId: string,
  options: { cursorUpperBound?: string; pageSize: number },
): Promise<ClubFeedResult> {
  const { data: memberRows, error: memberError } = await supabase
    .from("club_members")
    .select("club_id")
    .eq("user_id", viewerId)
    .eq("status", "active");
  if (memberError) throw memberError;

  const clubIds = (memberRows ?? []).map((r) => r.club_id);
  if (clubIds.length === 0) return { events: [], rowCount: 0 };

  // Solo lo que sigue vivo: una actividad terminada o archivada no es novedad.
  // Los eventos (kind='evento') se excluyen aparte: comparten status='active'
  // con el resto, pero no tienen página propia -- este feed construye su
  // propio <Link> a /club/[slug]/actividad/[id] (ClubFeedCard), que da 404
  // para un evento. Mismo filtro que ya aplica club-summary.tsx.
  let query = supabase
    .from("club_activities")
    .select("id, club_id, kind, status, title, description, created_by, created_at")
    .in("club_id", clubIds)
    .in("status", ["proposed", "active"])
    .neq("kind", "evento")
    .order("created_at", { ascending: false })
    .limit(options.pageSize);
  if (options.cursorUpperBound) query = query.lte("created_at", options.cursorUpperBound);

  const { data: activityRows, error: activityError } = await query;
  if (activityError) throw activityError;

  const rows = activityRows ?? [];
  if (rows.length === 0) return { events: [], rowCount: 0 };

  const activityIds = rows.map((r) => r.id);
  const proposerIds = [...new Set(rows.map((r) => r.created_by))];
  const activityClubIds = [...new Set(rows.map((r) => r.club_id))];

  const [participants, clubs, proposers] = await Promise.all([
    supabase
      .from("club_activity_participants")
      .select("activity_id")
      .in("activity_id", activityIds),
    supabase.from("clubs").select("id, name, slug, cover_url").in("id", activityClubIds),
    supabase
      .from("profile_identities")
      .select("user_id, username, display_name")
      .in("user_id", proposerIds),
  ]);
  if (participants.error) throw participants.error;
  if (clubs.error) throw clubs.error;
  if (proposers.error) throw proposers.error;

  const countByActivity = new Map<string, number>();
  for (const p of participants.data ?? [])
    countByActivity.set(p.activity_id, (countByActivity.get(p.activity_id) ?? 0) + 1);

  const clubById = new Map((clubs.data ?? []).map((c) => [c.id, c]));
  const proposerById = new Map(
    (proposers.data ?? [])
      .filter((p): p is typeof p & { user_id: string } => p.user_id != null)
      .map((p) => [p.user_id, p]),
  );

  const events: ClubFeedEvent[] = [];
  for (const r of rows) {
    const club = clubById.get(r.club_id);
    if (!club) continue;
    const proposer = proposerById.get(r.created_by);
    events.push({
      id: `club_activities:${r.id}`,
      activityId: r.id,
      clubId: r.club_id,
      clubName: club.name,
      clubSlug: club.slug,
      clubCoverUrl: club.cover_url,
      kind: r.kind,
      status: r.status,
      title: r.title,
      description: r.description,
      proposerUsername: proposer?.username ?? null,
      proposerDisplayName: proposer?.display_name ?? null,
      participantCount: countByActivity.get(r.id) ?? 0,
      eventDate: r.created_at,
    });
  }

  return { events, rowCount: rows.length };
}
