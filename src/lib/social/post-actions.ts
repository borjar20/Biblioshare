"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidateFeed } from "@/lib/reactivity/revalidate";
import type { AnchorType, AnchorRef } from "@/lib/catalog/anchor";
import { notifyMentions } from "./notify-mentions";
import { searchAnchors } from "./anchor-search";
import type { PostKind } from "./post-kinds";

// La lista vive en post-kinds.ts (sin deps server-only) para que la puedan leer
// notify-categories.ts y la campana. Se reexporta para no romper a quien ya
// importa el tipo de aquí (autopost.ts).
export type { PostKind };

export type CreatePostInput = {
  kind: PostKind;
  anchorType: AnchorType;
  anchorId: string;
  sourceKind?: "pass" | "progress_session" | "episode_watch";
  sourceId?: string;
  body?: string; // requerido solo si kind==="thought"; opcional (null) en hitos
  isSpoiler?: boolean;
};

export type CreatePostResult = { ok: true; id: string } | { ok: false; error: string };

// Tabla de catálogo que resuelve cada tipo de ancla (20260844_posts.sql):
// `anchor_id` es polimórfico y NO tiene FK SQL, así que la integridad la
// garantiza esta función resolviendo la fila ANTES de insertar.
const ANCHOR_TABLE: Record<AnchorType, "books" | "movies" | "series" | "sagas" | "people"> = {
  book: "books",
  movie: "movies",
  series: "series",
  saga: "sagas",
  person: "people",
};

// `createPost` generaliza `createThought` a la entidad social canónica `posts`
// (kind = thought | hitos de pase). Resultado discriminado, NUNCA lanza un valor
// que el cliente lea -- Next.js borra `.message` de los errores lanzados desde
// server actions al compilar producción, así que un `throw` dejaría al cliente
// sin distinguir "sin sesión" de "servidor caído". Cualquier fallo inesperado
// cae en el catch de fuera y vuelve como "unknown".
export async function createPost(input: CreatePostInput): Promise<CreatePostResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "unauthenticated" };

    // body obligatorio SOLO para 'thought'; en los hitos es opcional (null).
    const rawBody = input.body ?? "";
    const trimmed = rawBody.trim();
    if (input.kind === "thought" && !trimmed) return { ok: false, error: "empty" };
    if (rawBody.length > 2000) return { ok: false, error: "too_long" };
    const body = trimmed.length > 0 ? trimmed : null;

    const { data: anchorRow, error: anchorError } = await supabase
      .from(ANCHOR_TABLE[input.anchorType])
      .select("id")
      .eq("id", input.anchorId)
      .maybeSingle();
    if (anchorError) throw anchorError;
    if (!anchorRow) return { ok: false, error: "anchor_not_found" };

    // Cliente de SESIÓN (no service-role): la RLS `posts insert own`
    // (`auth.uid() = author_id`) es quien de verdad impide suplantar autoría.
    const { data: inserted, error: insertError } = await supabase
      .from("posts")
      .insert({
        author_id: user.id,
        kind: input.kind,
        anchor_type: input.anchorType,
        anchor_id: input.anchorId,
        source_kind: input.sourceKind ?? null,
        source_id: input.sourceId ?? null,
        body,
        is_spoiler: input.isSpoiler ?? false,
      })
      .select("id")
      .single();
    if (insertError) throw insertError;

    // Menciones @usuario, best-effort: resuelve el target canónico ('post',
    // materializado por el trigger de 20260844) y delega en notifyMentions. Solo
    // si hay body -- sin cuerpo no hay nada que escanear. Un fallo aquí nunca
    // debe deshacer el post ya publicado.
    if (body) {
      try {
        const { data: target } = await supabase
          .from("interaction_targets")
          .select("id")
          .eq("kind", "post")
          .eq("source_id", inserted.id)
          .maybeSingle();
        if (target) {
          await notifyMentions(supabase, {
            authorId: user.id,
            text: body,
            interactionTargetId: target.id,
          });
        }
      } catch (mentionError) {
        console.error("createPost: notifyMentions failed", mentionError);
      }
    }

    revalidateFeed();
    return { ok: true, id: inserted.id };
  } catch (error) {
    console.error("createPost failed", error);
    return { ok: false, error: "unknown" };
  }
}

export type DeletePostResult = { ok: true } | { ok: false; error: string };

// Espejo de `deleteThought`: autor o admin global vía la RLS
// `posts delete own or moderate` (private.can_moderate_target). Cliente de
// SESIÓN, nunca service-role -- es la RLS quien decide si la fila se borra;
// `.select("id")` tras el delete distingue "0 filas" (bloqueado por RLS o ya no
// existe -- no hace falta distinguirlas) de un borrado real.
export async function deletePost(postId: string): Promise<DeletePostResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "unauthenticated" };

    const { data, error } = await supabase
      .from("posts")
      .delete()
      .eq("id", postId)
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) return { ok: false, error: "not_allowed_or_missing" };

    revalidateFeed();
    return { ok: true };
  } catch (error) {
    console.error("deletePost failed", error);
    return { ok: false, error: "unknown" };
  }
}

// Wrapper fino para el cliente (compositor de post): el compositor no puede
// llamar a searchAnchors directamente (necesita un SupabaseServerClient de
// sesión), así que esta acción resuelve el viewer y delega. Sin sesión, lista
// vacía en vez de error -- el autocompletar simplemente no encuentra nada.
export async function searchAnchorsAction(query: string): Promise<AnchorRef[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  return searchAnchors(supabase, user.id, query);
}
