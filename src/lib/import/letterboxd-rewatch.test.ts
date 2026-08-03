import { describe, it, expect, vi } from "vitest";
import { commitImportRow } from "./commit-row";
import { parseLetterboxd } from "./parse-letterboxd";
import type { ImportRow } from "./types";

vi.mock("./match-row", () => ({
  matchImportRow: vi
    .fn()
    .mockResolvedValue({ kind: "matched", catalogId: "catalog-item-1" }),
}));

// Fake de Supabase que SÍ simula el índice `passes_one_active`
// (user_id, item_type, item_id) WHERE is_active: el segundo intento de crear un
// pase activo para la misma obra choca con 23505, como en producción.
//
// `existingByDate` permite arrancar con pases ya en BD, para el caso de
// REIMPORTAR un CSV sobre una biblioteca que ya tiene historial.
function createFakeSupabase(existingByDate: string[] = []) {
  const insertedRows: Record<string, unknown>[] = [];
  const activeKeys = new Set<string>();
  const datesInDb = new Set<string>(existingByDate);
  if (existingByDate.length > 0) activeKeys.add("u1:movie:catalog-item-1");

  const client = {
    from() {
      return {
        insert(payload: Record<string, unknown>) {
          if (payload.is_active === true) {
            const key = `${payload.user_id}:${payload.item_type}:${payload.item_id}`;
            if (activeKeys.has(key)) {
              return {
                select: () => ({
                  async single() {
                    return {
                      data: null,
                      error: { code: "23505", message: "duplicate key" },
                    };
                  },
                }),
              };
            }
            activeKeys.add(key);
            insertedRows.push(payload);
            if (typeof payload.finished_on === "string") datesInDb.add(payload.finished_on);
            return {
              select: () => ({
                async single() {
                  return { data: { id: "active-1" }, error: null };
                },
              }),
            };
          }
          insertedRows.push(payload);
          if (typeof payload.finished_on === "string") datesInDb.add(payload.finished_on);
          return Promise.resolve({ data: null, error: null });
        },
        select() {
          let askedDate: string | null = null;
          const builder = {
            eq(column: string, value: string) {
              if (column === "finished_on") askedDate = value;
              return builder;
            },
            // Reconciliación tras el 23505: el pase activo ya existe.
            async single() {
              return { data: { id: "active-1" }, error: null };
            },
            // "¿ya hay un pase con este finished_on?" — lo que hace idempotente
            // reimportar el mismo fichero.
            async maybeSingle() {
              return {
                data: askedDate && datesInDb.has(askedDate) ? { id: "existing" } : null,
                error: null,
              };
            },
          };
          return builder;
        },
      };
    },
  };

  return { client, insertedRows };
}

const fila = (finishedOn: string | string[], rowNumber = 1): ImportRow => ({
  rowNumber,
  title: "Dune",
  author: null,
  isbn: null,
  publisher: null,
  pageCount: null,
  year: 2021,
  status: "completed",
  rating: 8,
  bookFormat: null,
  diaryDates: (Array.isArray(finishedOn) ? finishedOn : [finishedOn]).map((f) => ({
    startedOn: null,
    finishedOn: f,
  })),
  unknownStatusLabel: null,
});

describe("Letterboxd: revisionados de la misma película", () => {
  it("el parser AGRUPA los visionados en una sola fila con todas sus fechas", () => {
    const csv = [
      "Date,Name,Year,Letterboxd URI,Rating,Watched Date",
      // Escala Letterboxd (0,5-5); parseRating la lleva a la interna 1-10 (x2).
      "2024-01-02,Dune,2021,https://x,4,2024-01-02",
      "2025-05-06,Dune,2021,https://x,4.5,2025-05-06",
      "2023-02-02,Otra,2019,https://y,3,2023-02-02",
    ].join("\n");

    const rows = parseLetterboxd(csv);

    expect(rows).toHaveLength(2);
    const dune = rows.find((r) => r.title === "Dune")!;
    expect(dune.diaryDates.map((d) => d.finishedOn)).toEqual(["2024-01-02", "2025-05-06"]);
    // La nota del visionado MÁS RECIENTE es la que queda como nota de la obra.
    expect(dune.rating).toBe(9);
  });

  it("una película con el mismo título pero distinto año NO se agrupa", () => {
    const csv = [
      "Date,Name,Year,Letterboxd URI,Rating,Watched Date",
      "2024-01-02,Dune,1984,https://x,3,2024-01-02",
      "2025-05-06,Dune,2021,https://x,4.5,2025-05-06",
    ].join("\n");

    expect(parseLetterboxd(csv)).toHaveLength(2);
  });

  it("importar una fila agrupada deja el activo con la fecha más reciente y un histórico con la otra", async () => {
    const { client, insertedRows } = createFakeSupabase();

    const result = await commitImportRow(
      client as never,
      "u1",
      "movie",
      fila(["2024-01-02", "2025-05-06"]),
    );

    expect(result.outcome).toBe("imported");
    expect(insertedRows).toHaveLength(2);

    const activo = insertedRows.find((r) => r.is_active === true)!;
    const historico = insertedRows.find((r) => r.is_active === false)!;
    expect(activo.finished_on).toBe("2025-05-06");
    expect(historico.finished_on).toBe("2024-01-02");
  });

  it("REIMPORTAR con un visionado nuevo lo añade, en vez de descartarlo", async () => {
    // La biblioteca ya tiene el pase activo del primer visionado.
    const { client, insertedRows } = createFakeSupabase(["2024-01-02"]);

    const result = await commitImportRow(
      client as never,
      "u1",
      "movie",
      fila(["2024-01-02", "2025-05-06"]),
    );

    expect(result.outcome).toBe("duplicate");
    // La fecha que ya estaba NO se duplica; la nueva SÍ entra.
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0].finished_on).toBe("2025-05-06");
    expect(insertedRows[0].is_active).toBe(false);
  });

  it("reimportar SIN novedades no inserta nada", async () => {
    const { client, insertedRows } = createFakeSupabase(["2024-01-02", "2025-05-06"]);

    await commitImportRow(client as never, "u1", "movie", fila(["2024-01-02", "2025-05-06"]));

    expect(insertedRows).toHaveLength(0);
  });
});
