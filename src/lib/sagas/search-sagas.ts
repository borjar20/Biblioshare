"use server";

import { createClient } from "@/lib/supabase/server";

// Búsqueda de sagas por nombre para el selector (EPIC-05, Bloque H4). El catálogo de sagas
// es legible por cualquiera (misma RLS que books/movies/series), así que no hace falta gate
// propio -- a diferencia de crear/asignar sagas, que exige colaborador+ (§7.35).
export async function searchSagas(query: string): Promise<{ id: string; name: string }[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sagas")
    .select("id, name")
    .ilike("name", `%${trimmed}%`)
    .order("name")
    .limit(10);
  if (error) throw error;
  return data ?? [];
}
