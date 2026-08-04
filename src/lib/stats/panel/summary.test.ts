import { describe, it, expect } from "vitest";
import { derive } from "./derive";
import { formatDelta, formatShare, formatValue, NO_DATA } from "./format";
import { buildSummary } from "./summary";
import { UNITS, type PanelSpec } from "./types";

function spec(over: Partial<PanelSpec> = {}): PanelSpec {
  return {
    id: "t",
    title: "Prueba",
    context: { period: "2026" },
    viz: "bars",
    unit: UNITS.works,
    data: [],
    ...over,
  };
}

describe("hueco vs cero — la distinción que sostiene todo el sistema", () => {
  it("no cuenta un `null` como cero ni en el total ni en los extremos", () => {
    const d = derive(
      spec({ data: [{ key: "a", label: "A", value: 4 }, { key: "b", label: "B", value: null }] }),
    );
    expect(d.total).toBe(4);
    expect(d.known).toHaveLength(1);
    expect(d.missing).toBe(1);
    // Un solo punto medido: no hay máximo que señalar.
    expect(d.max).toBeNull();
  });

  it("un cero medido SÍ cuenta como dato y puede ser el mínimo", () => {
    const d = derive(
      spec({ data: [{ key: "a", label: "A", value: 4 }, { key: "b", label: "B", value: 0 }] }),
    );
    expect(d.missing).toBe(0);
    expect(d.min?.label).toBe("B");
    expect(d.isEmpty).toBe(false);
  });

  it("todo a cero se lee como «sin actividad», no como panel vacío", () => {
    const s = spec({ data: [{ key: "a", label: "A", value: 0 }, { key: "b", label: "B", value: 0 }] });
    expect(derive(s).isEmpty).toBe(false);
    expect(buildSummary(s)).toBe("Sin actividad: los 2 puntos medidos valen cero.");
  });

  it("sin ningún dato medido devuelve cadena vacía (toca estado vacío)", () => {
    expect(buildSummary(spec({ data: [{ key: "a", label: "A", value: null }] }))).toBe("");
  });

  it("formatea el hueco como texto, jamás como 0", () => {
    expect(formatValue(null, UNITS.minutes)).toBe(NO_DATA);
    expect(formatValue(0, UNITS.minutes)).toBe("0 min");
    expect(formatShare(null, 10)).toBe(NO_DATA);
    // Sin total no hay porcentaje: 0/0 no es «0 %».
    expect(formatShare(3, 0)).toBe(NO_DATA);
  });
});

describe("el resumen se calla cuando el dato no lo sostiene", () => {
  it("con un único punto no inventa máximo ni mínimo", () => {
    const s = spec({ data: [{ key: "a", label: "Enero", value: 5 }] });
    const text = buildSummary(s);
    expect(text).toBe("Total 5 obras en 1 punto.");
    expect(text).not.toContain("Máximo");
  });

  it("con valores todos iguales tampoco señala un ganador", () => {
    const s = spec({
      data: [
        { key: "a", label: "A", value: 3 },
        { key: "b", label: "B", value: 3 },
      ],
    });
    expect(buildSummary(s)).not.toContain("Máximo");
  });

  it("nombra los extremos y los huecos cuando los hay", () => {
    const s = spec({
      data: [
        { key: "a", label: "Enero", value: 2 },
        { key: "b", label: "Febrero", value: 9 },
        { key: "c", label: "Marzo", value: null },
      ],
    });
    const text = buildSummary(s);
    expect(text).toContain("Total 11 obras en 2 puntos");
    expect(text).toContain("Máximo: Febrero (9 obras)");
    expect(text).toContain("mínimo: Enero (2 obras)");
    expect(text).toContain("1 punto sin datos");
  });
});

