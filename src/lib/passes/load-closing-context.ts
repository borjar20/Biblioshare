"use server";

import { createClient } from "@/lib/supabase/server";
import { getCompanionState } from "@/lib/pet/get-companion-state";
import { computeRecap, type ClosingRecap } from "@/lib/ritual/recap";
import type { StagePet } from "@/components/stage/stage-mascot";

export type ClosingContext = { recap: ClosingRecap | null; pet: StagePet | null };

// Recuento y mascota para el cierre (spec 2026-11-07). La hoja de cierre se abre
// desde varios sitios, así que lo trae una action al abrir, como loadSorteo.
// SIN `use cache` (regla #437): sesiones y pase salen de RLS con auth.uid().
// Si el recuento falla, el cierre sigue sin él (la mascota dice una genérica).
export async function loadClosingContext(passId: string): Promise<ClosingContext> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("loadClosingContext: sin sesión");

  const [pass, sessions, episodes, companion] = await Promise.all([
    supabase.from("passes").select("item_type, position").eq("id", passId).maybeSingle(),
    supabase.from("progress_sessions").select("session_date").eq("pass_id", passId),
    supabase.from("episode_watches").select("id", { count: "exact", head: true }).eq("pass_id", passId),
    getCompanionState(supabase).catch((e) => {
      console.error("loadClosingContext: companion", e);
      return null;
    }),
  ]);

  let recap: ClosingRecap | null = null;
  if (!pass.error && pass.data && !sessions.error) {
    const position = (pass.data.position ?? {}) as { page?: unknown };
    const pages = pass.data.item_type === "book" && typeof position.page === "number" ? position.page : null;
    const episodeCount = pass.data.item_type === "series" && !episodes.error ? (episodes.count ?? 0) : null;
    recap = computeRecap({ sessionDates: (sessions.data ?? []).map((s) => s.session_date), pages, episodes: episodeCount });
  } else {
    console.error("loadClosingContext: recap", pass.error ?? sessions.error);
  }
  const pet = companion ? { name: companion.name, petClass: companion.petClass, stage: companion.stage } : null;
  return { recap, pet };
}
