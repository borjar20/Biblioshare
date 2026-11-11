// src/lib/passes/pass-actions.ts
import type { ItemType } from "@/lib/catalog/types";
import type { MediaStatus } from "@/lib/library/types";

// Qué se ofrece en la ficha (spec 2026-11-10). Puro: los textos viven en
// messages/es.json → item.intent.* e item.action.*.

export type Intent = "want" | "started" | "done";

// Una película se ve de una sentada: no tiene «la estoy viendo».
export function intentsFor(itemType: ItemType): Intent[] {
  return itemType === "movie" ? ["want", "done"] : ["want", "started", "done"];
}

const INTENT_STATUS: Record<Intent, MediaStatus> = {
  want: "planned",
  started: "in_progress",
  done: "completed",
};

export function intentStatus(intent: Intent): MediaStatus {
  return INTENT_STATUS[intent];
}

export type PrimaryAction = "start" | "session" | "episode" | "watched" | "again" | "resume";

export function primaryAction(itemType: ItemType, status: MediaStatus): PrimaryAction {
  if (status === "completed") return "again";
  if (status === "dropped") return "resume";
  if (itemType === "movie") return "watched";
  if (itemType === "series") return "episode";
  return status === "planned" ? "start" : "session";
}
