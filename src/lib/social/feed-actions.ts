"use server";

import { createClient } from "@/lib/supabase/server";
import { getFeed, type FeedFilter, type FeedPage } from "./feed";

// Única mutación... en realidad una LECTURA vía server action, no una
// mutación — necesario porque la paginación del feed es abierta (a
// diferencia del prefetch capado de comentarios de Bloque B, que evitó
// deliberadamente este patrón). "Cargar más" en el cliente llama a esto con
// el cursor acumulado.
export async function loadMoreFeed(
  cursor: string | null,
  filter?: FeedFilter,
): Promise<FeedPage> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { events: [], nextCursor: null, knownUsernames: [] };

  return getFeed(supabase, user.id, {
    cursor: cursor ?? undefined,
    filter,
  });
}

// "Cargar más" de la Actividad de un perfil (plan 05, P4): a diferencia del
// feed de inicio, la fuente es un actor fijo, no tus seguidos. El viewer sigue
// siendo quien mira (para las reacciones), pero los eventos son de `actorId`.
export async function loadMoreProfileFeed(
  actorId: string,
  cursor: string | null,
): Promise<FeedPage> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return getFeed(supabase, user?.id ?? actorId, {
    cursor: cursor ?? undefined,
    actorId,
  });
}
