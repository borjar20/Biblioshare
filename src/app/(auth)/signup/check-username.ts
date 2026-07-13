"use server";

import { createClient } from "@/lib/supabase/server";
import {
  USERNAME_PATTERN,
  isUsernameAvailable,
  normalizeUsername,
} from "@/lib/profile/username";

export type UsernameStatus = "available" | "taken" | "invalid";

// Comprobación en vivo mientras se escribe el @usuario. Es solo una ayuda de
// UI: quien decide de verdad es el índice único al insertar el perfil.
export async function checkUsername(raw: string): Promise<UsernameStatus> {
  const username = normalizeUsername(raw);
  if (!USERNAME_PATTERN.test(username)) return "invalid";

  const supabase = await createClient();
  return (await isUsernameAvailable(supabase, username))
    ? "available"
    : "taken";
}
