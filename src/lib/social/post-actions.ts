"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { revalidateFeed } from "@/lib/reactivity/revalidate";
import { deleteVoiceNote } from "@/lib/storage/voice-notes";
import type { AnchorType, AnchorRef } from "@/lib/catalog/anchor";
import { notifyMentions } from "./notify-mentions";
import { notifyFollowersOfPost } from "./notify-followers";
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

    // Resuelve el ancla Y su título en la MISMA consulta que ya hacía falta
    // para comprobar que existe -- no es una consulta nueva. El título es lo
    // que permite rellenar `subject` en el aviso a seguidores (spec: la única
    // excepción autorizada a "no consultes en el camino de notificar", porque
    // interaction_targets no guarda ningún título y esto corre UNA vez al
    // publicar, no por destinatario). Libros/películas/series lo guardan en
    // `title`; sagas y personas, en `name` -- mismo criterio que feed.ts al
    // montar las tarjetas del muro.
    //
    // La tabla se nombra literal en cada `case` (en vez de un Record
    // AnchorType -> tabla, como antes): un Record da el MISMO tipo de valor a
    // toda clave, así que indexarlo con un anchorType ya estrechado no
    // estrecha el resultado para tsc, que no podría validar que `name`/
    // `title` existen de verdad en esa tabla concreta. El `switch`
    // exhaustivo (un `case` por AnchorType, con `default` inalcanzable
    // asegurado por `never`) es lo que recupera esa validación: si algún día
    // se añade un sexto AnchorType sin su `case`, esto deja de compilar en
    // vez de caer en silencio en la tabla equivocada.
    let anchorFound = false;
    let subject: string | undefined;
    switch (input.anchorType) {
      case "book": {
        const { data, error } = await supabase
          .from("books")
          .select("id, title")
          .eq("id", input.anchorId)
          .maybeSingle();
        if (error) throw error;
        anchorFound = Boolean(data);
        subject = data?.title ?? undefined;
        break;
      }
      case "movie": {
        const { data, error } = await supabase
          .from("movies")
          .select("id, title")
          .eq("id", input.anchorId)
          .maybeSingle();
        if (error) throw error;
        anchorFound = Boolean(data);
        subject = data?.title ?? undefined;
        break;
      }
      case "series": {
        const { data, error } = await supabase
          .from("series")
          .select("id, title")
          .eq("id", input.anchorId)
          .maybeSingle();
        if (error) throw error;
        anchorFound = Boolean(data);
        subject = data?.title ?? undefined;
        break;
      }
      case "saga": {
        const { data, error } = await supabase
          .from("sagas")
          .select("id, name")
          .eq("id", input.anchorId)
          .maybeSingle();
        if (error) throw error;
        anchorFound = Boolean(data);
        subject = data?.name ?? undefined;
        break;
      }
      case "person": {
        const { data, error } = await supabase
          .from("people")
          .select("id, name")
          .eq("id", input.anchorId)
          .maybeSingle();
        if (error) throw error;
        anchorFound = Boolean(data);
        subject = data?.name ?? undefined;
        break;
      }
      default: {
        const _exhaustive: never = input.anchorType;
        throw new Error(`createPost: anchorType sin resolver: ${String(_exhaustive)}`);
      }
    }
    if (!anchorFound) return { ok: false, error: "anchor_not_found" };

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

    // El target canónico del post ('post', materializado por el trigger de
    // 20260844_posts.sql) se resuelve SIEMPRE, no solo cuando hay cuerpo: lo
    // necesitan las menciones (que sí requieren cuerpo) y el aviso a seguidores
    // (que no — un post de hito no lleva texto).
    let interactionTargetId: string | null = null;
    try {
      const { data: target, error: targetError } = await supabase
        .from("interaction_targets")
        .select("id")
        .eq("kind", "post")
        .eq("source_id", inserted.id)
        .maybeSingle();
      if (targetError) {
        // supabase-js RESUELVE con `error` en vez de lanzar: sin este check, un
        // fallo de RLS o un trigger que no llegó a escribir la fila se leía como
        // "sin target" (null) y no dejaba ni rastro en el log.
        console.error("createPost: interaction_target lookup failed (query error)", targetError);
      }
      interactionTargetId = target?.id ?? null;
    } catch (targetError) {
      // Aquí solo cae un error LANZADO (p. ej. red caída antes de resolver la
      // promesa) -- el fallo de query normal ya se registra arriba.
      console.error("createPost: interaction_target lookup failed (thrown)", targetError);
    }

    // Menciones @usuario, best-effort. Un fallo aquí nunca debe deshacer el post
    // ya publicado.
    if (body && interactionTargetId) {
      try {
        await notifyMentions(supabase, {
          authorId: user.id,
          text: body,
          interactionTargetId,
          // Un pensamiento SÍ trae su propia marca de spoiler (input.isSpoiler,
          // el mismo botón del compositor que fija is_spoiler al insertar el
          // post) -- se reutiliza, no se inventa una consulta para tenerla.
          isSpoiler: input.isSpoiler,
        });
      } catch (mentionError) {
        console.error("createPost: notifyMentions failed", mentionError);
      }
    }

    // Aviso a los seguidores suscritos a la categoría de este post. Este es EL
    // punto de disparo de los avisos followed_* (spec 2026-08-13): createPost es
    // el único sitio que inserta en `posts`, así que el aviso no puede volver a
    // emitirse antes de que exista el post al que apunta.
    //
    // Sin target no se avisa: no debería pasar (lo escribe un trigger AFTER
    // INSERT en la misma transacción), y si pasa, un aviso sin destino es peor
    // que ninguno. Misma postura que las menciones.
    if (interactionTargetId) {
      try {
        await notifyFollowersOfPost(supabase, user.id, {
          postId: inserted.id,
          kind: input.kind,
          interactionTargetId,
          subject,
        });
      } catch (notifyError) {
        console.error("createPost: notifyFollowersOfPost failed", notifyError);
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

    // Recupera los audio_path de TODOS los comentarios colgados de este post
    // ANTES de borrarlo -- la cascada de Postgres se lleva la fila de
    // `comments` pero no el objeto de Storage (mismo motivo que deleteComment
    // en interaction-actions.ts), y tras el delete el interaction_target del
    // post ya no resuelve para poder filtrar. Los comentarios anidados
    // (respuestas) cuelgan del MISMO interaction_target que la raíz -- un
    // solo SELECT los trae a todos. Service-role: esto es limpieza de
    // sistema, no una lectura que la RLS del viewer deba decidir.
    const serviceRole = createServiceRoleClient();
    let audioPaths: string[] = [];
    try {
      const { data: target, error: targetError } = await serviceRole
        .from("interaction_targets")
        .select("id")
        .eq("kind", "post")
        .eq("source_id", postId)
        .maybeSingle();
      if (targetError) throw targetError;
      if (target) {
        const { data: comments, error: commentsError } = await serviceRole
          .from("comments")
          .select("audio_path")
          .eq("interaction_target_id", target.id)
          .not("audio_path", "is", null);
        if (commentsError) throw commentsError;
        audioPaths = (comments ?? [])
          .map((c) => c.audio_path)
          .filter((path): path is string => path != null);
      }
    } catch (lookupError) {
      // Best-effort: un fallo aquí no debe impedir borrar el post. Deja
      // objetos huérfanos en el peor caso (ver issue de barrido periódico),
      // nunca bloquea al usuario.
      console.error("deletePost: audio_path lookup failed", lookupError);
    }

    const { data, error } = await supabase
      .from("posts")
      .delete()
      .eq("id", postId)
      .select("id");
    if (error) throw error;
    if (!data || data.length === 0) return { ok: false, error: "not_allowed_or_missing" };

    for (const path of audioPaths) {
      await deleteVoiceNote(path);
    }

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
