// Recompute de una vez: traduce las labels es-ES crudas de TMDB guardadas en
// movies.genres / series.genres a labels canónicas. Idempotente: correrlo dos
// veces deja el mismo resultado (una label ya canónica que no esté en el puente
// es-ES se descartaría, así que SOLO se reescribe cuando el resultado no vacía la
// fila por accidente — ver el guard). Uso: node --env-file=.env.local + tsx.
import { createClient } from "@supabase/supabase-js";
import { resolveGenresFromEsLabels } from "../src/lib/catalog/tmdb-genres";
import { isCanonicalLabel } from "../src/lib/catalog/genre-vocab";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, key);

async function backfill(table: "movies" | "series") {
  const { data, error } = await supabase.from(table).select("id, genres");
  if (error) throw error;
  let updated = 0;
  for (const row of data ?? []) {
    const current: string[] = row.genres ?? [];
    if (current.length === 0) continue;
    // Ya canónico (p.ej. una fila re-hidratada tras el deploy del Task 3): no tocar.
    if (current.every(isCanonicalLabel)) continue;
    const next = resolveGenresFromEsLabels(current);
    // Guard: si el puente no reconoció NADA pero la fila tenía labels, no la
    // vaciamos a ciegas — se registra para revisión manual (posible label es-ES
    // no contemplada en el puente).
    if (next.length === 0) {
      console.warn(`[${table}] ${row.id}: labels sin mapear`, current);
      continue;
    }
    const { error: upErr } = await supabase
      .from(table)
      .update({ genres: next })
      .eq("id", row.id);
    if (upErr) throw upErr;
    updated++;
  }
  console.log(`[${table}] filas actualizadas: ${updated}`);
}

async function main() {
  await backfill("movies");
  await backfill("series");
}
main().then(() => process.exit(0));
