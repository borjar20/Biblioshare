import type { Lens } from "@/lib/sagas/atlas/layout";
import type { AtlasWork } from "@/lib/sagas/atlas/model";
import type { SagaItemRole } from "@/lib/sagas/roles";

/** Opacidad de cada fuente de atenuación del atlas (spec 2026-10-28 §5.2). */
export const DIM = { role: 0.35, offRoute: 0.3, todo: 0.4, skipped: 0.3 } as const;

/** Atenuación de una obra, en un solo sitio: la opacidad final es el MÍNIMO de las fuentes
 *  (resaltado de `?rol=`, obra fuera del itinerario y estado con la capa Progreso), no su
 *  producto ni una cascada de reglas CSS. `filtered` dice si la atenúa un filtro (rol o
 *  itinerario): es lo que marca `data-dimmed`; el estado del lector no cuenta como filtro. */
export function workDim(
  w: Pick<AtlasWork, "role" | "step" | "state" | "skipped">,
  layers: { lens: Lens; role: SagaItemRole | null; hasItinerary: boolean; progress: boolean },
): { opacity: number; filtered: boolean } {
  const byRole = layers.lens === "rol" && layers.role !== null && w.role !== layers.role;
  const offRoute = layers.hasItinerary && w.step === null;
  const sources = [
    byRole ? DIM.role : 1,
    offRoute ? DIM.offRoute : 1,
    layers.progress && w.skipped ? DIM.skipped : 1,
    layers.progress && !w.skipped && w.state === "todo" ? DIM.todo : 1,
  ];
  return { opacity: Math.min(...sources), filtered: byRole || offRoute };
}
