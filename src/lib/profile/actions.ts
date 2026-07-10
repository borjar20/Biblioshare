"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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

  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: displayName || null,
      bio: bio || null,
      avatar_url: avatarUrl || null,
    })
    .eq("user_id", user.id);

  if (error) return { error: "generic" };

  revalidatePath(`/u/${username}`);
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

export async function updateGoals(
  _prevState: UpdateGoalsState,
  formData: FormData
): Promise<UpdateGoalsState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Un objetivo anual por tipo de ítem; el diario es solo de lectura (§7.14).
  const dailyGoal = parseGoal(String(formData.get("dailyGoalMinutes") ?? ""));
  const annualBooks = parseGoal(String(formData.get("annualGoalBooks") ?? ""));
  const annualMovies = parseGoal(String(formData.get("annualGoalMovies") ?? ""));
  const annualSeries = parseGoal(String(formData.get("annualGoalSeries") ?? ""));

  const parsed = [dailyGoal, annualBooks, annualMovies, annualSeries];
  if (parsed.some((goal) => goal === "invalid")) {
    return { error: "invalidGoal" };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      daily_goal_minutes: dailyGoal as number | null,
      annual_goal_books: annualBooks as number | null,
      annual_goal_movies: annualMovies as number | null,
      annual_goal_series: annualSeries as number | null,
    })
    .eq("user_id", user.id);

  if (error) return { error: "generic" };

  revalidatePath("/");
  return {};
}
