import type { createClient } from "@/lib/supabase/server";
import { todayISO, toISODate } from "@/lib/stats/dates";
import { isPetClass, type PetClass, type PetMood, type PetStage } from "./classes";
import { daysBetweenISO } from "./counts";
import { moodFor, stageFor } from "./derive";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export interface CompanionState {
  name: string;
  petClass: PetClass;
  stage: PetStage;
  mood: PetMood;
  hidden: boolean;
}

// Lectura LIGERA (spec §8): corre en cada página del shell, así que no deriva
// atributos. La etapa sale de `last_level` (lo último que calculó /mascota)
// vía `stageFor`, y el humor de la última actividad, que son cuatro
// consultas de una fila.
export async function getCompanionState(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<CompanionState | null> {
  const { data: pet, error } = await supabase
    .from("pet_state")
    .select("name, class, hatched_at, companion_hidden, last_level")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!pet || !isPetClass(pet.class)) return null;

  const [session, finished, post, vote] = await Promise.all([
    supabase.from("progress_sessions").select("session_date").eq("user_id", userId).order("session_date", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("passes").select("finished_on").eq("user_id", userId).not("finished_on", "is", null).order("finished_on", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("club_posts").select("created_at").eq("author_id", userId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("club_poll_votes").select("voted_at").eq("user_id", userId).order("voted_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  for (const r of [session, finished, post, vote]) {
    if (r.error) throw r.error;
  }

  // timestamptz → día LOCAL, la misma convención que session_date y todayISO()
  const last = [
    session.data?.session_date,
    finished.data?.finished_on,
    post.data?.created_at ? toISODate(new Date(post.data.created_at)) : undefined,
    vote.data?.voted_at ? toISODate(new Date(vote.data.voted_at)) : undefined,
  ]
    .filter((d): d is string => Boolean(d))
    .sort()
    .at(-1) ?? null;

  // timestamptz → día LOCAL, la misma convención que session_date y todayISO()
  const hatchedISO = toISODate(new Date(pet.hatched_at));
  const hasActivitySinceHatch = last != null && last >= hatchedISO;
  const today = todayISO();

  return {
    name: pet.name,
    petClass: pet.class,
    stage: stageFor(pet.last_level, hasActivitySinceHatch),
    mood: moodFor(last ? daysBetweenISO(last, today) : null),
    hidden: pet.companion_hidden,
  };
}
