import type { ItemType } from "@/lib/catalog/types";
import type { ImportRow, ImportRowResult } from "./types";

// Tamaño del lote que el CLIENTE manda por llamada. El servidor procesa 5 filas
// en paralelo DENTRO de cada lote (BATCH_CONCURRENCY en actions.ts). Devolver
// tras cada lote es lo que mantiene cada invocación holgada bajo el timeout y
// permite pintar la barra.
export const BATCH_SIZE = 20;

export type CommitBatch = (
  itemType: ItemType,
  rows: ImportRow[],
) => Promise<ImportRowResult[]>;

/**
 * El bucle de lotes de una importación. PURO a propósito (sin React): lo
 * comparten la pantalla completa de `/importar` y el panel del onboarding, y
 * así el troceo se puede probar con vitest en entorno node — que es el que usa
 * el proyecto, sin jsdom ni testing-library.
 *
 * `onProgress` recibe el acumulado tras CADA lote, no el total al final: es lo
 * que alimenta la barra de progreso.
 */
export async function runImportBatches(
  itemType: ItemType,
  rows: ImportRow[],
  commit: CommitBatch,
  onProgress?: (processed: number) => void,
): Promise<ImportRowResult[]> {
  const collected: ImportRowResult[] = [];

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    const chunkResults = await commit(itemType, chunk);
    collected.push(...chunkResults);
    onProgress?.(i + chunk.length);
  }

  return collected;
}
