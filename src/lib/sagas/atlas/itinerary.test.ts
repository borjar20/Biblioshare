import { describe, expect, it } from "vitest";
import type { RawRouteEntry } from "../route-types";
import { itinerarySteps } from "./itinerary";

const item = (position: number, id: string, note: string | null = null): RawRouteEntry =>
  ({ position, itemType: "book", itemId: id, childSagaId: null, note });
const block = (position: number, sagaId: string, note: string | null = null): RawRouteEntry =>
  ({ position, itemType: null, itemId: null, childSagaId: sagaId, note });
const mainOrderOf = (sagaId: string) => (sagaId === "guardia" ? ["book:g1", "book:g2"] : []);

describe("itinerarySteps", () => {
  it("expande un bloque en sus obras, numeradas por obra y con la nota del paso (#1541)", () => {
    expect(itinerarySteps([block(1, "guardia", "Empieza aquí")], mainOrderOf)).toEqual([
      { key: "i:book:g1", step: 1, note: "Empieza aquí" },
      { key: "i:book:g2", step: 2, note: "Empieza aquí" },
    ]);
  });
  it("mixto: obra + bloque, en orden de position aunque lleguen barajadas", () => {
    expect(itinerarySteps([block(2, "guardia"), item(1, "a", "Primero")], mainOrderOf).map((s) => [s.key, s.step]))
      .toEqual([["i:book:a", 1], ["i:book:g1", 2], ["i:book:g2", 3]]);
  });
  it("deduplica por primera aparición", () => {
    expect(itinerarySteps([item(1, "g2"), block(2, "guardia")], mainOrderOf).map((s) => s.key))
      .toEqual(["i:book:g2", "i:book:g1"]);
  });
  it("un bloque vacío o inexistente no aporta pasos", () => {
    expect(itinerarySteps([block(1, "nada")], mainOrderOf)).toEqual([]);
  });
});
