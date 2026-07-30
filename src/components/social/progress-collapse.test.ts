import { describe, it, expect } from "vitest";
import { splitProgressSteps } from "./progress-collapse";

describe("splitProgressSteps", () => {
  it("2 sesiones: no colapsable, se ven las 2", () => {
    expect(splitProgressSteps([1, 2], false)).toEqual({
      visible: [1, 2],
      hiddenCount: 0,
      collapsible: false,
    });
  });

  it("3 sesiones: no colapsable (nunca esconde una sola), se ven las 3", () => {
    expect(splitProgressSteps([1, 2, 3], false)).toEqual({
      visible: [1, 2, 3],
      hiddenCount: 0,
      collapsible: false,
    });
  });

  it("4 sesiones colapsadas: 2 visibles (las más recientes) + 2 ocultas", () => {
    expect(splitProgressSteps([1, 2, 3, 4], false)).toEqual({
      visible: [1, 2],
      hiddenCount: 2,
      collapsible: true,
    });
  });

  it("5 sesiones colapsadas: 2 visibles + 3 ocultas", () => {
    expect(splitProgressSteps([1, 2, 3, 4, 5], false)).toEqual({
      visible: [1, 2],
      hiddenCount: 3,
      collapsible: true,
    });
  });

  it("5 sesiones expandidas: se ven todas, sigue colapsable (para 'ver menos')", () => {
    expect(splitProgressSteps([1, 2, 3, 4, 5], true)).toEqual({
      visible: [1, 2, 3, 4, 5],
      hiddenCount: 0,
      collapsible: true,
    });
  });
});