describe("variación: valor, dirección, unidad y periodo de comparación", () => {
  it("dice las cuatro cosas en subida, en bajada y en empate", () => {
    const base = { unit: UNITS.works, comparedTo: "2025" };
    expect(formatDelta({ ...base, value: 12 })).toBe("+12 obras más que en 2025");
    expect(formatDelta({ ...base, value: -3 })).toBe("−3 obras menos que en 2025");
    expect(formatDelta({ ...base, value: 0 })).toBe("Sin cambios respecto a 2025");
    expect(formatDelta({ ...base, value: 1 })).toBe("+1 obra más que en 2025");
  });

  it("concuerda el conector con periodos no numéricos", () => {
    expect(formatDelta({ value: 5, unit: UNITS.minutes, comparedTo: "la semana pasada" })).toBe(
      "+5 minutos más que la semana pasada",
    );
  });
});

describe("reglas por tipo de visualización", () => {
  it("gauge dice cuánto falta, y reconoce el objetivo cumplido", () => {
    const goal = (value: number, target: number) =>
      buildSummary(
        spec({ viz: "gauge", target, data: [{ key: "d", label: "Leídas", value }] }),
      );
    expect(goal(18, 30)).toBe("18 obras de 30 obras (60 %); faltan 12 obras.");
    expect(goal(30, 30)).toBe("Objetivo cumplido: 30 obras de 30 obras (100 %).");
    expect(goal(4, 0)).toContain("Sin objetivo configurado");
  });

  it("donut da total, mayor y cuota", () => {
    const text = buildSummary(
      spec({
        viz: "donut",
        data: [
          { key: "b", label: "Libros", value: 30 },
          { key: "m", label: "Películas", value: 10 },
        ],
      }),
    );
    expect(text).toContain("Total 40 obras repartidas en 2 categorías");
    expect(text).toContain("Mayor: Libros, 30 obras (75 %)");
  });

  it("stacked añade el reparto por serie", () => {
    const text = buildSummary(
      spec({
        viz: "stacked",
        series: [
          { key: "b", label: "Libros", color: "var(--type-book)" },
          { key: "m", label: "Películas", color: "var(--type-movie)" },
        ],
        data: [
          {
            key: "2025",
            label: "2025",
            value: 10,
            parts: [
              { key: "b", value: 7 },
              { key: "m", value: 3 },
            ],
          },
          {
            key: "2026",
            label: "2026",
            value: 6,
            parts: [
              { key: "b", value: 2 },
              { key: "m", value: 4 },
            ],
          },
        ],
      }),
    );
    expect(text).toContain("Reparto: Libros 9 obras (56 %), Películas 7 obras (44 %)");
  });

  it("heatmap cuenta días activos, no minutos", () => {
    const text = buildSummary(
      spec({
        viz: "heatmap",
        unit: UNITS.minutes,
        data: [
          { key: "1", label: "1 de marzo", value: 30 },
          { key: "2", label: "2 de marzo", value: 0 },
          { key: "3", label: "3 de marzo", value: 45 },
        ],
      }),
    );
    expect(text).toContain("2 de 3 días con actividad (67 %)");
    expect(text).toContain("Máximo: 3 de marzo (45 min)");
  });

  it("ranking numera la primera y la última", () => {
    const text = buildSummary(
      spec({
        viz: "ranking",
        unit: UNITS.stars,
        data: [
          { key: "a", label: "Dune", value: 5 },
          { key: "b", label: "Solaris", value: 4 },
        ],
      }),
    );
    expect(text).toContain("2 posiciones");
    expect(text).toContain("1.ª Dune (5,0 ★)");
    expect(text).toContain("última Solaris (4,0 ★)");
  });

  it("kpi admite un valor no numérico sin romper la frase", () => {
    const text = buildSummary(
      spec({
        viz: "kpi",
        kpis: [{ key: "d", label: "Día más lector", value: null, text: "Martes" }],
        data: [{ key: "d", label: "Día más lector", value: 1 }],
      }),
    );
    expect(text).toBe("Día más lector: Martes.");
  });
});
