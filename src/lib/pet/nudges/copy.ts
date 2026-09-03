import type { PetNudgeKind } from "./types";

/** `t` es la de `getTranslations("pet")`: se inyecta para que esto sea puro. */
export type NudgeT = (key: string, values?: Record<string, string | number>) => string;

// Cuerpo del push (spec §3). El título es el nombre de la mascota y lo pone
// quien envía; aquí solo el cuerpo.
export function petNudgeCopy(kind: PetNudgeKind, streak: number | null, t: NudgeT): { body: string } {
  switch (kind) {
    case "streak_at_risk":
      return { body: t("nudges.streakAtRisk", { n: streak ?? 0 }) };
    case "mood_sleepy":
      return { body: t("nudges.sleepy") };
    case "mood_sad":
      return { body: t("nudges.sad") };
  }
}
