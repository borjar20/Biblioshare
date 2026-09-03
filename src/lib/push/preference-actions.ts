"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { DEFAULT_PREFERENCES, type NotificationPreferences } from "./preferences";

// Lectura/escritura de las preferencias del usuario (spec item 4). RLS self-only:
// va con el cliente de la sesión (no service_role). Las preferencias son del
// USUARIO; la identidad sale siempre de la sesión.

const ALLOWED_KEYS = [
  "web_push_enabled",
  "android_push_enabled",
  "category_social",
  "category_clubs",
  "category_progress",
  "category_system",
  "category_pet",
] as const satisfies readonly (keyof NotificationPreferences)[];

// Una server action es un endpoint POST público: se filtra a las claves booleanas
// conocidas y se descarta cualquier otra cosa que mande el cliente.
function sanitize(patch: unknown): Partial<NotificationPreferences> {
  const out: Partial<NotificationPreferences> = {};
  if (!patch || typeof patch !== "object") return out;
  const p = patch as Record<string, unknown>;
  for (const key of ALLOWED_KEYS) {
    if (typeof p[key] === "boolean") out[key] = p[key] as boolean;
  }
  return out;
}

export async function loadMyPreferences(): Promise<NotificationPreferences> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("notification_preferences")
    .select(
      "web_push_enabled, android_push_enabled, category_social, category_clubs, category_progress, category_system, category_pet",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  // Sin fila = defaults (opt-out): todo activo.
  return data ?? DEFAULT_PREFERENCES;
}

export async function updateMyPreferences(patch: Partial<NotificationPreferences>): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const clean = sanitize(patch);
  if (Object.keys(clean).length === 0) return;

  // Upsert: la primera vez inserta la fila (columnas no incluidas → defaults DB,
  // todo true); luego actualiza solo las columnas del patch.
  const { error } = await supabase
    .from("notification_preferences")
    .upsert(
      { user_id: user.id, ...clean, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  if (error) throw error;
}
