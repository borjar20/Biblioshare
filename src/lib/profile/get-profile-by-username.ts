import type { createClient } from "@/lib/supabase/server";
import type { ItemType } from "@/lib/catalog/types";
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
  // Optional stats goals (docs/REQUIREMENTS.md §7.14). The daily goal is
  // reading minutes; the annual goal is completed items, one per item type.
  // NULL in either = no goal set.
  dailyGoalMinutes: number | null;
  annualGoals: Record<ItemType, number | null>;
  // RBAC role (docs/REQUIREMENTS.md §7.35).
  role: UserRole;
};

const PROFILE_COLUMNS =
  "user_id, username, is_public, display_name, avatar_url, bio, created_at, daily_goal_minutes, annual_goal_books, annual_goal_movies, annual_goal_series, role";

function toProfile(data: {
  user_id: string;
  username: string;
  is_public: boolean;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
  daily_goal_minutes: number | null;
  annual_goal_books: number | null;
  annual_goal_movies: number | null;
  annual_goal_series: number | null;
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
    annualGoals: {
      book: data.annual_goal_books,
      movie: data.annual_goal_movies,
      series: data.annual_goal_series,
    },
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

// Identidad de un perfil (incl. PRIVADOS) para el stub de solicitar-seguir
// (EPIC-05, modelo Instagram). Lee la vista profile_identities, que expone solo
// identidad (nunca objetivos/rol) de cualquier perfil. Devuelve null si el
// username no existe.
export type ProfileIdentity = {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  isPublic: boolean;
};

export async function getProfileIdentity(
  supabase: SupabaseServerClient,
  username: string
): Promise<ProfileIdentity | null> {
  const { data, error } = await supabase
    .from("profile_identities")
    .select("user_id, username, display_name, avatar_url, bio, is_public")
    .eq("username", username)
    .maybeSingle();

  if (error) throw error;
  // La vista profile_identities tipa sus columnas como nullable (es una vista),
  // pero user_id/username nunca lo son en una fila de perfil real.
  if (!data || data.user_id == null || data.username == null) return null;

  return {
    userId: data.user_id,
    username: data.username,
    displayName: data.display_name,
    avatarUrl: data.avatar_url,
    bio: data.bio,
    isPublic: data.is_public ?? false,
  };
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
