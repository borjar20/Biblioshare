import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
import { notify } from "@/lib/social/notifications";
import { buildSubject, type NotificationContext } from "@/lib/social/notification-context";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const TABLE_BY_TYPE = { book: "books", movie: "movies", series: "series" } as const;

// Título de la obra para la copia del aviso. Best-effort: sin título, el aviso
// sale con la copia genérica.
async function workSubject(
  supabase: SupabaseServerClient,
  itemType: ItemType,
  itemId: string,
): Promise<NotificationContext | undefined> {
  try {
    const { data } = await supabase.from(TABLE_BY_TYPE[itemType]).select("title").eq("id", itemId).maybeSingle();
    const subject = data?.title ? buildSubject(data.title) : "";
    return subject ? { subject } : undefined;
  } catch (e) {
    console.error(e);
    return undefined;
  }
}

// Reclama (marca notified_at) y envía los avisos de notas DEDICADAS abiertas en
// las que quien llama es autor o lector. Quien reclama primero se lleva el aviso,
// pero el destinatario es SIEMPRE el lector y el actor SIEMPRE el autor.
// Best-effort: un fallo aquí nunca debe tumbar la acción que lo llama (guardar
// sesión, marcar episodio…).
export async function deliverMarginNotices(supabase: SupabaseServerClient): Promise<void> {
  try {
    const { data, error } = await supabase.rpc("margin_claim_notices");
    if (error || !data) {
      if (error) console.error("margin_claim_notices failed", error);
      return;
    }
    await Promise.all(
      data.map(async (row) => {
        try {
          await notify(supabase, {
            userId: row.reader_id,
            actorId: row.author_id,
            type: "margin_note_dedicated",
            interactionTargetId: row.target_id ?? undefined,
            dedupeKey: `margin_note_dedicated:${row.encounter_id}`,
            context: await workSubject(supabase, row.item_type as ItemType, row.item_id),
          });
        } catch (e) {
          console.error(e);
        }
      }),
    );
  } catch (e) {
    console.error(e);
  }
}
