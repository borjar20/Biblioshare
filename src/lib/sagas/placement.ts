import type { SagaPlacement } from "./types";

/** Un miembro/bloque "colocable": el orden lo recoloca por su ventana
 *  (`saga_placement_windows`) y la ficha le pinta la ventana. Es la MISMA
 *  guarda que la cabecera de place-by-window.ts advierte que no puede vivir
 *  dos veces — por eso vive aquí y no como `=== "libre"` repetido:
 *
 *   - `libre`   → "cuando quieras" (ventana opcional).
 *   - `anclado` → "va aquí", relativo y OBLIGATORIO (ventana es el sentido).
 *
 *  `fijo` (número absoluto) y `null` (sin clasificar) NO se recolocan. */
export function esColocable(placement: SagaPlacement | null): boolean {
  return placement === "libre" || placement === "anclado";
}
