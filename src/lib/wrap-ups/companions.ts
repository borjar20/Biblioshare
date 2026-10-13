// Compañeros de «En compañía» (spec 2026-10-13 §5). El payload solo guarda ids;
// nombre y avatar se resuelven al pintar con el cliente DE LA PETICIÓN, quitando
// a quien tenga un bloqueo con el que mira. Sin `use cache`: depende de quién
// mira (regla #437).
import { createClient } from "@/lib/supabase/server";
import { filterUnblockedUserIds } from "@/lib/social/block-state";
import type { WrapUpPayload } from "./types";
import type { People } from "./view-models";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export function companionIdsOf(payloads: WrapUpPayload[]): string[] {
  const ids = new Set<string>();
  for (const p of payloads) {
    for (const s of p.stories ?? []) {
      if (s.id !== "together") continue;
      for (const v of s.viewings ?? []) for (const id of v.companionIds) ids.add(id);
    }
  }
  return [...ids];
}

export async function resolveCompanionsWith(supabase: Supabase, ids: string[]): Promise<People> {
  if (ids.length === 0) return {};
  const allowed = await filterUnblockedUserIds(supabase, ids);
  if (allowed.length === 0) return {};
  const { data, error } = await supabase.from("profile_identities")
    .select("user_id, username, display_name, avatar_url").in("user_id", allowed);
  if (error) throw error;
  const out: People = {};
  for (const r of (data ?? []) as { user_id: string; username: string; display_name: string | null; avatar_url: string | null }[]) {
    out[r.user_id] = { userId: r.user_id, username: r.username, displayName: r.display_name, avatarUrl: r.avatar_url };
  }
  return out;
}

/** Lo que piden las dos entradas (home y /wrap): un fallo aquí no tumba la crónica, solo quita caras. */
export async function resolveCompanions(payloads: WrapUpPayload[]): Promise<People> {
  try {
    return await resolveCompanionsWith(await createClient(), companionIdsOf(payloads));
  } catch (e) {
    console.error("resolveCompanions", e instanceof Error ? e.message : "error");
    return {};
  }
}
