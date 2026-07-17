"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { revalidateProfile, revalidateFeed } from "@/lib/reactivity/revalidate";

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
