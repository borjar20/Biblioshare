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

/** Forma del jsonb que devuelve `get_companion_state()` (20260905). */
type CompanionRow = {
  name: string;
  class: string;
  hatched_at: string;
  companion_hidden: boolean;
  last_level: number;
  /** "YYYY-MM-DD" (Europe/Madrid) del último día con actividad VIVIDA, o null. */
  last_activity: string | null;
};

function isCompanionRow(v: unknown): v is CompanionRow {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.name === "string" &&
    typeof r.class === "string" &&
    typeof r.hatched_at === "string" &&
    typeof r.companion_hidden === "boolean" &&
    typeof r.last_level === "number" &&
    (r.last_activity == null || typeof r.last_activity === "string")
  );
}

// Lectura LIGERA (spec §8): corre en cada página del shell, así que no deriva
// atributos. UNA consulta (issue #1023): el RPC devuelve pet_state y el último
// día con actividad VIVIDA (misma regla que lastActivityISO en
// get-pet-counts.ts, issue #1041). La etapa sale de `last_level` (lo último
// que calculó /mascota) vía `stageFor`, y el humor de la última actividad.
export async function getCompanionState(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<CompanionState | null> {
  void userId; // el RPC usa auth.uid(): la firma se conserva para el shell
  const { data, error } = await supabase.rpc("get_companion_state");
  if (error) throw error;
  if (data == null) return null;
  if (!isCompanionRow(data) || !isPetClass(data.class)) return null;

  const last = data.last_activity;
  // timestamptz → día LOCAL, la misma convención que session_date y todayISO()
  const hatchedISO = toISODate(new Date(data.hatched_at));
  const hasActivitySinceHatch = last != null && last >= hatchedISO;
  const today = todayISO();

  return {
    name: data.name,
    petClass: data.class,
    stage: stageFor(data.last_level, hasActivitySinceHatch),
    mood: moodFor(last ? daysBetweenISO(last, today) : null),
    hidden: data.companion_hidden,
  };
}
