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

  return (data ?? []).map((row) => ({
    id: row.id,
    sessionDate: row.session_date,
    createdAt: row.created_at,
    durationMinutes: row.duration_minutes,
    position: parsePosition(itemType, row.position),
  }));
}
