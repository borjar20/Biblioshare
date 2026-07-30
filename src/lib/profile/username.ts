import type { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

// Cuerpo compartido de la forma de un username: lo reutiliza mentions.ts para
// construir MENTION_RE y evitar que las dos formas diverjan (issue #322).
export const USERNAME_BODY = "[a-z0-9_]{3,30}";
export const USERNAME_PATTERN = new RegExp(`^${USERNAME_BODY}$`);

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

// ¿Está libre este @usuario? Se consulta `profile_identities`, que tiene
// `grant select to anon` y no es security_invoker — así que la comprobación
// funciona ANTES de tener sesión, que es justo lo que necesita el registro.
//
// Es una comprobación optimista: entre que se responde y se inserta el perfil,
// alguien podría quedarse el nombre. La garantía real es el índice único de
// `profiles.username`, y por eso el insert sigue tratando el 23505.
export async function isUsernameAvailable(
  supabase: SupabaseServerClient,
  username: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("profile_identities")
    .select("username")
    .eq("username", username)
    .maybeSingle();

  if (error) throw error;
  return data === null;
}
