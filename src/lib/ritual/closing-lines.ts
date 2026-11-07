import type { ItemType } from "@/lib/catalog/types";
import type { ClosingRecap } from "./recap";

// Frase de apertura del cierre (recuento) y variantes de despedida. Puro.
// Texto en messages/es.json → ritual.closing.<key>.
export type ClosingLineKey = "recapBook" | "recapSessions" | "recapSeries" | "movieNight" | "generic";
export type ClosingLine = { key: ClosingLineKey; values: Record<string, string | number> };
export const FAREWELL_VARIANTS = 2;
export const DROPPED_VARIANTS = 2;

function daypart(d: Date): "morning" | "afternoon" | "night" {
  const h = d.getHours();
  if (h >= 6 && h < 14) return "morning";
  if (h >= 14 && h < 21) return "afternoon";
  return "night";
}

export function recapLine(itemType: ItemType, recap: ClosingRecap | null, now: Date, fmt: { weekday(d: Date): string }): ClosingLine {
  if (itemType === "movie") return { key: "movieNight", values: { weekday: fmt.weekday(now), daypart: daypart(now) } };
  if (itemType === "series" && recap?.episodes) return { key: "recapSeries", values: { episodes: recap.episodes, days: Math.max(1, recap.days) } };
  if (!recap || recap.sessions === 0) return { key: "generic", values: { type: itemType } };
  if (recap.pages !== null) {
    return { key: "recapBook", values: { sessions: recap.sessions, days: recap.days, pages: recap.pages, streak: recap.longestStreak } };
  }
  return { key: "recapSessions", values: { sessions: recap.sessions, days: recap.days, streak: recap.longestStreak } };
}
