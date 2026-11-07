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

  // Una serie no crea `progress_sessions` desde la fase 4 (data-model.md,
  // episode_watches; TRAMPAS #11): su actividad son los episodios vistos. Su
  // recuento sale de `watched_on` (fecha local del visionado): episodios =
  // filas, y como «sesiones» cuentan los días de serie distintos (la misma
  // unidad que la racha y el post `watched`), así días y racha son verdad.
  const [pass, sessions, watches, companion] = await Promise.all([
    supabase.from("passes").select("item_type, position").eq("id", passId).eq("user_id", user.id).maybeSingle(),
    supabase.from("progress_sessions").select("session_date").eq("pass_id", passId).eq("user_id", user.id),
    supabase.from("episode_watches").select("watched_on").eq("pass_id", passId).eq("user_id", user.id),
    getCompanionState(supabase).catch((e) => {
      console.error("loadClosingContext: companion", e);
      return null;
    }),
  ]);

  let recap: ClosingRecap | null = null;
  const isSeries = pass.data?.item_type === "series";
  const source = isSeries ? watches : sessions;
  if (!pass.error && pass.data && !source.error) {
    if (isSeries) {
      const dates = (watches.data ?? []).map((w) => w.watched_on);
      const days = computeRecap({ sessionDates: dates, pages: null, episodes: null });
      recap = { ...days, sessions: new Set(dates).size, episodes: dates.length };
    } else {
      const position = (pass.data.position ?? {}) as { page?: unknown };
      const pages = pass.data.item_type === "book" && typeof position.page === "number" ? position.page : null;
      recap = computeRecap({ sessionDates: (sessions.data ?? []).map((s) => s.session_date), pages, episodes: null });
    }
  } else {
    console.error("loadClosingContext: recap", pass.error ?? source.error ?? "pase no encontrado");
  }
  const pet = companion ? { name: companion.name, petClass: companion.petClass, stage: companion.stage } : null;
  return { recap, pet };
}
