import { describe, expect, it } from "vitest";
import { toProposedCheckpoints, EMPTY_CHECKPOINT } from "./checkpoint-draft-editor";

function draft(patch: Partial<typeof EMPTY_CHECKPOINT>) {
  return { ...EMPTY_CHECKPOINT, ...patch };
}

describe("toProposedCheckpoints", () => {
  it("descarta borradores sin etiqueta", () => {
    expect(toProposedCheckpoints([draft({ page: "120" })], "book")).toEqual([]);
  });

  it("libro: la página válida viaja como pista", () => {
    expect(toProposedCheckpoints([draft({ label: "Tramo 1", page: "120" })], "book")).toEqual([
      { label: "Tramo 1", position: { page: 120 }, dueOn: null },
    ]);
  });

  it("libro: sin página el hito va sin pista (#471, posición opcional)", () => {
    expect(toProposedCheckpoints([draft({ label: "Fin del cap. 12" })], "book")).toEqual([
      { label: "Fin del cap. 12", position: {}, dueOn: null },
    ]);
  });

  it("serie: temporada sin episodio no es una pista interpretable", () => {
    expect(toProposedCheckpoints([draft({ label: "Mitad", season: "2" })], "series")).toEqual([
      { label: "Mitad", position: {}, dueOn: null },
    ]);
  });
});
