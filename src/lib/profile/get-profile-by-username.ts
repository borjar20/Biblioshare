import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
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
  // Cuándo terminó el onboarding, o NULL si aún no. Lo consume AppShell para
  // decidir si pinta la navegación (ver #456: antes lo leía por su cuenta).
  onboardedAt: string | null;
  // Objetivo diario de lectura en minutos (docs/REQUIREMENTS.md §7.14). NULL =
  // sin objetivo. La meta ANUAL ya no vive aquí: tras la fusión (plan 05, P6)
  // es un reto — ver `lib/challenges/annual-goals.ts`.
  dailyGoalMinutes: number | null;
  // RBAC role (docs/REQUIREMENTS.md §7.35).
  role: UserRole;
  // Preferencia de biblioteca: si true, las rejillas del usuario —y su perfil
  // público, que enseña la misma biblioteca— omiten las obras abandonadas.
  // NO afecta a /estadisticas ni al export CSV (spec 2026-08-24).
  hideDropped: boolean;
};

const PROFILE_COLUMNS =
  "user_id, username, is_public, display_name, avatar_url, bio, created_at, onboarded_at, daily_goal_minutes, role, hide_dropped";

function toProfile(data: {
  user_id: string;
  username: string;
  is_public: boolean;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  created_at: string;
  onboarded_at: string | null;
  daily_goal_minutes: number | null;
  role: UserRole;
  hide_dropped: boolean;
}): Profile {
  return {
    userId: data.user_id,
    username: data.username,
    isPublic: data.is_public,
    displayName: data.display_name,
    avatarUrl: data.avatar_url,
    bio: data.bio,
    createdAt: data.created_at,
    onboardedAt: data.onboarded_at,
    dailyGoalMinutes: data.daily_goal_minutes,
    role: data.role,
    hideDropped: data.hide_dropped,
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

// El perfil PROPIO por userId, memoizado POR PETICIÓN con cache() de React. En
// cada ruta logueada se leía DOS veces: la inline de AppShell (chrome) y la de
// la página. Eran funciones distintas con columnas distintas, así que no se
// deduplicaban solas (#456). Ahora AppShell y la página llaman a ESTA, y como
// cache() indexa por identidad del argumento y el userId es un string estable,
// la segunda es un acierto: una sola consulta a `profiles` por petición.
//
// Cliente propio dentro: se memoiza el RESULTADO, no la instancia — misma regla
// que getCurrentUser (server.ts) y roleByUserId (roles.ts). Por eso ya no toma
// `supabase`: con el cliente como argumento, cada componente pasa el suyo y la
// caché no acertaría nunca.
//
// Sigue haciendo throw en error (las páginas lo tratan como hoy, vía su error
// boundary). AppShell, que hoy tolera el fallo, lo envuelve en .catch() para que
// un error de perfil no tumbe el chrome de todas las rutas.
export const getOwnProfile = cache(
  async (userId: string): Promise<Profile | null> => {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;

    return toProfile(data);
  }
);
