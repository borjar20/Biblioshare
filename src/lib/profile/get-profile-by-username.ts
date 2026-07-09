import type { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/auth/roles";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type Profile = {
  userId: string;
  username: string;
  isPublic: boolean;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  createdAt: string;
  // Optional stats goals (docs/REQUIREMENTS.md §7.14).
  dailyGoalMinutes: number | null;
  annualGoalItems: number | null;
  // RBAC role (docs/REQUIREMENTS.md §7.35).
  role: UserRole;
};

const PROFILE_COLUMNS =
  "user_id, username, is_public, display_name, avatar_url, bio, created_at, daily_goal_minutes, annual_goal_items, role";

function toProfile(data: {
  user_id: string;
  username: string;
  is_public: boolean;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
  daily_goal_minutes: number | null;
  annual_goal_items: number | null;
  role: UserRole;
}): Profile {
  return {
    userId: data.user_id,
    username: data.username,
    isPublic: data.is_public,
    displayName: data.display_name,
    avatarUrl: data.avatar_url,
    bio: data.bio,
    createdAt: data.created_at,
    dailyGoalMinutes: data.daily_goal_minutes,
    annualGoalItems: data.annual_goal_items,
    role: data.role,
  };
}

export async function getProfileByUsername(
  supabase: SupabaseServerClient,
  username: string
): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("username", username)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return toProfile(data);
}

export async function getOwnProfile(
  supabase: SupabaseServerClient,
  userId: string
): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return toProfile(data);
}
