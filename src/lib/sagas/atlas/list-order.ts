import { SAGA_ITEM_ROLES } from "../roles";
import type { Lens } from "./layout";
import type { AtlasWork } from "./model";

// Orden de «Ver como lista» (spec 2026-10-28 §8): el de la lente activa, para que la lista
// cuente lo mismo que el plano. Puro; no reordena la entrada.
const LANES: readonly string[] = ["principal", ...SAGA_ITEM_ROLES];
const lane = (w: AtlasWork) => LANES.indexOf(w.role ?? "principal");

export function listOrder(works: readonly AtlasWork[], lens: Lens): AtlasWork[] {
  const byReading = (a: AtlasWork, b: AtlasWork) => a.readingIndex - b.readingIndex;
  const sorted = [...works];
  if (lens === "rol") return sorted.sort((a, b) => lane(a) - lane(b) || byReading(a, b));
  if (lens === "publicacion") {
    return sorted.sort((a, b) => (a.year ?? Infinity) - (b.year ?? Infinity) || byReading(a, b));
  }
  return sorted.sort(byReading);
}
