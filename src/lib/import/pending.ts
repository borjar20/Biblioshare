import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { ImportCandidate, ImportRow } from "./types";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type PendingImportRow = {
  id: string;
  itemType: ItemType;
  row: ImportRow;
  status: "pending" | "resolved" | "dismissed";
  createdAt: string;
  // Solo en la cola de revisión (colaborador): nombre del dueño de la fila.
  ownerName?: string | null;
  // Candidatos que el matcher encontró para una fila ambigua, persistidos en el
  // payload en el import de onboarding (issue #390). Vacío/ausente en filas sin
  // match. El colaborador elige uno en vez de teclear los datos a mano.
  candidates?: ImportCandidate[];
};

// El payload es un ImportRow con, opcionalmente, los candidatos de una fila
// ambigua incrustados (los readers históricos lo tratan como ImportRow y la
// clave extra les da igual). Se separan al leer.
function splitPayload(payload: unknown): {
  row: ImportRow;
  candidates?: ImportCandidate[];
} {
  const { candidates, ...row } = (payload ?? {}) as ImportRow & {
    candidates?: ImportCandidate[];
  };
  return { row: row as ImportRow, candidates };
}

// Filas pendientes/resueltas del propio usuario (su bandeja de import).
export async function getMyPendingRows(
  supabase: SupabaseServerClient,
  userId: string
): Promise<PendingImportRow[]> {
  const { data } = await supabase
    .from("pending_import_rows")
    .select("id, item_type, payload, status, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  return (data ?? []).map((r) => {
    const { row, candidates } = splitPayload(r.payload);
    return {
      id: r.id,
      itemType: r.item_type,
      row,
      candidates,
      status: r.status,
      createdAt: r.created_at,
    };
  });
}

// Cola global de filas pendientes para colaboradores (RLS lo restringe a
// collaborator+). Incluye el nombre del dueño para dar contexto al revisor.
export async function getReviewQueue(
  supabase: SupabaseServerClient
): Promise<PendingImportRow[]> {
  const { data } = await supabase
    .from("pending_import_rows")
    .select("id, user_id, item_type, payload, status, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (!data || data.length === 0) return [];

  const userIds = [...new Set(data.map((r) => r.user_id))];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("user_id, username, display_name")
    .in("user_id", userIds);
  const nameByUser = new Map(
    (profiles ?? []).map((p) => [p.user_id, p.display_name || p.username])
  );

  return data.map((r) => {
    const { row, candidates } = splitPayload(r.payload);
    return {
      id: r.id,
      itemType: r.item_type,
      row,
      candidates,
      status: r.status,
      createdAt: r.created_at,
      ownerName: nameByUser.get(r.user_id) ?? null,
    };
  });
}

// Recuento de pendientes del usuario (para el badge en /importar).
export async function countMyPending(
  supabase: SupabaseServerClient,
  userId: string
): Promise<number> {
  const { count } = await supabase
    .from("pending_import_rows")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "pending");
  return count ?? 0;
}
