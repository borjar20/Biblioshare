import type { ItemType } from "@/lib/catalog/types";
import type { Edition } from "./types";

function runtime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

// Una línea legible para una edición: "Bolsillo · DeBolsillo · 880 p".
export function formatEdition(edition: Edition, itemType: ItemType): string {
  const parts = [edition.label];
  if (edition.publisher) parts.push(edition.publisher);
  if (edition.totalUnits !== null) {
    parts.push(itemType === "movie" ? runtime(edition.totalUnits) : `${edition.totalUnits} p`);
  }
  return parts.join(" · ");
}

export function primaryEdition(editions: Edition[]): Edition | null {
  return editions.find((e) => e.isPrimary) ?? null;
}
