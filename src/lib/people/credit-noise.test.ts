import { describe, expect, it } from "vitest";
import { isSelfAppearance, strongestRole, workRoleWeight } from "./credit-noise";

describe("strongestRole", () => {
  it("el caso Clone High: creación gana a reparto aunque el reparto entrara primero", () => {
    // Salía DESTACADA por su peso de creación y debajo ponía «Reparto», porque
    // `roles[0]` es el orden en que vinieron las filas de `credits`.
    expect(strongestRole(["cast", "creator"])).toBe("creator");
  });

  it("dirección gana a guion y a reparto", () => {
    expect(strongestRole(["writer", "director", "cast"])).toBe("director");
  });

  it("un solo rol se devuelve tal cual", () => {
    expect(strongestRole(["cast"])).toBe("cast");
  });
});

describe("isSelfAppearance", () => {
  it("caza las formas que usa TMDB para «como sí mismo»", () => {
    // Casos REALES de la ficha de Phil Lord (tmdb 107446), medidos el
    // 2026-08-12: making-of de Spider-Verse, LEGO Masters, Jeopardy!, The View.
    expect(isSelfAppearance("Self")).toBe(true);
    expect(isSelfAppearance("Himself")).toBe(true);
    expect(isSelfAppearance("Herself")).toBe(true);
    expect(isSelfAppearance("Self - Presenter")).toBe(true);
    expect(isSelfAppearance("Self - Clue Presenter")).toBe(true);
    expect(isSelfAppearance("Himself (archive footage)")).toBe(true);
    expect(isSelfAppearance("  self  ")).toBe(true);
  });

  it("NO caza los papeles de verdad", () => {
    // También reales: su obra como intérprete en sus propias películas y series.
    expect(isSelfAppearance("Additional Voices (voice)")).toBe(false);
    expect(isSelfAppearance("Principal Dr. Cinnamon J. Scudworth")).toBe(false);
    expect(isSelfAppearance("Bill")).toBe(false);
    expect(isSelfAppearance("Narrator")).toBe(false);
  });

  it("«Selfie» no es una aparición como sí mismo (el \\b importa)", () => {
    expect(isSelfAppearance("Selfie Girl")).toBe(false);
  });

  it("sin personaje -> false", () => {
    expect(isSelfAppearance(null)).toBe(false);
    expect(isSelfAppearance(undefined)).toBe(false);
    expect(isSelfAppearance("")).toBe(false);
  });
});

describe("workRoleWeight", () => {
  it("la autoría pesa más que el reparto", () => {
    expect(workRoleWeight(["director"], null)).toBeGreaterThan(workRoleWeight(["cast"], "Bill"));
    expect(workRoleWeight(["writer"], null)).toBeGreaterThan(workRoleWeight(["cast"], "Bill"));
    expect(workRoleWeight(["author"], null)).toBeGreaterThan(workRoleWeight(["cast"], "Bill"));
  });

  it("manda el MEJOR de los roles de la obra", () => {
    expect(workRoleWeight(["cast", "director"], "Bill")).toBe(workRoleWeight(["director"], null));
  });

  it("una aparición como sí mismo cae a cero aunque el rol sea reparto", () => {
    expect(workRoleWeight(["cast"], "Self")).toBe(0);
    expect(workRoleWeight(["cast"], "Self - Presenter")).toBe(0);
  });

  it("dirección pesa más que guion", () => {
    expect(workRoleWeight(["director"], null)).toBeGreaterThan(workRoleWeight(["writer"], null));
  });

  it("sin roles -> cero", () => {
    expect(workRoleWeight([], null)).toBe(0);
  });
});
