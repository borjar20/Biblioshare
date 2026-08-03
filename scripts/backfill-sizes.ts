// Relleno de una vez de los tamaños del catálogo YA existente: duración de
// películas y nº de episodios / duración de episodio de series.
//
// Por qué hace falta además de la hidratación en la ficha: mover el punto de
// captura a `ensureItemEnriched` (#365) arregla el futuro, no el pasado. Las
// obras que ya están en catálogo solo se hidratarían cuando alguien abra su
// ficha, y hasta entonces la duración sigue nula para todos. Al 2026-08-03 en
// producción: 1 de 354 películas con duración y 0 de 26 series con episodios.
//
// Idempotente: solo toca filas con el dato a NULL, así que correrlo dos veces
// no reescribe nada. Respeta lo que un colaborador haya puesto a mano.
//
// Uso: npx tsx --env-file=.env.local scripts/backfill-sizes.ts
// (`tsx` NO está en devDependencies a propósito: se baja al vuelo con npx, como
// ya hacía scripts/backfill-genres.ts, para no cargar el repo con un runner que
// solo hace falta en trabajos puntuales.)
//
// Necesita TMDB_API_KEY y SUPABASE_SERVICE_ROLE_KEY del entorno que toque —
// ojo: .env.local apunta a DEV; para prod, exporta las suyas.
import { createClient } from "@supabase/supabase-js";
import { getMovieDetails, getSeriesDetails } from "../src/lib/catalog/tmdb";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(url, key);

// TMDB permite ~50 req/s; se va de uno en uno porque esto corre una vez y no
// hay ninguna prisa — más simple y sin riesgo de 429.
async function backfillMovies() {
  const { data, error } = await supabase
    .from("movies")
    .select("id, title, tmdb_id")
    .is("duration_minutes", null)
    .not("tmdb_id", "is", null);
  if (error) throw error;

  let updated = 0;
  let sinDato = 0;
  for (const row of data ?? []) {
    const details = await getMovieDetails(row.tmdb_id!);
    if (!details?.runtimeMinutes) {
      sinDato++;
      console.warn(`[movies] sin runtime en TMDB: ${row.title} (tmdb ${row.tmdb_id})`);
      continue;
    }
    const { error: upErr } = await supabase
      .from("movies")
      .update({ duration_minutes: details.runtimeMinutes })
      .eq("id", row.id);
    if (upErr) throw upErr;
    updated++;
  }
  console.log(`[movies] candidatas: ${data?.length ?? 0} | rellenadas: ${updated} | sin dato en TMDB: ${sinDato}`);
}

async function backfillSeries() {
  const { data, error } = await supabase
    .from("series")
    .select("id, title, tmdb_id, total_episodes, episode_runtime_minutes")
    .not("tmdb_id", "is", null);
  if (error) throw error;

  const pendientes = (data ?? []).filter(
    (r) => r.total_episodes === null || r.episode_runtime_minutes === null
  );

  let updated = 0;
  let sinDato = 0;
  for (const row of pendientes) {
    const details = await getSeriesDetails(row.tmdb_id!);
    if (!details) continue;

    // Recuento y duración de episodio son independientes: TMDB puede traer uno
    // sin el otro. Se escribe lo que haya en vez de descartar la respuesta.
    const patch = {
      ...(details.numberOfEpisodes && {
        total_episodes: details.numberOfEpisodes,
        total_seasons: details.numberOfSeasons,
      }),
      ...(details.episodeRuntimeMinutes && {
        episode_runtime_minutes: details.episodeRuntimeMinutes,
      }),
    };
    if (Object.keys(patch).length === 0) {
      sinDato++;
      console.warn(`[series] sin tamaños en TMDB: ${row.title} (tmdb ${row.tmdb_id})`);
      continue;
    }

    const { error: upErr } = await supabase.from("series").update(patch).eq("id", row.id);
    if (upErr) throw upErr;
    updated++;
  }
  console.log(`[series] candidatas: ${pendientes.length} | rellenadas: ${updated} | sin dato en TMDB: ${sinDato}`);
}

async function main() {
  await backfillMovies();
  await backfillSeries();
}
main().then(() => process.exit(0));
