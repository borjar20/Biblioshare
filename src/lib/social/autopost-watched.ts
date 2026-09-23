import type { createClient } from "@/lib/supabase/server";
import { createPost } from "./post-actions";
import { DEFAULT_POST_PREFERENCES } from "./post-preferences";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// El avance en una serie llega al feed como UN post `watched` por serie y día
// (fase 4 del rediseño de series, decisión del 2026-09-23). Antes solo llegaba
// si se registraba desde /sesion marcando «Compartir», y los episodios marcados
// desde la ficha no salían nunca.
//
// Por qué uno por día y no uno por episodio: «Marcar los 12 que faltan» serían
// 12 posts y 12 avisos a cada seguidor. El post cuelga (`source_kind =
// 'episode_watch'`) del PRIMER episodio marcado ese día; el feed cuenta cuántos
// más hay en el mismo día al pintarlo (feed.ts), así que el post no se reescribe
// al marcar el segundo, el tercero…
//
// Si se desmarca justo el episodio del que cuelga, la limpieza por fuente
// (`episode_watches_cleanup_source_posts`) se lleva el post; el siguiente
// episodio que se marque ese día lo vuelve a crear, colgado de él. No se
// re-ancla al desmarcar porque eso emitiría un segundo aviso a los seguidores.
//
// Best-effort: NUNCA lanza (un post que no sale no debe tumbar la marca de
// «visto» que el usuario sí pidió). La idempotencia ante doble clic la da el
// índice único de posts (source_kind, source_id, kind).
export async function maybeAutopostWatchedDay(
  supabase: SupabaseServerClient,
  input: { userId: string; seriesId: string; day: string },
): Promise<void> {
  try {
    const { data: prefs } = await supabase
      .from("post_preferences")
      .select("autopost_watched")
      .eq("user_id", input.userId)
      .maybeSingle();
    const enabled = prefs?.autopost_watched ?? DEFAULT_POST_PREFERENCES.autopost_watched;
    if (!enabled) return;

    const { data: watches, error } = await supabase
      .from("episode_watches")
      .select("id")
      .eq("user_id", input.userId)
      .eq("series_id", input.seriesId)
      .eq("watched_on", input.day)
      .order("created_at", { ascending: true });
    if (error) throw error;
    const ids = (watches ?? []).map((w) => w.id);
    if (ids.length === 0) return;

    const { data: existing, error: postError } = await supabase
      .from("posts")
      .select("id")
      .eq("author_id", input.userId)
      .eq("kind", "watched")
      .eq("source_kind", "episode_watch")
      .in("source_id", ids)
      .limit(1);
    if (postError) throw postError;
    if ((existing ?? []).length > 0) return;

    await createPost({
      kind: "watched",
      anchorType: "series",
      anchorId: input.seriesId,
      sourceKind: "episode_watch",
      sourceId: ids[0],
    });
  } catch (error) {
    console.error("maybeAutopostWatchedDay failed", error);
  }
}
