import { describe, expect, it } from "vitest";
import { normalizeStep, nextStep, showsPeopleStep, totalSteps } from "./steps";

describe("showsPeopleStep", () => {
  it("basta con 3 perfiles ajenos", () => {
    expect(showsPeopleStep({ profiles: 3, clubs: 0 })).toBe(true);
  });

  it("basta con 1 club público", () => {
    expect(showsPeopleStep({ profiles: 0, clubs: 1 })).toBe(true);
  });

  it("por debajo del umbral se omite", () => {
    expect(showsPeopleStep({ profiles: 2, clubs: 0 })).toBe(false);
    expect(showsPeopleStep({ profiles: 0, clubs: 0 })).toBe(false);
  });
});

describe("totalSteps", () => {
  it("3 con paso de gente, 2 sin él", () => {
    expect(totalSteps(true)).toBe(3);
    expect(totalSteps(false)).toBe(2);
  });
});

describe("normalizeStep", () => {
  it("ausente o basura cae al paso 1, nunca 404", () => {
    expect(normalizeStep(undefined, true)).toBe(1);
    expect(normalizeStep("", true)).toBe(1);
    expect(normalizeStep("abc", true)).toBe(1);
    expect(normalizeStep("0", true)).toBe(1);
    expect(normalizeStep("9", true)).toBe(1);
    expect(normalizeStep("-1", true)).toBe(1);
  });

  it("respeta los pasos válidos", () => {
    expect(normalizeStep("1", true)).toBe(1);
    expect(normalizeStep("2", true)).toBe(2);
    expect(normalizeStep("3", true)).toBe(3);
    expect(normalizeStep("fin", true)).toBe("fin");
  });

  it("pedir el paso 3 cuando está omitido lleva a la bienvenida", () => {
    expect(normalizeStep("3", false)).toBe("fin");
  });
});

describe("nextStep", () => {
  it("encadena 1 → 2 → 3 → fin con paso de gente", () => {
    expect(nextStep(1, true)).toBe(2);
    expect(nextStep(2, true)).toBe(3);
    expect(nextStep(3, true)).toBe("fin");
  });

  it("sin paso de gente, del 2 salta a la bienvenida", () => {
    expect(nextStep(2, false)).toBe("fin");
  });

  it("desde la bienvenida no se avanza", () => {
    expect(nextStep("fin", true)).toBe("fin");
  });
});
