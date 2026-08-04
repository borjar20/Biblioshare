import { describe, it, expect } from "vitest";
import { derive, heroKpi } from "./derive";
import { formatDelta, formatShare, formatValue, NO_DATA } from "./format";
import { buildHighlight, buildSummary, summaryLines } from "./summary";
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
    expect(buildSummary(s)).toBe(
      "Sin actividad. Los 2 puntos medidos valen cero; no es que falten datos.",
    );
    // La frase que separa cero de hueco es la que llega a la vista compacta.
    expect(buildHighlight(s)).toBe(
      "Los 2 puntos medidos valen cero; no es que falten datos.",
    );
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
    expect(text).toContain("Total 40 obras en 2 categorías");
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
    // Mayúscula: va detrás de un punto, no pegada a la frase anterior.
    expect(text).toContain("Última Solaris (4,0 ★)");
    expect(text).not.toContain(". última");
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

describe("vista compacta: titular corto y cifra automática", () => {
  const meses = spec({
    labelHeader: "Mes",
    data: [
      { key: "a", label: "Enero", value: 2 },
      { key: "b", label: "Febrero", value: 9 },
      { key: "c", label: "Marzo", value: null },
    ],
  });

  it("la frase compacta es lo que DESTACA, no el total que ya preside la tarjeta", () => {
    expect(summaryLines(meses)[0]).toBe("Total 11 obras en 2 puntos.");
    expect(buildHighlight(meses)).toBe("Máximo: Febrero (9 obras); mínimo: Enero (2 obras).");
    // Y el resumen completo sigue siendo la unión de todas.
    expect(buildSummary(meses)).toBe(summaryLines(meses).join(" "));
  });

  it("sin nada que destacar, la vista compacta no inventa frase", () => {
    const unico = spec({ data: [{ key: "a", label: "Enero", value: 5 }] });
    expect(buildHighlight(unico)).toBe("");
  });

  it("un `summary` a mano se respeta y no se parte en frases", () => {
    const s = spec({ summary: "Lo dice el panel. Y punto.", data: [{ key: "a", label: "A", value: 1 }] });
    expect(summaryLines(s)).toEqual(["Lo dice el panel. Y punto."]);
    expect(buildSummary(s)).toBe("Lo dice el panel. Y punto.");
    // Y una spec con `summary` a mano no tiene segunda línea que destacar.
    expect(buildHighlight(s)).toBe("");
  });

  it("sin KPIs, la tarjeta plegada preside con el total: nunca queda solo el dibujo", () => {
    const hero = heroKpi(meses, derive(meses));
    expect(hero).toEqual({ key: "total", label: "Total", value: 11, unit: UNITS.works });
  });

  it("cuando sumar no significa nada (notas, ranking) preside el primero", () => {
    const ranking = spec({
      viz: "ranking",
      unit: UNITS.stars,
      data: [
        { key: "a", label: "Dune", value: 5 },
        { key: "b", label: "Solaris", value: 4 },
      ],
    });
    expect(heroKpi(ranking, derive(ranking))).toMatchObject({ label: "Dune", value: 5 });
  });

  it("los KPIs de la spec mandan sobre el automático", () => {
    const s = spec({
      kpis: [{ key: "m", label: "Nota media", value: 4.2, unit: UNITS.stars }],
      data: [{ key: "a", label: "A", value: 3 }],
    });
    expect(heroKpi(s, derive(s))?.label).toBe("Nota media");
  });

  it("un panel vacío no fabrica cifra que presidir", () => {
    const s = spec({ data: [{ key: "a", label: "A", value: null }] });
    expect(heroKpi(s, derive(s))).toBeNull();
  });
});

describe("concordancia: la unidad la elige el panel, no la frase", () => {
  it("no concuerda en femenino con una unidad masculina", () => {
    // «repartidas» valía para obras y chirriaba con títulos. La frase evita el
    // participio en vez de adivinar el género de cada unidad.
    const text = buildSummary(
      spec({
        viz: "donut",
        unit: UNITS.items,
        data: [
          { key: "a", label: "Completado", value: 100 },
          { key: "b", label: "Pendiente", value: 37 },
        ],
      }),
    );
    expect(text).toContain("Total 137 títulos en 2 categorías");
    expect(text).not.toContain("repartidas");
  });
});

describe("concordancia del símbolo corto", () => {
  it("«1 obra», no «1 obras»: el mínimo de un histograma salía en plural", () => {
    expect(formatValue(1, UNITS.works)).toBe("1 obra");
    expect(formatValue(2, UNITS.works)).toBe("2 obras");
    expect(formatValue(1, UNITS.days)).toBe("1 día");
    expect(formatValue(0, UNITS.items)).toBe("0 títulos");
  });

  it("las abreviaturas de verdad no se pluralizan", () => {
    expect(formatValue(1, UNITS.minutes)).toBe("1 min");
    expect(formatValue(1, UNITS.stars)).toBe("1,0 ★");
    expect(formatValue(1, UNITS.percent)).toBe("1\u00a0%");
  });
});

describe("qué indicador preside la tarjeta", () => {
  const habitos = spec({
    viz: "kpi",
    unit: UNITS.minutes,
    data: [],
    kpis: [
      { key: "franja", label: "Franja favorita", value: null },
      { key: "dia", label: "Día más lector", value: null },
      { key: "media", label: "Sesión media", value: 42, unit: UNITS.minutes },
    ],
  });

  it("preside el primero CON dato, no el primero de la lista", () => {
    // Si no, un panel con dos indicadores vacíos delante enseñaba «Sin datos»
    // en grande teniendo el tercero lleno justo debajo.
    expect(heroKpi(habitos, derive(habitos))?.key).toBe("media");
  });

  it("si ninguno trae dato, el panel está vacío", () => {
    const s = spec({
      viz: "kpi",
      data: [],
      kpis: [{ key: "a", label: "A", value: null }],
    });
    expect(derive(s).isEmpty).toBe(true);
  });
});
