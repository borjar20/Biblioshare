"use server";

import { createClient } from "@/lib/supabase/server";
import { getFeed, type FeedPage } from "./feed";
import type { ItemType } from "@/lib/catalog/types";

// Única mutación... en realidad una LECTURA vía server action, no una
// mutación — necesario porque la paginación del feed es abierta (a
// diferencia del prefetch capado de comentarios de Bloque B, que evitó
// deliberadamente este patrón). "Cargar más" en el cliente llama a esto con
// el cursor acumulado.
export async function loadMoreFeed(
  cursor: string | null,
  itemType?: ItemType,
  reviewsOnly?: boolean,
): Promise<FeedPage> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { events: [], nextCursor: null };

  return getFeed(supabase, user.id, {
    cursor: cursor ?? undefined,
    itemType,
    reviewsOnly,
  });
}
