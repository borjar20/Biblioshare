import { describe, expect, it, vi } from "vitest";
import { runImportBatches, BATCH_SIZE } from "./run-batches";
import type { ImportRow, ImportRowResult } from "./types";

const fila = (n: number): ImportRow => ({
  rowNumber: n,
  title: `T${n}`,
  author: null,
  isbn: null,
  publisher: null,
  pageCount: null,
  year: null,
  status: "completed",
  rating: null,
  bookFormat: null,
  diaryDates: [],
  unknownStatusLabel: null,
});

const okCommit = async (
  _t: unknown,
  rows: ImportRow[],
): Promise<ImportRowResult[]> =>
  rows.map((r) => ({
    rowNumber: r.rowNumber,
    title: r.title,
    outcome: "imported" as const,
  }));

describe("runImportBatches", () => {
  it("trocea en lotes de BATCH_SIZE", async () => {
    const tamanos: number[] = [];
    await runImportBatches(
      "book",
      Array.from({ length: 45 }, (_, i) => fila(i + 1)),
      async (t, rows) => {
        tamanos.push(rows.length);
        return okCommit(t, rows);
      },
    );
    // 45 filas con BATCH_SIZE 20 -> 20, 20, 5.
    expect(tamanos).toEqual([BATCH_SIZE, BATCH_SIZE, 5]);
  });

  it("acumula los resultados en orden de fichero", async () => {
    const out = await runImportBatches(
      "book",
      Array.from({ length: 45 }, (_, i) => fila(i + 1)),
      okCommit,
    );
    expect(out).toHaveLength(45);
    expect(out[0].rowNumber).toBe(1);
    expect(out[44].rowNumber).toBe(45);
  });

  it("informa del progreso una vez por lote, acumulado", async () => {
    const progreso: number[] = [];
    await runImportBatches(
      "book",
      Array.from({ length: 45 }, (_, i) => fila(i + 1)),
      okCommit,
      (n) => progreso.push(n),
    );
    expect(progreso).toEqual([20, 40, 45]);
  });

  it("con cero filas no llama al servidor", async () => {
    const commit = vi.fn();
    const out = await runImportBatches("book", [], commit);
    expect(commit).not.toHaveBeenCalled();
    expect(out).toEqual([]);
  });
});
