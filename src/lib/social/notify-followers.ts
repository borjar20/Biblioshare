import type { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { notifyMany } from "./notifications";
import { CATEGORY_FOR_POST_KIND, POST_KIND_NOTIFICATION_TYPE, type NotifyCategory } from "./notify-categories";
import { buildSubject } from "./notification-context";
import type { PostKind } from "./post-kinds";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Avisa a los seguidores ACEPTADOS de `authorId` que tienen activada la categoría
// de ESTE post. Se llama desde createPost, el único sitio que inserta en `posts`.
//
// Por qué desde ahí y no desde el hecho (sesión, cierre de pase): el aviso nace
// con su destino en la mano. La versión anterior se disparaba al ocurrir el hecho
// y salía a BUSCAR si por casualidad había un post; en el camino de la sesión el
// aviso se emitía antes de crear el post, así que no lo encontraba nunca y caía a
// la ficha del ítem. Ese modo de fallo aquí no existe: si hay post, es este.
//
// Best-effort: mismo contrato que notify() — nunca lanza. Un fan-out roto no puede
// deshacer un post ya publicado.
//
// Lee follows por service-role: es un camino de servidor de confianza y así
// notify_events (preferencia privada del follower) no se expone por RLS al autor.
export async function notifyFollowersOfPost(
  supabase: SupabaseServerClient,
  authorId: string,
  post: {
    postId: string;
    kind: PostKind;
    interactionTargetId: string;
    // Título de la obra, cuando createPost ya lo resolvió (una única consulta
    // autorizada por el spec, ver post-actions.ts). Sin él, la copia genérica
    // se queda como estaba.
    subject?: string;
  },
): Promise<void> {
  try {
    const category: NotifyCategory = CATEGORY_FOR_POST_KIND[post.kind];
    const type = POST_KIND_NOTIFICATION_TYPE[post.kind];

    const writer = createServiceRoleClient();
    const { data, error } = await writer
      .from("follows")
      .select("follower_id")
      .eq("followee_id", authorId)
      .eq("status", "accepted")
      .contains("notify_events", [category]);
    if (error) throw error;
    const userIds = (data ?? []).map((r) => r.follower_id);
    if (userIds.length === 0) return;

    await notifyMany(supabase, {
      userIds,
      actorId: authorId,
      type,
      // SIEMPRE el target del post. No hay rama de fallback a la ficha: el href
      // sale de interaction_targets.href, que la DB fija como '/post/' || id
      // (20260844_posts.sql:99-115).
      interactionTargetId: post.interactionTargetId,
      // Solo IDEMPOTENCIA (doble envío, reintento), no colapso. La clave vieja
      // colgaba del pase y colapsaba avisos que llevaban a posts DISTINTOS; un
      // post es un enlace propio y colapsarlos era tirar información. El volumen
      // lo controla quien publica: para eso pulsó «Compartir». notifyMany añade
      // `:${userId}`.
      dedupeKey: `person:${type}:${post.postId}`,
      // Recortado aquí, no en cada llamante (post-actions.ts es hoy el único,
      // pero este es el punto por el que `subject` entra SIEMPRE en el
      // contexto guardado): igual que `commentContext` acota el excerpt antes
      // de guardarlo, este es el sitio que protege a cualquier futuro
      // llamante sin que tenga que acordarse de recortar el título él mismo.
      context: post.subject ? { subject: buildSubject(post.subject) } : undefined,
    });
  } catch (err) {
    console.error("notifyFollowersOfPost failed", err);
  }
}
