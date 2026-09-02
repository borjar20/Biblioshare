import { BALANCE } from "./balance";
import {
  CLASS_PRIMARY,
  PET_ATTRIBUTES,
  PET_CLASSES,
  type PetAttribute,
  type PetAttributes,
  type PetClass,
  type PetMood,
  type PetStage,
} from "./classes";
import type { PetCounts } from "./counts";

// Funciones PURAS (spec §3-4). Sin Supabase, sin fechas del sistema: quien las
// llama trae contadores y días. Es lo que hace que los tests las fijen entera.

export function deriveAttributes(c: PetCounts): PetAttributes {
  const B = BALANCE;
  return {
    FUE: c.sessionUnits * B.FUE.perSessionUnit + c.episodes * B.FUE.perEpisode,
    CON:
      c.activeDays * B.CON.perActiveDay +
      c.dailyGoalDays * B.CON.perDailyGoalDay +
      c.streakMilestones * B.CON.perStreakMilestone,
    INT:
      c.finishedPasses * B.INT.perFinishedPass +
      c.completedSagas * B.INT.perCompletedSaga +
      c.distinctGenres * B.INT.perDistinctGenre,
    SAB:
      c.notes * B.SAB.perNote +
      c.quotes * B.SAB.perQuote +
      c.reviews * B.SAB.perReview +
      c.ratings * B.SAB.perRating,
    CAR:
      c.posts * B.CAR.perPost +
      c.votes * B.CAR.perVote +
      c.polls * B.CAR.perPoll +
      c.events * B.CAR.perEvent +
      c.follows * B.CAR.perFollow,
    DES:
      c.newWorks * B.DES.perNewWork +
      c.newAuthors * B.DES.perNewAuthor +
      Math.min(c.importedRows, B.DES.importedRowCap) * B.DES.perImportedRow,
  };
}

/** XP total: suma de atributos con el primario de la clase multiplicado. */
export function xpFor(attrs: PetAttributes, cls: PetClass): number {
  const primary = CLASS_PRIMARY[cls];
  let xp = 0;
  for (const key of PET_ATTRIBUTES) {
    xp += key === primary ? attrs[key] * BALANCE.classBonus : attrs[key];
  }
  return Math.round(xp);
}

export function levelFor(xp: number): number {
  if (xp <= 0) return 1;
  return Math.floor(Math.sqrt(xp / BALANCE.level.divisor)) + 1;
}

/** XP mínima para ESTAR en `level`. Inversa de levelFor; para la barra. */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return (level - 1) ** 2 * BALANCE.level.divisor;
}

export function stageFor(level: number, hasActivitySinceHatch: boolean): PetStage {
  if (!hasActivitySinceHatch) return "acorn";
  if (level >= BALANCE.stages.veteran) return "veteran";
  if (level >= BALANCE.stages.adult) return "adult";
  return "young";
}

/** `null` = nunca ha habido actividad: ni contenta ni triste, normal. */
export function moodFor(daysSinceActivity: number | null): PetMood {
  if (daysSinceActivity == null) return "neutral";
  if (daysSinceActivity >= BALANCE.mood.sadFrom) return "sad";
  if (daysSinceActivity >= BALANCE.mood.sleepyFrom) return "sleepy";
  if (daysSinceActivity >= BALANCE.mood.neutralFrom) return "neutral";
  return "happy";
}

/** Clase cuyo atributo primario domina. Empate: la primera de PET_CLASSES. */
export function suggestClass(attrs: PetAttributes): PetClass | null {
  let best: PetClass | null = null;
  let bestValue = 0;
  for (const cls of PET_CLASSES) {
    const value = attrs[CLASS_PRIMARY[cls]];
    if (value > bestValue) {
      best = cls;
      bestValue = value;
    }
  }
  return best;
}

export type { PetAttribute };
