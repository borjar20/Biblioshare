import { describe, expect, it } from "vitest";
import { canRemember, chipSuggestions } from "./regular-chips";
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
