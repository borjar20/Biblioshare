import type { createClient } from "@/lib/supabase/server";
import { earnCelebration } from "@/lib/celebrations/earn";
import { todayISO, toISODate } from "@/lib/stats/dates";
import { isPetClass, type PetAttributes, type PetClass, type PetMood, type PetStage } from "./classes";
import { daysBetweenISO, type PetCounts } from "./counts";
import { deriveAttributes, levelFor, moodFor, stageFor, xpFor, xpForLevel } from "./derive";
import { getPetCounts } from "./get-pet-counts";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export const STAGE_INDEX: Record<PetStage, number> = { acorn: 0, young: 1, adult: 2, veteran: 3 };

export interface PetSnapshot {
  name: string;
  petClass: PetClass;
  hatchedAt: string;
  hidden: boolean;
  counts: PetCounts;
  attributes: PetAttributes;
  xp: number;
  level: number;
  /** XP donde empieza el nivel actual y donde empieza el siguiente (barra). */
  levelFloorXp: number;
  nextLevelXp: number;
  stage: PetStage;
  mood: PetMood;
  lastActivityISO: string | null;
  /** true en la lectura que detecta la subida/evolución (para animar). */
  leveledUp: boolean;
  evolved: boolean;
}

// Lectura COMPLETA (spec §8): solo /mascota. Deriva todo y, si el nivel o la
// etapa superan lo último guardado, actualiza pet_state y GANA la celebración
// (dedupe por clave, así que repetir la lectura no la gana dos veces). Sin cron:
// la subida se detecta cuando alguien mira la mascota, y se dice en la doc.
export async function getPetSnapshot(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<PetSnapshot | null> {
  const { data: pet, error } = await supabase
    .from("pet_state")
    .select("name, class, hatched_at, companion_hidden, last_level, last_stage")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!pet || !isPetClass(pet.class)) return null;

  const { counts, lastActivityISO } = await getPetCounts(supabase, userId);
  const attributes = deriveAttributes(counts);
  const xp = xpFor(attributes, pet.class);
  const level = levelFor(xp);
  // timestamptz → día LOCAL, la misma convención que session_date y todayISO()
  const hatchedISO = toISODate(new Date(pet.hatched_at));
  const hasActivitySinceHatch = lastActivityISO != null && lastActivityISO >= hatchedISO;
  const stage = stageFor(level, hasActivitySinceHatch);
  const mood = moodFor(lastActivityISO ? daysBetweenISO(lastActivityISO, todayISO()) : null);

  const leveledUp = level > pet.last_level;
  // last_stage es text sin CHECK: un valor desconocido da undefined y evolved=false (fail-closed; la app solo escribe valores de stageFor).
  const evolved = STAGE_INDEX[stage] > STAGE_INDEX[pet.last_stage as PetStage];

  // Rebalancear el balance puede BAJAR el nivel o la etapa (todo se deriva).
  // Sin celebración, pero se guarda: si no, last_level quedaría por encima del
  // real y la siguiente subida de verdad no se celebraría hasta superarlo.
  const droppedDown = level < pet.last_level || STAGE_INDEX[stage] < (STAGE_INDEX[pet.last_stage as PetStage] ?? 0);

  if (leveledUp || evolved || droppedDown) {
    const { error: upErr } = await supabase
      .from("pet_state")
      .update({ last_level: level, last_stage: stage, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
    if (upErr) console.error("getPetSnapshot update", upErr);
    if (leveledUp) await earnCelebration(supabase, userId, { event: "pet_level_up", milestone: level });
    if (evolved) await earnCelebration(supabase, userId, { event: "pet_evolved", milestone: STAGE_INDEX[stage] });
  }

  return {
    name: pet.name,
    petClass: pet.class,
    hatchedAt: pet.hatched_at,
    hidden: pet.companion_hidden,
    counts,
    attributes,
    xp,
    level,
    levelFloorXp: xpForLevel(level),
    nextLevelXp: xpForLevel(level + 1),
    stage,
    mood,
    lastActivityISO,
    leveledUp,
    evolved,
  };
}
