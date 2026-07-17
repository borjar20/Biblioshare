import type { createClient } from "@/lib/supabase/server";
import { parsePosition } from "@/lib/library/position";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type PaceRow = {
  pass_id: string;
  session_date: string;
  position: unknown;
};

// Cálculo puro (testable) de páginas/día de media: suma de los avances de página
// positivos (por pase, cada relectura arranca su cursor en 0 — §Tarea 9 hub) /
// los días distintos en que leíste. null si no hay avances medibles.
export function computePagesPerDay(rows: PaceRow[]): number | null {
  const byPass = new Map<string, PaceRow[]>();
  for (const row of rows) {
    const list = byPass.get(row.pass_id) ?? [];
    list.push(row);
    byPass.set(row.pass_id, list);
  }

  let totalPages = 0;
  const readingDays = new Set<string>();
  for (const sessions of byPass.values()) {
    sessions.sort((a, b) => a.session_date.localeCompare(b.session_date));
    let lastPage: number | null = null;
    for (const session of sessions) {
      const position = parsePosition("book", session.position);
      const page = "page" in position ? position.page : undefined;
      if (page !== undefined && lastPage !== null && page > lastPage) {
        totalPages += page - lastPage;
        readingDays.add(session.session_date);
      }
      if (page !== undefined) lastPage = page;
    }
  }

  if (readingDays.size === 0) return null;
  return Math.round(totalPages / readingDays.size);
}

// Páginas/día de media (frame B/G): "34 pág/día". Solo libros — las series se
// miden en episodios. Ver docs/REQUIREMENTS.md §7.14.
export async function getPagesPerDay(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<number | null> {
  const { data, error } = await supabase
    .from("progress_sessions")
    .select("pass_id, session_date, position, passes!inner(item_type)")
    .eq("user_id", userId)
    .eq("passes.item_type", "book");

  if (error) throw error;
  return computePagesPerDay((data ?? []) as PaceRow[]);
}
