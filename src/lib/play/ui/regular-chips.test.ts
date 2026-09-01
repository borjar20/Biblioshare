import { describe, expect, it } from "vitest";
import { canRemember, chipSuggestions, visibleRegulars } from "./regular-chips";
import type { PlayerRecord } from "../core/db";

function p(playerId: string, name: string): PlayerRecord {
  return { playerId, identity: "uid-1", v: 1, name, syncStatus: "synced", deletedAt: null };
}

describe("chipSuggestions", () => {
  const players = [p("j1", "Pablo"), p("j2", "Paula"), p("j3", "Marta")];

  it("excluye a los ya sentados y a los tombstone", () => {
    expect(
      chipSuggestions([...players, { ...p("j4", "Borrado"), deletedAt: 1 }], ["j2"], "").map(
        (x) => x.playerId,
      ),
    ).toEqual(["j1", "j3"]);
  });

  it("filtra por prefijo de palabra, case/acentos-insensible", () => {
    expect(chipSuggestions(players, [], "pa").map((x) => x.name)).toEqual(["Pablo", "Paula"]);
    expect(chipSuggestions(players, [], "MAR").map((x) => x.name)).toEqual(["Marta"]);
  });

  it("query vacía muestra todos los disponibles (descubribilidad)", () => {
    expect(chipSuggestions(players, [], "").length).toBe(3);
  });
});

describe("canRemember", () => {
  it("true con texto no vacío que no coincide exacto con un habitual", () => {
    expect(canRemember([p("j1", "Pablo")], "Pablo M")).toBe(true);
  });

  it("false con vacío o coincidencia exacta (case-insensible)", () => {
    expect(canRemember([p("j1", "Pablo")], "")).toBe(false);
    expect(canRemember([p("j1", "Pablo")], "  pablo ")).toBe(false);
  });
});

describe("visibleRegulars", () => {
  const many = Array.from({ length: 9 }, (_, i) => p(`j${i}`, `Jugador ${i}`));

  it("corta a la primera tanda y CUENTA lo que esconde", () => {
    const { shown, hidden } = visibleRegulars(many, "", false, 6);
    expect(shown).toHaveLength(6);
    expect(hidden).toBe(3);
  });

  it("desplegado los enseña todos y ya no esconde nada", () => {
    expect(visibleRegulars(many, "", true, 6)).toEqual({ shown: many, hidden: 0 });
  });

  it("buscando no corta: todas las coincidencias, sin ficha «+N»", () => {
    const players = [p("j1", "Pablo"), p("j2", "Paula"), p("j3", "Marta")];
    const { shown, hidden } = visibleRegulars(players, "pa", false, 1);
    expect(shown.map((x) => x.name)).toEqual(["Pablo", "Paula"]);
    expect(hidden).toBe(0);
  });

  it("nunca ofrece un tombstone, ni contándolo como escondido", () => {
    const players = [p("j1", "Pablo"), { ...p("j2", "Borrado"), deletedAt: 1 }];
    expect(visibleRegulars(players, "", false, 1)).toEqual({
      shown: [players[0]],
      hidden: 0,
    });
  });

  it("con menos que el tope no hay nada escondido", () => {
    expect(visibleRegulars(many.slice(0, 4), "", false, 6).hidden).toBe(0);
  });
});
