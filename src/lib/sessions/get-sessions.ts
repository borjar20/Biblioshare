import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { parsePosition } from "@/lib/library/position";
import type { ProgressSession } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Las sesiones son del PASE, no de la entrada: una entrada puede acumular
// varias relecturas y cada una puede ir contra una edición distinta (el caso
// que motivó esto — ver docs de la rama). Filtrar por library_entry_id
// mezclaba las sesiones de todos los pases de la entrada bajo la edición del
// pase abierto actual. passId null (no hay pase abierto) => sin sesiones que
// mostrar, no todas las históricas.
export async function getSessions(
  supabase: SupabaseServerClient,
  passId: string | null,
  itemType: ItemType
): Promise<ProgressSession[]> {
  if (!passId) return [];

  const { data, error } = await supabase
    .from("progress_sessions")
    // `note` NO se pide: el texto vive en la tabla `notes` y lo pinta «Mis notas
    // y citas». Leerlo también aquí era la duplicación de la issue #109.
    .select("id, session_date, duration_minutes, position, created_at")
    .eq("pass_id", passId)
    .order("session_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) throw error;

  const sessionIds = (data ?? []).map((row) => row.id);

  // Qué sesiones arrastran un post `progressed` propio (cleanup_source_posts,
  // 2026-09-22): borrarlas se lleva ese post y su hilo, así que session-list
  // necesita saberlo para confirmar antes. Consulta aparte porque `posts` no
  // tiene FK a `progress_sessions` (fuente polimórfica); con RLS el dueño solo
  // ve sus propios posts, así que esto nunca filtra los de otro. Se salta si
  // no hay sesiones que mirar.
  const postedSessionIds = new Set<string>();
  if (sessionIds.length > 0) {
    const { data: posts, error: postsError } = await supabase
      .from("posts")
      .select("source_id")
      .eq("source_kind", "progress_session")
      .in("source_id", sessionIds);

    if (postsError) throw postsError;

    for (const post of posts ?? []) {
      if (post.source_id) postedSessionIds.add(post.source_id);
    }
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    sessionDate: row.session_date,
    createdAt: row.created_at,
    durationMinutes: row.duration_minutes,
    position: parsePosition(itemType, row.position),
    hasPost: postedSessionIds.has(row.id),
  }));
}
