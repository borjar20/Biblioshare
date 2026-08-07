"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidateFeed } from "@/lib/reactivity/revalidate";
import type { AnchorType, AnchorRef } from "@/lib/catalog/anchor";
import { notifyMentions } from "./notify-mentions";
import { searchAnchors } from "./anchor-search";

export type CreateThoughtInput = {
  anchorType: AnchorType;
  anchorId: string;
  body: string;
  isSpoiler: boolean;
};

export type CreateThoughtResult = { ok: true; id: string } | { ok: false; error: string };

// Tabla de catálogo que resuelve cada tipo de ancla (20260835_thoughts.sql):
// sin FK SQL sobre `anchor_id` (es polimórfico), así que la integridad la
// garantiza esta función resolviendo la fila ANTES de insertar.
const ANCHOR_TABLE: Record<AnchorType, "books" | "movies" | "series" | "sagas" | "people"> = {
  book: "books",
  movie: "movies",
  series: "series",
  saga: "sagas",
  person: "people",
};

// Server action dedicada de «Pensamiento» (Fase 4, Task 4.1): resultado
// discriminado, NUNCA lanza -- Next.js borra `.message` de los errores
// lanzados desde server actions al compilar producción (ver
// docs/superpowers/... y la trampa ya documentada en el repo), así que un
// `throw` aquí dejaría al cliente sin poder distinguir "sin sesión" de
// "servidor caído" en prod. Cualquier fallo inesperado cae en el catch de
// fuera y se devuelve como "unknown".
export async function createThought(input: CreateThoughtInput): Promise<CreateThoughtResult> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: "unauthenticated" };

    const trimmed = input.body.trim();
    if (!trimmed) return { ok: false, error: "empty" };
    if (input.body.length > 2000) return { ok: false, error: "too_long" };

    const { data: anchorRow, error: anchorError } = await supabase
      .from(ANCHOR_TABLE[input.anchorType])
      .select("id")
      .eq("id", input.anchorId)
      .maybeSingle();
    if (anchorError) throw anchorError;
    if (!anchorRow) return { ok: false, error: "anchor_not_found" };

    // Cliente de SESIÓN (no service-role): la RLS `thoughts insert own`
    // (`auth.uid() = user_id`) es quien de verdad impide suplantar autoría.
    const { data: inserted, error: insertError } = await supabase
      .from("thoughts")
      .insert({
        user_id: user.id,
        anchor_type: input.anchorType,
        anchor_id: input.anchorId,
        body: trimmed,
        is_spoiler: input.isSpoiler,
      })
      .select("id")
      .single();
    if (insertError) throw insertError;

    // Menciones @usuario en el cuerpo, best-effort: mismo patrón que
    // `addComment` (interaction-actions.ts) -- resuelve el target canónico
    // ('thought', materializado por el trigger de la migración) y delega en
    // notifyMentions, que ya no lanza por su cuenta. Un fallo aquí nunca debe
    // deshacer el pensamiento ya publicado.
    try {
      const { data: target } = await supabase
        .from("interaction_targets")
        .select("id")
        .eq("kind", "thought")
        .eq("source_id", inserted.id)
        .maybeSingle();
      if (target) {
        await notifyMentions(supabase, {
          authorId: user.id,
          text: trimmed,
          interactionTargetId: target.id,
        });
      }
    } catch (mentionError) {
      console.error("createThought: notifyMentions failed", mentionError);
    }

    revalidateFeed();
    return { ok: true, id: inserted.id };
  } catch (error) {
    console.error("createThought failed", error);
    return { ok: false, error: "unknown" };
  }
}

// Wrapper fino para el cliente (Task 4.3): el compositor no puede llamar a
// searchAnchors directamente (necesita un SupabaseServerClient de sesión),
// así que esta acción resuelve el viewer y delega. Sin sesión, lista vacía
// en vez de error -- el autocompletar simplemente no encuentra nada.
export async function searchAnchorsAction(query: string): Promise<AnchorRef[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  return searchAnchors(supabase, user.id, query);
}
