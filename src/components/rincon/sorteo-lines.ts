import type { SorteoItem } from "./sorteo-logic";

// Una frase por candidato (spec «La voz»): el hecho más llamativo, en este orden.
// El texto vive en messages/es.json → sorteo.lines.<key>.<variant>.
export type LineKey = "waitLong" | "tonight" | "miniseries" | "long" | "retry" | "fresh";
export type CandidateLine = {
  key: LineKey;
  variant: number;
  values: { since: string; years: number; duration: string; episodes: number };
};
export const LINE_VARIANTS: Record<LineKey, number> = {
  waitLong: 3, tonight: 2, miniseries: 2, long: 2, retry: 2, fresh: 2,
};

export function monthsBetween(fromISO: string, today: Date): number {
  const from = new Date(fromISO);
  return (today.getUTCFullYear() - from.getUTCFullYear()) * 12 + (today.getUTCMonth() - from.getUTCMonth());
}

function factFor(item: SorteoItem, months: number): LineKey {
  const min = item.estimatedMinutes;
  if (months >= 12) return "waitLong";
  if (item.itemType !== "series" && min !== null && min <= 150) return "tonight";
  if (item.itemType === "series" && item.totalEpisodes !== null && item.totalEpisodes <= 10) return "miniseries";
  if (min !== null && min > 600) return "long";
  return item.fresh ? "fresh" : "retry";
}

export function lineFor(
  item: SorteoItem,
  today: Date,
  fmt: { duration(min: number): string; since(iso: string): string },
  rng: () => number = Math.random
): CandidateLine {
  const months = monthsBetween(item.plannedSince, today);
  const key = factFor(item, months);
  return {
    key,
    variant: Math.min(LINE_VARIANTS[key] - 1, Math.floor(rng() * LINE_VARIANTS[key])),
    values: {
      since: fmt.since(item.plannedSince),
      years: Math.max(1, Math.floor(months / 12)),
      duration: item.estimatedMinutes !== null ? fmt.duration(item.estimatedMinutes) : "",
      episodes: item.totalEpisodes ?? 0,
    },
  };
}
