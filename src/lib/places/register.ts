import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import type { Json } from "@/lib/supabase/database.types";
import { verifyPlace } from "./token";

const MIN_SECRET = 32;
/** null disables suggestions (soft dependency, like GOOGLE_BOOKS_API_KEY). */
export function placesSecret(): string | null {
  const secret = process.env.PLACES_SIGNING_SECRET;
  return secret && secret.length >= MIN_SECRET ? secret : null;
}

/**
 * Signed suggestion → places.id. The service client is the ONLY writer of `places`
 * (place_upsert is service_role-only): an authenticated RPC could be called straight
 * against Supabase and skip the signature. Never throws; null means "save as text".
 */
export async function resolvePlaceToken(token: string | null | undefined): Promise<string | null> {
  const secret = placesSecret();
  if (!token || !secret) return null;
  const place = verifyPlace(token, secret);
  if (!place) return null;
  try {
    const { data, error } = await createServiceRoleClient().rpc("place_upsert", { p_input: place as unknown as Json });
    return !error && typeof data === "string" ? data : null;
  } catch { return null; }
}
