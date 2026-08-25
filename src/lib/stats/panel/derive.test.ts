import { describe, expect, it } from "vitest";
import { derive } from "./derive";
import { UNITS, type PanelSpec, type PanelViz } from "./types";

function spec(viz: PanelViz, values: (number | null)[]): PanelSpec {
  return {
    id: "t",
    title: "Prueba",
    context: { period: "2026" },
    viz,
    unit: UNITS.works,
    data: values.map((value, i) => ({ key: `k${i}`, label: `L${i}`, value })),
  };
}

describe("degradación del viz según cuántos puntos hay", () => {
  it("una línea con menos de cuatro puntos se lee mejor como cifra", () => {
    expect(derive(spec("line", [3, 5])).viz).toBe("kpi");
    expect(derive(spec("area", [3, 5, 7])).viz).toBe("kpi");
    expect(derive(spec("line", [3, 5, 7, 9])).viz).toBe("line");
  });

  it("un reparto con menos de tres partes no es un reparto", () => {
    expect(derive(spec("waffle", [10, 4])).viz).toBe("kpi");
    expect(derive(spec("waffle", [10, 4, 2])).viz).toBe("waffle");
    expect(derive(spec("donut", [10, 4])).viz).toBe("kpi");
  });

  it("una comparación necesita al menos dos puntos", () => {
    expect(derive(spec("lollipop", [5])).viz).toBe("kpi");
    expect(derive(spec("bars", [5])).viz).toBe("kpi");
    expect(derive(spec("lollipop", [5, 3])).viz).toBe("lollipop");
  });

  it("los HUECOS no cuentan: tres nulos y un dato siguen siendo un dato", () => {
    expect(derive(spec("line", [4, null, null, null])).viz).toBe("kpi");
  });

  it("los CEROS medidos sí cuentan: son dato, no ausencia", () => {
    expect(derive(spec("line", [0, 0, 0, 0])).viz).toBe("line");
  });

  it("kpi, ranking y table nunca degradan: ya son su forma mínima", () => {
    expect(derive(spec("kpi", [])).viz).toBe("kpi");
    expect(derive(spec("ranking", [5])).viz).toBe("ranking");
    expect(derive(spec("table", [1])).viz).toBe("table");
  });

  it("gauge no degrada: mide contra un objetivo, no contra otros puntos", () => {
    expect(derive(spec("gauge", [7])).viz).toBe("gauge");
  });

  it("bullet no degrada con una fila: compara contra SU marca, no contra otras filas", () => {
    // Es el caso de «Rachas», que estrenó la forma en la fase A con una sola
    // fila. Con un mínimo de 2 se habría degradado justo el panel que la usa.
    expect(derive(spec("bullet", [12])).viz).toBe("bullet");
  });
});
