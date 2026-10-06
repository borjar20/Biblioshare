// Fixtures de los wrap-ups (crónicas). `wrap_ups` solo la escribe el service
// role (el cliente no puede inventarse cifras), así que la semilla va por aquí.
//
// El payload sale de `buildWrapUp`: primero sobre los datos REALES del usuario
// de prueba en la ventana semanal; si esa semana no le da un `full` (dev no
// tiene actividad cada semana), se compone con el MISMO `buildWrapUp` pero con
// loaders inyectados con hechos fijos — así selección de stories, narradora,
// paleta y resumen público siguen siendo el código de producción, y solo los
// hechos crudos son de fixture. Las portadas, si las hay, son obras reales del
// usuario (las de su crónica anual), nunca inventadas.
import { createClient } from "@supabase/supabase-js";
import { buildWrapUp, type Loaders } from "@/lib/wrap-ups/build";
import type { ItemRef, WrapUpInputs, WrapUpPayload } from "@/lib/wrap-ups/types";
import { wrapUpWindow, type WrapUpWindow } from "@/lib/wrap-ups/windows";

const DEV_HOST = "tyvzpuhxfwxrnkcpzxyg.supabase.co";

export function wrapUpAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  // Misma guarda que el resto de fixtures: con la service key, solo dev o local.
  if (![DEV_HOST, "127.0.0.1", "localhost"].includes(new URL(url).hostname)) {
    throw new Error("Wrap-up fixtures require local or biblioshare-dev");
  }
  if (!key) throw new Error("Missing fixture service key");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

type Admin = ReturnType<typeof wrapUpAdmin>;
export async function upsertWrapUp(admin: Admin, userId: string, p: WrapUpPayload) {
  const { data: actor, error: actorError } = await admin.from("profiles").select("username").eq("user_id", userId).single();
  if (actorError || !actor?.username.startsWith("qa_exp_")) throw new Error("Wrap-up fixture writes require a disposable actor");
  // Borrar antes de insertar: un periodo distinto ya se llevaría el share por
  // trigger, pero el mismo periodo no, y la semilla tiene que salir sin publicar.
  const { error: deleteError } = await admin.from("wrap_ups").delete().eq("user_id", userId).eq("kind", p.kind);
  if (deleteError) throw deleteError;
  const { error } = await admin.from("wrap_ups").insert({
    user_id: userId, kind: p.kind, period_start: p.periodStart, period_end: p.periodEnd,
    intensity: p.intensity, payload: p as never, generated_at: new Date().toISOString(),
    seen_at: null, refreshed_at: null, published_post_id: null,
  });
  if (error) throw error;
}

/** Días de la ventana (YYYY-MM-DD) por índice desde su inicio. */
function day(w: WrapUpWindow, offset: number): string {
  const d = new Date(`${w.start}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

/** Obras reales del usuario para las portadas: las terminadas de su crónica anual. */
async function realCovers(admin: Admin, userId: string): Promise<ItemRef[]> {
  const year = await buildWrapUp(admin as never, userId, wrapUpWindow("year"));
  const finished = year?.stories.find((s) => s.id === "finished");
  return finished && finished.id === "finished" ? finished.items.slice(0, 4) : [];
}

/** Loaders con hechos fijos de una semana «llena» (4 días activos, lectura dominante). */
export function fixtureLoaders(w: WrapUpWindow, covers: ItemRef[], minutes = { book: 320, movie: 110, series: 45 }): Loaders {
  const core: Pick<WrapUpInputs, "time" | "activeDays" | "finished" | "inProgress" | "bestStreak"
    | "favoriteWeekday" | "favoriteBandStartHour" | "genres"> = {
    time: { minutes, episodesWithoutRuntime: 0, previousMinutes: 300 },
    activeDays: [0, 1, 2, 4].map((i) => day(w, i)),
    finished: covers.slice(0, 3),
    inProgress: [],
    bestStreak: 3,
    favoriteWeekday: 1,
    favoriteBandStartHour: 21,
    genres: [],
  };
  return {
    core: async () => core,
    moments: async () => ({
      bestRated: covers[0] ? { item: covers[0], rating: 8, review: null } : null,
      phrase: null, experience: null, together: { jointViewings: 0, clubDays: 0 }, experienceDays: 0,
    }),
    annual: async () => null as never,
    pet: async () => null,
  };
}

/**
 * Payload semanal `full`: real si la semana del usuario lo da; si no, el de los
 * loaders de fixture. Devuelve también el origen, para anotarlo en el informe.
 */
export async function weekFullPayload(admin: Admin, userId: string): Promise<{ payload: WrapUpPayload; source: "real" | "fixture-loaders" }> {
  const w = wrapUpWindow("week");
  const real = await buildWrapUp(admin as never, userId, w);
  if (real?.intensity === "full") return { payload: real, source: "real" };
  const payload = await buildWrapUp(admin as never, userId, w, fixtureLoaders(w, await realCovers(admin, userId)));
  if (!payload || payload.intensity !== "full" || !payload.share) throw new Error("fixture week payload is not full");
  return { payload, source: "fixture-loaders" };
}
