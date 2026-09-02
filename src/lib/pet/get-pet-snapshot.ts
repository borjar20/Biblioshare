import type { createClient } from "@/lib/supabase/server";
import { earnCelebration } from "@/lib/celebrations/earn";
import { toISODate } from "@/lib/stats/dates";
import { achievementProgress, isAchievementId, type AchievementId } from "./achievements";
import { CLASS_PRIMARY, isPetClass, type PetAttributes, type PetClass, type PetMood, type PetStage } from "./classes";
import { daysBetweenISO, type PetCounts } from "./counts";
import { deriveAttributes, levelFor, moodFor, stageFor, xpFor, xpForLevel } from "./derive";
import { getPetCounts } from "./get-pet-counts";
import { syncDailyMissions, type MissionView } from "./missions/sync";
import { MISSION_ATTR } from "./missions/templates";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export const STAGE_INDEX: Record<PetStage, number> = { acorn: 0, young: 1, adult: 2, veteran: 3 };

export interface AchievementView {
  id: AchievementId;
  value: number;
  threshold: number;
  unlocked: boolean;
  /** ISO de user_celebrations.first_triggered_at; null si bloqueado. */
  unlockedAt: string | null;
}

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
  missions: MissionView[];
  achievements: AchievementView[];
  /** true en la lectura que completa una misión / desbloquea un logro (para pedir el drenado). */
  missionsCompletedNow: boolean;
  achievementsUnlockedNow: boolean;
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

  const { counts, lastActivityISO, days, eligibility, today } = await getPetCounts(supabase, userId);
  // timestamptz → día LOCAL, la misma convención que session_date y todayISO()
  const hatchedISO = toISODate(new Date(pet.hatched_at));
  const hasActivitySinceHatch = lastActivityISO != null && lastActivityISO >= hatchedISO;

  // El sync de misiones va ANTES de derivar el nivel (issue #1029): la XP de
  // una misión completada en ESTA lectura no está en los contadores —se leyeron
  // antes— y, derivando primero, la subida de nivel que provoca no se veía
  // hasta la visita siguiente. La GENERACIÓN sí usa los atributos PRE-sync: son
  // el estado con el que se sortean las misiones del día.
  // El día lo trae getPetCounts: pedir `todayISO()` otra vez podría dar otro día
  // en la misma petición si el render cruza la medianoche.
  const preSyncAttributes = deriveAttributes(counts);
  const [sync, earned] = await Promise.all([
    syncDailyMissions(supabase, userId, {
      today,
      primary: CLASS_PRIMARY[pet.class],
      attributes: preSyncAttributes,
      eligibility,
      days,
    }),
    // Los logros ya ganados no dependen del sync: mismo viaje, no dos seguidos.
    supabase
      .from("user_celebrations")
      .select("event_key, first_triggered_at")
      .eq("user_id", userId)
      .eq("event_type", "pet_achievement"),
  ]);
  if (earned.error) throw earned.error;
  const { missions, completedNow } = sync;

  for (const m of sync.justCompleted) {
    counts.missionXp[MISSION_ATTR[m.template]] += m.xp;
    counts.missionsCompleted += 1;
  }
  const attributes = deriveAttributes(counts);
  const xp = xpFor(attributes, pet.class);
  const level = levelFor(xp);
  const stage = stageFor(level, hasActivitySinceHatch);
  const mood = moodFor(lastActivityISO ? daysBetweenISO(lastActivityISO, today) : null);

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

  // Logros: solo se gana lo NUEVO (ninguna escritura en una visita sin novedades).
  const earnedRows = earned.data ?? [];
  const earnedAt = new Map<string, string>();
  for (const r of earnedRows) {
    const id = r.event_key.replace(/^pet_achievement:/, "");
    if (isAchievementId(id)) earnedAt.set(id, r.first_triggered_at);
  }
  // Volcado inicial: la mascota se deriva de un historial que YA existía, así
  // que la primera visita desbloquea de golpe todo lo que el usuario llevaba
  // ganado desde hace meses. Animarlo sería una avalancha de celebraciones de
  // hitos viejos, así que ese primer lote se gana YA MOSTRADO (displayed_at) y
  // no pide drenado: queda el rastro y la fecha en la galería, sin fuegos
  // artificiales. Coste asumido: si el PRIMER logro de la vida de un usuario se
  // desbloquea con la tabla aún vacía, ese tampoco se anima (pasa una vez).
  const backfill = earnedRows.length === 0;
  const progressList = achievementProgress(counts, level);
  const newlyUnlocked = progressList.filter((a) => a.unlocked && !earnedAt.has(a.id));
  if (newlyUnlocked.length > 0) {
    const now = new Date().toISOString();
    // earnCelebration nunca lanza (best-effort), así que Promise.all no puede
    // dejar a medias el resto: se ganan en paralelo, no una detrás de otra.
    await Promise.all(
      newlyUnlocked.map((a) =>
        earnCelebration(
          supabase,
          userId,
          { event: "pet_achievement", key: a.id, metadata: { threshold: a.threshold } },
          { alreadyDisplayed: backfill },
        ),
      ),
    );
    for (const a of newlyUnlocked) earnedAt.set(a.id, now);
  }
  const achievementsUnlockedNow = !backfill && newlyUnlocked.length > 0;
  const achievements: AchievementView[] = progressList.map((a) => ({ ...a, unlockedAt: earnedAt.get(a.id) ?? null }));

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
    missions,
    achievements,
    missionsCompletedNow: completedNow,
    achievementsUnlockedNow,
  };
}
