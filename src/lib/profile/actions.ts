"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  revalidateProfile,
  revalidateFeed,
  revalidateLibrary,
  revalidateProfilePages,
  revalidateCollectionPages,
} from "@/lib/reactivity/revalidate";
import { uploadPublicImage } from "@/lib/storage/upload-public-image";

export type UpdateProfileState = {
  error?: "generic";
};

export async function updateProfile(
  username: string,
  _prevState: UpdateProfileState,
  formData: FormData
): Promise<UpdateProfileState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const displayName = String(formData.get("displayName") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim();
  const avatarUrl = String(formData.get("avatarUrl") ?? "").trim();

  // Espejo de los CHECKs de BD (profiles_bio_len / profiles_display_name_len).
  if (displayName.length > 80 || bio.length > 500) return { error: "generic" };

  // El avatar se sirve desde el bucket propio de Storage (§7.9, avatar-upload.tsx
  // construye la URL con getPublicUrl) — una URL externa arbitraria reabriría el
  // mixed content / tracking pixel que ese bucket vino a eliminar.
  const avatarPrefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/`;
  if (avatarUrl && !avatarUrl.startsWith(avatarPrefix)) return { error: "generic" };

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: displayName || null,
      bio: bio || null,
      avatar_url: avatarUrl || null,
    })
    .eq("user_id", user.id);

  if (error) return { error: "generic" };

  revalidateProfile(username);
  return {};
}

export type UpdateGoalsState = {
  error?: "invalidGoal" | "generic";
};

// Optional stats goals (§7.14): empty input clears the goal (NULL).
function parseGoal(raw: string): number | null | "invalid" {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value < 0) return "invalid";
  return value;
}

// Solo el objetivo DIARIO de lectura (§7.14). La meta anual dejó de ser una
// columna: tras la fusión (plan 05, P6) es un reto y se edita en el Rincón.
export async function updateGoals(
  _prevState: UpdateGoalsState,
  formData: FormData
): Promise<UpdateGoalsState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const dailyGoal = parseGoal(String(formData.get("dailyGoalMinutes") ?? ""));
  if (dailyGoal === "invalid") return { error: "invalidGoal" };

  const { error } = await supabase
    .from("profiles")
    .update({ daily_goal_minutes: dailyGoal as number | null })
    .eq("user_id", user.id);

  if (error) return { error: "generic" };

  revalidateFeed();
  return {};
}

/** Preferencia «ocultar obras abandonadas» (spec 2026-08-24). Booleano suelto y
 *  no un formulario porque el control es un interruptor: no hay nada que
 *  validar más allá del tipo, y el estado optimista del cliente necesita
 *  respuesta inmediata.
 *
 *  Revalida las tres zonas donde la preferencia cambia lo que se pinta: la
 *  biblioteca, las fichas de colección y los perfiles (el propio se ve desde
 *  fuera con la misma regla). */
export async function updateHideDropped(
  value: boolean
): Promise<{ error?: "generic" }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase
    .from("profiles")
    .update({ hide_dropped: value })
    .eq("user_id", user.id);

  if (error) return { error: "generic" };

  revalidateLibrary();
  revalidateCollectionPages();
  revalidateProfilePages();
  return {};
}

// Límites del avatar. El cliente ya comprime a WebP 512px (avatar-upload.tsx),
// así que aquí solo se acepta WebP y un tamaño holgado sobre lo esperado. El
// accept del <input> no es defensa: el tipo/tamaño se comprueban aquí.
const MAX_AVATAR_BYTES = 1 * 1024 * 1024; // 1 MB
const ALLOWED_AVATAR_TYPES = new Set(["image/webp"]);

export type UploadAvatarState = { url?: string; error?: "generic" };

// Sube el avatar comprimido a Storage con service-role (Storage no valida el
// token ES256 del usuario -> una subida de usuario cae por RLS). La ruta se
// deriva del uid de la SESIÓN, nunca del cliente, replicando la garantía de la
// política "carpeta propia". No persiste el perfil: eso sigue haciéndolo el
// submit del formulario (updateProfile) con la URL devuelta.
export async function uploadAvatar(formData: FormData): Promise<UploadAvatarState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "generic" };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "generic" };
  if (!ALLOWED_AVATAR_TYPES.has(file.type)) return { error: "generic" };
  if (file.size > MAX_AVATAR_BYTES) return { error: "generic" };

  const result = await uploadPublicImage("avatars", `${user.id}/avatar.webp`, file, "image/webp");
  if ("error" in result) return { error: "generic" };
  return { url: result.url };
}
