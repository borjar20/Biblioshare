import Papa from "papaparse";
import type { ImportRow } from "./types";

function parseYear(raw: string): number | null {
  const year = Number(raw.trim());
  return Number.isInteger(year) && year > 0 ? year : null;
}

// Letterboxd rating is 0.5-5 in half-star steps — the same *2 conversion as
// Goodreads' 0-5 stars lands both on the internal 1-10 integer scale.
function parseRating(raw: string): number | null {
  const value = Number(raw.trim());
  return Number.isFinite(value) && value > 0 ? Math.round(value * 2) : null;
}

type Accumulated = {
  row: ImportRow;
  /** Fecha del visionado más reciente que traía nota, para quedarnos con esa. */
  latestRatedOn: string | null;
};

/**
 * Espera el export "diary.csv" (no watched.csv/ratings.csv): es el único con
 * fecha por visionado, que es lo que permite reconstruir los revisionados.
 *
 * En ese fichero **cada visionado es su propia fila**, así que una película
 * vista tres veces aparece tres veces. Aquí se AGRUPAN en una sola `ImportRow`
 * con sus tres fechas en `diaryDates`, que es la forma que `commit-row.ts`
 * espera: el pase activo se queda con la fecha más reciente y el resto entran
 * como pases históricos cerrados.
 *
 * Sin agrupar, cada visionado llegaba suelto con UNA fecha y **los revisionados
 * se perdían**: el insert del pase activo chocaba con `passes_one_active`, y esa
 * fecha acababa descartada en `addHistoricalPasses` porque era justamente la que
 * se marcaba para saltar. De paso, agrupar hace el matching (búsqueda local +
 * TMDB) una vez por película en lugar de una por visionado.
 */
export function parseLetterboxd(csvText: string): ImportRow[] {
  const { data } = Papa.parse<Record<string, string | undefined>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  // La clave es título + año: dos películas homónimas de años distintos ("Dune"
  // de 1984 y la de 2021) son obras distintas y no deben fundirse.
  const byWork = new Map<string, Accumulated>();

  data.forEach((raw, index) => {
    const title = (raw["Name"] ?? "").trim();
    const watchedOn = (raw["Watched Date"] ?? raw["Date"] ?? "").trim();
    if (!title || !watchedOn) return;

    const year = parseYear(raw["Year"] ?? "");
    const rating = parseRating(raw["Rating"] ?? "");
    const key = `${title.toLowerCase()}::${year ?? ""}`;
    const existing = byWork.get(key);

    if (!existing) {
      byWork.set(key, {
        row: {
          rowNumber: index + 2,
          title,
          author: null,
          isbn: null,
          publisher: null,
          pageCount: null,
          year,
          status: "completed",
          rating,
          bookFormat: null,
          diaryDates: [{ startedOn: null, finishedOn: watchedOn }],
          unknownStatusLabel: null,
        },
        latestRatedOn: rating === null ? null : watchedOn,
      });
      return;
    }

    existing.row.diaryDates.push({ startedOn: null, finishedOn: watchedOn });

    // La nota de la obra es la del visionado más reciente QUE TRAIGA NOTA: un
    // revisionado sin puntuar no debe borrar la valoración que ya tenías.
    if (
      rating !== null &&
      (existing.latestRatedOn === null || watchedOn > existing.latestRatedOn)
    ) {
      existing.row.rating = rating;
      existing.latestRatedOn = watchedOn;
    }
  });

  // Orden ascendente para que `mostRecentDate` (commit-row.ts) reciba las fechas
  // de forma estable, sin depender del orden del fichero.
  const rows = [...byWork.values()].map((acc) => acc.row);
  for (const row of rows) {
    row.diaryDates.sort((a, b) => a.finishedOn.localeCompare(b.finishedOn));
  }
  return rows;
}
