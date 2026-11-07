import { describe, expect, it } from "vitest";
import { toStagePet } from "./to-stage-pet";

describe("toStagePet", () => {
  it("se queda con nombre, clase y etapa, aunque la compañera esté oculta", () => {
    expect(toStagePet({ name: "Nuez", petClass: "wizard", stage: "adult", mood: "sad", hidden: true })).toEqual({
      name: "Nuez",
      petClass: "wizard",
      stage: "adult",
    });
  });
  it("sin compañera, null (narrador)", () => {
    expect(toStagePet(null)).toBeNull();
  });
});
