// Avisos push de la mascota (spec 2026-09-02-mascota-avisos-push §1 y §4).
// `kind` es lo que guarda pet_nudges y devuelve claim_pet_nudges(); el tipo de
// push es su etiqueta en el data payload (SW y FCM). NO entran en el enum
// notification_type: nunca se inserta una fila en `notifications`.
export const PET_NUDGE_KINDS = ["streak_at_risk", "mood_sleepy", "mood_sad"] as const;
export type PetNudgeKind = (typeof PET_NUDGE_KINDS)[number];

export type PetNudgeType = "pet_streak_at_risk" | "pet_mood_sleepy" | "pet_mood_sad";

export const PET_NUDGE_TYPE: Record<PetNudgeKind, PetNudgeType> = {
  streak_at_risk: "pet_streak_at_risk",
  mood_sleepy: "pet_mood_sleepy",
  mood_sad: "pet_mood_sad",
};

export function isPetNudgeKind(v: unknown): v is PetNudgeKind {
  return typeof v === "string" && (PET_NUDGE_KINDS as readonly string[]).includes(v);
}
