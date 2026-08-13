import type { ItemType } from "@/lib/catalog/types";
import { formatPosition, parsePosition } from "@/lib/library/position";
import type { WorkStatus } from "./profile-types";

/**
 * El «por dónde vas» de una obra EN CURSO, para la fila de la filmografía.
 *
 * Hasta hoy la ficha de persona dejaba esto en null a sabiendas (#607) y la fila
 * pintaba «En curso» sin más. El control contextual pide decir dónde vas, y el
 * dato ya viaja: `passes.position`, el jsonb que solo interpreta
 * `src/lib/library/position.ts` — no se duplica aquí esa lectura.
 *
 * Dos decisiones que NO son un olvido:
 *
 * - **Solo en curso.** Un pase terminado o en la cola no tiene «por dónde vas»;
 *   la página guardada de una lectura ya cerrada es ruido.
 * - **El porcentaje solo en libro.** Es el único medio donde hay numerador y
 *   denominador honestos (`position.page` y `books.total_pages`). En serie
 *   haría falta contar `episode_watches` —una consulta más por obra— y la
 *   posición «T2E5» ya dice dónde vas; en película no significa nada. `null` no
 *   es «0%»: es «no se sabe», y quien pinta debe distinguirlo.
 */
export function deriveWorkProgress(
  itemType: ItemType,
  status: WorkStatus | null,
  rawPosition: unknown,
  totalPages: number | null
): { label: string | null; percent: number | null } {
  if (status !== "in_progress") return { label: null, percent: null };

  const position = parsePosition(itemType, rawPosition);
  const label = formatPosition(itemType, position);

  if (itemType !== "book" || !totalPages || totalPages <= 0) return { label, percent: null };
  const page = "page" in position && position.page !== undefined ? position.page : null;
  if (page === null || page <= 0) return { label, percent: null };

  // Los mismos topes que `libraryPercent`: ni 0% habiendo empezado, ni 100%
  // sin haberlo terminado —y ahí «terminado» lo dice el ESTADO, no la página—.
  if (page >= totalPages) return { label, percent: 99 };
  return { label, percent: Math.min(99, Math.max(1, Math.round((page / totalPages) * 100))) };
}
