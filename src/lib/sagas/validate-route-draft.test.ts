import { describe, expect, it } from "vitest";
import { validateRouteDraft } from "./validate-route-draft";
import type { RawRouteEntry } from "./route-types";

const e = (over: Partial<RawRouteEntry> & { position: number }): RawRouteEntry => ({
  itemType: null,
  itemId: null,
  childSagaId: null,
  note: null,
  ...over,
});

const ctx = { descendantIds: new Set(["guardia"]) };

describe("validateRouteDraft", () => {
  it("acepta un borrador correcto", () => {
    expect(
      validateRouteDraft([e({ position: 1, itemType: "book", itemId: "a" }), e({ position: 2, childSagaId: "guardia" })], ctx),
    ).toEqual([]);
  });

  it("rechaza posiciones no consecutivas desde 1", () => {
    expect(validateRouteDraft([e({ position: 2, itemType: "book", itemId: "a" })], ctx)).toContain("positions");
  });

  it("rechaza una entrada que no cumple el XOR", () => {
    expect(
      validateRouteDraft([e({ position: 1, itemType: "book", itemId: "a", childSagaId: "guardia" })], ctx),
    ).toContain("xor");
  });

  it("rechaza entradas duplicadas", () => {
    expect(
      validateRouteDraft(
        [e({ position: 1, itemType: "book", itemId: "a" }), e({ position: 2, itemType: "book", itemId: "a" })],
        ctx,
      ),
    ).toContain("duplicate");
  });

  it("rechaza un bloque que no es descendiente de esta saga", () => {
    expect(validateRouteDraft([e({ position: 1, childSagaId: "ajena" })], ctx)).toContain("foreignBlock");
  });

  it("rechaza una nota que supera 200 caracteres", () => {
    const noteLongString = "x".repeat(201);
    expect(validateRouteDraft([e({ position: 1, itemType: "book", itemId: "a", note: noteLongString })], ctx)).toContain(
      "noteTooLong",
    );
  });

  it("acepta una nota de exactamente 200 caracteres", () => {
    const noteMaxString = "x".repeat(200);
    expect(validateRouteDraft([e({ position: 1, itemType: "book", itemId: "a", note: noteMaxString })], ctx)).not.toContain(
      "noteTooLong",
    );
  });
});
