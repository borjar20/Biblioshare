import { describe, expect, it } from "vitest";
import { computeLibraryHealth } from "./get-library-health";

const NOW = new Date(2026, 6, 17); // 17 de julio de 2026, hora local

type Row = Parameters<typeof computeLibraryHealth>[0][number];

function pass(over: Partial<Row> = {}): Row {
  return {
    item_type: "book",
    status: "completed",
    is_active: false,
    created_at: "2026-01-10T10:00:00Z",
    finished_on: "2026-02-01",
    ...over,
  };
}

describe("computeLibraryHealth", () => {
  it("las tasas se calculan sobre lo CERRADO, no sobre la biblioteca entera", () => {
    const rows = [
      pass(),
      pass(),
      pass(),
      pass({ status: "dropped", finished_on: null }),
      // Los pendientes NO entran en el denominador: si entraran, añadir un
      // libro bajaría la tasa sin haber dejado nada a medias.
      pass({ status: "planned", is_active: true, finished_on: null }),
      pass({ status: "in_progress", is_active: true, finished_on: null }),
    ];
    const h = computeLibraryHealth(rows, "all", NOW);
    expect(h.completionRate).toBe(75);
    expect(h.dropRate).toBe(25);
  });

  it("sin nada cerrado no se inventa un 0 %: es «sin datos»", () => {
    const rows = [pass({ status: "planned", is_active: true, finished_on: null })];
    expect(computeLibraryHealth(rows, "all", NOW).completionRate).toBeNull();
  });

  it("la espera mediana solo mira los pendientes ACTIVOS", () => {
    const rows = [
      pass({ status: "planned", is_active: true, finished_on: null, created_at: "2026-05-01T00:00:00Z" }), // 2 meses
      pass({ status: "planned", is_active: true, finished_on: null, created_at: "2026-01-01T00:00:00Z" }), // 6 meses
      pass({ status: "planned", is_active: true, finished_on: null, created_at: "2025-07-01T00:00:00Z" }), // 12 meses
      // Un pendiente NO activo es historia, no pila.
      pass({ status: "planned", is_active: false, finished_on: null, created_at: "2020-01-01T00:00:00Z" }),
    ];
    expect(computeLibraryHealth(rows, "all", NOW).medianWaitMonths).toBe(6);
  });

  it("el balance del periodo cuenta altas y cierres DENTRO de la ventana", () => {
    const rows = [
      pass({ created_at: "2026-07-02T00:00:00Z", finished_on: "2026-07-10" }), // entra y sale
      pass({ created_at: "2026-07-05T00:00:00Z", finished_on: null, status: "planned", is_active: true }), // solo entra
      pass({ created_at: "2025-01-01T00:00:00Z", finished_on: "2026-07-08" }), // solo sale
      pass({ created_at: "2024-01-01T00:00:00Z", finished_on: "2024-02-01" }), // ni una cosa ni otra
    ];
    const h = computeLibraryHealth(rows, "month", NOW);
    expect(h.added).toBe(2);
    expect(h.finished).toBe(2);
  });

  it("la curva de la pila deja fuera las abandonadas en toda la serie", () => {
    // Sin fecha de abandono en el esquema, incluirla la dejaría abierta para
    // siempre y la curva subiría sola.
    const rows = [
      pass({ created_at: "2026-01-01T00:00:00Z", finished_on: null, status: "planned", is_active: true }),
      pass({ created_at: "2026-01-01T00:00:00Z", finished_on: null, status: "dropped", is_active: false }),
    ];
    const h = computeLibraryHealth(rows, "all", NOW);
    expect(h.backlog).toHaveLength(12);
    expect(h.backlog.at(-1)).toEqual({ month: "2026-07", pending: 1 });
  });

  it("una obra deja de estar abierta el mes en que se termina", () => {
    const rows = [pass({ created_at: "2026-01-05T00:00:00Z", finished_on: "2026-03-20" })];
    const h = computeLibraryHealth(rows, "all", NOW);
    const byMonth = new Map(h.backlog.map((b) => [b.month, b.pending]));
    expect(byMonth.get("2026-02")).toBe(1);
    expect(byMonth.get("2026-03")).toBe(0);
  });
});
