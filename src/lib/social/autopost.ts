import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import type { MediaStatus } from "@/lib/library/types";
import { createPost, type PostKind } from "./post-actions";
import { DEFAULT_POST_PREFERENCES, type PostPreferences } from "./post-preferences";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Sin fila de post_preferences => defaults compartidos (fuente única con la UI
// de ajustes y con los DEFAULT de columna en 20260845_post_preferences.sql):
// terminar publica, empezar y abandonar no.
type PrefColumn = keyof PostPreferences;

// Mapea la transición a hito publicable. Solo estos tres: progressed/watched
// (share) son Spec 2. `started` no exige `closed`; `finished`/`dropped` sí, para
// no publicar en un cambio de estado que no cerró el pase.
function milestoneFor(
  to: MediaStatus,
  closed: boolean,
): { kind: PostKind; prefColumn: PrefColumn } | null {
  if (to === "in_progress") return { kind: "started", prefColumn: "autopost_started" };
  if (closed && to === "completed") return { kind: "finished", prefColumn: "autopost_finished" };
  if (closed && to === "dropped") return { kind: "dropped", prefColumn: "autopost_dropped" };
  return null;
}

// Publica un post de hito tras una transición, si el usuario no lo ha
// desactivado. Best-effort: NUNCA lanza (un hito que no se publica no debe
// tumbar el cambio de estado que el usuario sí pidió). La idempotencia ante
// doble-click la da el índice único de `posts`, no este código.
//
// Su ÚNICO llamador es la máquina de estados (`applyTransition`), y eso es
// deliberado (#824): mientras lo llamaba cada acción por su cuenta, los tres
// caminos que cierran un pase fuera de la ficha —auto-cierre por última página,
// Select de estado de la hoja de sesión, último episodio de una serie— se
// olvidaban de publicar y la reseña no llegaba al feed. Quien pase por la
// máquina sin querer publicar (alta, quick-add, bulk) pide `silent`. La regla
// vieja («nunca desde applyTransition, que corre en import/quick-add/bulk») se
// anuló porque su premisa era falsa: la importación no pasa por la máquina.
// Razonado en `docs/requirements/decisiones.md`.
//
// `created` viaja en la firma pero el mapeo no lo usa: un hito depende del
// estado destino y de si cerró, no de si insertó un pase nuevo.
export async function maybeAutopostMilestone(
  supabase: SupabaseServerClient,
  input: {
    userId: string;
    passId: string;
    itemType: ItemType;
    itemId: string;
    to: MediaStatus;
    created: boolean;
    closed: boolean;
  },
): Promise<void> {
  try {
    const milestone = milestoneFor(input.to, input.closed);
    if (!milestone) return;

    // maybeSingle: no hay fila para quien nunca tocó sus preferencias.
    const { data: prefs } = await supabase
      .from("post_preferences")
      .select("autopost_started, autopost_finished, autopost_dropped")
      .eq("user_id", input.userId)
      .maybeSingle();

    const enabled = (prefs ?? DEFAULT_POST_PREFERENCES)[milestone.prefColumn];
    if (!enabled) return;

    await createPost({
      kind: milestone.kind,
      anchorType: input.itemType,
      anchorId: input.itemId,
      sourceKind: "pass",
      sourceId: input.passId,
    });
  } catch (error) {
    console.error("maybeAutopostMilestone failed", error);
  }
}
