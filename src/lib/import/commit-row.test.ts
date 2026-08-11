import { describe, it, expect, vi, beforeEach } from "vitest";
import { commitImportRow } from "./commit-row";
import type { ImportRow } from "./types";

// commit-row.ts delega el matching de catálogo a match-row.ts (búsquedas
// locales + APIs externas, OpenLibrary/TMDB) — irrelevante para lo que este
// test comprueba (la forma de los pases que se insertan), así que se stubea
// para devolver siempre el mismo catalogId y poder centrarse en
// addHistoricalPasses/ensureActivePass.
vi.mock("./match-row", () => ({
  matchImportRow: vi
    .fn()
    .mockResolvedValue({ kind: "matched", catalogId: "catalog-item-1" }),
}));

// Fake mínimo del query builder de Supabase, suficiente para el flujo real de
// commit-row.ts: un insert().select("id").single() para el pase activo (que
// SIEMPRE tiene éxito aquí, sin violación de unicidad) y, por cada fecha
// histórica, un select().eq()...maybeSingle() de "ya existe" (siempre "no")
// seguido de un insert() sin encadenar select — se espera directamente (el
// insert de Supabase es awaitable por sí mismo).
function createFakeSupabase() {
  const insertedRows: Record<string, unknown>[] = [];
  let activeIdCounter = 0;

  const client = {
    from(_table: string) {
      return {
        insert(payload: Record<string, unknown>) {
          insertedRows.push(payload);
          if (payload.is_active === true) {
            // Pase activo: se encadena .select("id").single().
            return {
              select() {
                return {
                  async single() {
                    activeIdCounter++;
                    return { data: { id: `active-${activeIdCounter}` }, error: null };
                  },
                };
              },
            };
          }
          // Pase histórico: se espera el insert directamente, sin encadenar.
          return Promise.resolve({ data: null, error: null });
        },
        select() {
          // Usado tanto por la comprobación de "¿ya existe pase histórico con
          // este finished_on?" (addHistoricalPasses, termina en maybeSingle)
          // como por la reconciliación de unique-violation en
          // ensureActivePass (termina en single) — en este test ninguna rama
          // encuentra nada existente.
          const builder = {
            eq() {
              return builder;
            },
            async single() {
              return { data: null, error: { code: "PGRST116", message: "not found" } };
            },
            async maybeSingle() {
              return { data: null, error: null };
            },
          };
          return builder;
        },
      };
    },
  };

  return { client, insertedRows };
}

function baseRow(overrides: Partial<ImportRow> = {}): ImportRow {
  return {
    rowNumber: 1,
    title: "Dune",
    author: "Frank Herbert",
    isbn: "9780441172719",
    publisher: null,
    pageCount: null,
    year: null,
    status: "completed",
    rating: 8,
    bookFormat: null,
    diaryDates: [],
    unknownStatusLabel: null,
    ...overrides,
  };
}

describe("commitImportRow — pases históricos e importación con relecturas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("backdatea created_at de cada pase histórico a su fecha real; solo el activo nace con created_at de ahora", async () => {
    const { client, insertedRows } = createFakeSupabase();
    const row = baseRow({
      diaryDates: [
        { startedOn: "2019-01-01", finishedOn: "2019-01-20" },
        { startedOn: "2021-06-01", finishedOn: "2021-06-15" },
        { startedOn: "2023-03-01", finishedOn: "2023-03-10" },
        // La más reciente: ES el pase activo (mismo criterio que
        // mostRecentDate en commit-row.ts), no un histórico aparte.
        { startedOn: "2026-07-01", finishedOn: "2026-07-10" },
      ],
    });

    const result = await commitImportRow(
      client as never,
      "user-1",
      "book",
      row
    );

    expect(result.outcome).toBe("imported");

    // 1 pase activo + 3 históricos (la 4ª fecha, la más reciente, la absorbe
    // el activo — no se duplica).
    expect(insertedRows).toHaveLength(4);

    const activeRows = insertedRows.filter((r) => r.is_active === true);
    const historicalRows = insertedRows.filter((r) => r.is_active === false);
    expect(activeRows).toHaveLength(1);
    expect(historicalRows).toHaveLength(3);

    // El activo no lleva created_at propio: se deja el default de columna
    // (now()) — coherente con "un pase de importación activo emite
    // exactamente un evento 'added', igual que antes de la Tarea 9".
    expect(activeRows[0]!.created_at).toBeUndefined();

    // Cada histórico backdatea created_at a SU finished_on real, no a "ahora".
    const historicalCreatedAts = historicalRows.map((r) => r.created_at).sort();
    expect(historicalCreatedAts).toEqual(["2019-01-20", "2021-06-15", "2023-03-10"]);

    // Solo UNA fila (el activo) queda sin created_at explícito — el resto no
    // debe colarse en el feed de "añadido reciente" (feed.ts ordena/pagina
    // addedResult por created_at; ver commit-row.ts para el razonamiento).
    const rowsWithoutExplicitCreatedAt = insertedRows.filter((r) => r.created_at === undefined);
    expect(rowsWithoutExplicitCreatedAt).toHaveLength(1);
  });

  it("una relectura orgánica (sin importación) no pasa por aquí: un solo pase, sin diaryDates extra, nace con created_at de ahora", async () => {
    const { client, insertedRows } = createFakeSupabase();
    const row = baseRow({
      diaryDates: [{ startedOn: "2026-07-10", finishedOn: "2026-07-15" }],
    });

    await commitImportRow(client as never, "user-1", "book", row);

    // Una sola fecha en el CSV: es la del activo, no genera histórico extra.
    expect(insertedRows).toHaveLength(1);
    expect(insertedRows[0]!.is_active).toBe(true);
    expect(insertedRows[0]!.created_at).toBeUndefined();
  });
});
