import { BALANCE } from "../balance";
import type { PetAttribute } from "../classes";

// Una plantilla por línea, sin lógica (spec fase 2 §1.1). Los números viven
// en BALANCE; la XP se deriva de los pesos orgánicos: una misión duplica lo que
// la acción ya da, nunca más.
export const MISSION_TEMPLATES = [
  "rating",
  "vote",
  "new_work",
  "any_activity",
  "session_minutes",
  "note",
  "quote",
  "post",
  "session_pages",
  "daily_goal",
  "episodes",
  "review",
  "finish_pass",
] as const;

export type MissionTemplate = (typeof MISSION_TEMPLATES)[number];
export type MissionCost = "light" | "medium" | "hard";

export function isMissionTemplate(s: string): s is MissionTemplate {
  return (MISSION_TEMPLATES as readonly string[]).includes(s);
}

export const MISSION_ATTR: Record<MissionTemplate, PetAttribute> = {
  rating: "SAB",
  vote: "CAR",
  new_work: "DES",
  any_activity: "CON",
  session_minutes: "FUE",
  note: "SAB",
  quote: "SAB",
  post: "CAR",
  session_pages: "FUE",
  daily_goal: "CON",
  episodes: "FUE",
  review: "SAB",
  finish_pass: "INT",
};

export const MISSION_COST: Record<MissionTemplate, MissionCost> = {
  rating: "light",
  vote: "light",
  new_work: "light",
  any_activity: "light",
  session_minutes: "light",
  note: "medium",
  quote: "medium",
  post: "medium",
  session_pages: "medium",
  daily_goal: "medium",
  episodes: "medium",
  review: "hard",
  finish_pass: "hard",
};

/** Objetivo de la plantilla. `daily_goal` copia el objetivo del perfil (minutos). */
export function missionTarget(t: MissionTemplate, dailyGoal: number | null): number {
  const T = BALANCE.missions.targets;
  switch (t) {
    case "session_minutes":
      return T.session_minutes;
    case "session_pages":
      return T.session_pages;
    case "episodes":
      return T.episodes;
    case "daily_goal":
      return Math.max(1, dailyGoal ?? 1);
    default:
      return 1;
  }
}

/** XP de la misión = la orgánica que ya da la acción (spec §1.1). */
export function missionXp(t: MissionTemplate): number {
  const B = BALANCE;
  const T = B.missions.targets;
  switch (t) {
    case "rating":
      return B.SAB.perRating;
    case "vote":
      return B.CAR.perVote;
    case "new_work":
      return B.DES.perNewWork;
    case "any_activity":
      return B.CON.perActiveDay;
    case "session_minutes":
      return Math.floor(T.session_minutes / 10) * B.FUE.perSessionUnit;
    case "note":
      return B.SAB.perNote;
    case "quote":
      return B.SAB.perQuote;
    case "post":
      return B.CAR.perPost;
    case "session_pages":
      return Math.floor(T.session_pages / 10) * B.FUE.perSessionUnit;
    case "daily_goal":
      return B.CON.perDailyGoalDay;
    case "episodes":
      return T.episodes * B.FUE.perEpisode;
    case "review":
      return B.SAB.perReview;
    case "finish_pass":
      return B.INT.perFinishedPass;
  }
}
