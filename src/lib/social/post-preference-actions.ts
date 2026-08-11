"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_POST_PREFERENCES, type PostPreferences } from "./post-preferences";

// Lectura/escritura de las preferencias de autopublicación (Spec 2). RLS
// self-only: cliente de la SESIÓN (nunca service_role) — la identidad sale
// siempre de la sesión. Espeja push/preference-actions.

const ALLOWED_KEYS = [
  "autopost_started",
  "autopost_finished",
  "autopost_dropped",
] as const satisfies readonly (keyof PostPreferences)[];

// Una server action es un endpoint POST público: se filtra a las claves
// booleanas conocidas y se descarta cualquier otra cosa que mande el cliente.
function sanitize(patch: unknown): Partial<PostPreferences> {
  const out: Partial<PostPreferences> = {};
  if (!patch || typeof patch !== "object") return out;
  const p = patch as Record<string, unknown>;
  for (const key of ALLOWED_KEYS) {
    if (typeof p[key] === "boolean") out[key] = p[key] as boolean;
  }
  return out;
}

export async function loadMyPostPreferences(): Promise<PostPreferences> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("post_preferences")
    .select("autopost_started, autopost_finished, autopost_dropped")
    .eq("user_id", user.id)
    .maybeSingle();

  // Sin fila = defaults (opt-out): así lo lee también maybeAutopostMilestone.
  return data ?? DEFAULT_POST_PREFERENCES;
}

export async function updateMyPostPreferences(
  patch: Partial<PostPreferences>,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const clean = sanitize(patch);
  if (Object.keys(clean).length === 0) return;

  // UPDATE-primero-luego-INSERT en vez de upsert. Un `.upsert(onConflict:user_id)`
  // de PostgREST genera `ON CONFLICT (user_id) DO UPDATE SET user_id = …, …`:
  // mete la PROPIA clave de conflicto en el SET, y eso exige privilegio UPDATE
  // sobre la columna `user_id`, que el grant por columna de post_preferences NO
  // concede (solo concede update de las autopost_*, #375). Por eso el upsert
  // reventaba con 42501 "permission denied". El UPDATE toca solo columnas
  // concedidas; el INSERT (user_id + autopost_*) también está concedido. Nunca
  // se escribe `updated_at`: el grant tampoco lo incluye (lo mantiene el trigger
  // set_updated_at en el UPDATE y el DEFAULT now() en el INSERT).
  const { data: updated, error: updateError } = await supabase
    .from("post_preferences")
    .update(clean)
    .eq("user_id", user.id)
    .select("user_id");
  if (updateError) throw updateError;
  if (updated && updated.length > 0) return;

  const { error: insertError } = await supabase
    .from("post_preferences")
    .insert({ user_id: user.id, ...clean });
  // 23505: otra escritura concurrente insertó la fila entre el UPDATE y el
  // INSERT (el usuario pulsa dos interruptores casi a la vez la primera vez).
  // La fila ya existe → reintenta como UPDATE.
  if (insertError?.code === "23505") {
    const { error: retryError } = await supabase
      .from("post_preferences")
      .update(clean)
      .eq("user_id", user.id);
    if (retryError) throw retryError;
  } else if (insertError) {
    throw insertError;
  }
}
