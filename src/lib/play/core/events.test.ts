import { describe, expect, it } from "vitest";
import { makeEvent } from "./events";

describe("makeEvent", () => {
  it("construye el sobre con el at inyectado", () => {
    const e = makeEvent("life_changed", { target: "ana", delta: -1 }, 1234, "e-1");
    expect(e).toEqual({ id: "e-1", type: "life_changed", at: 1234, payload: { target: "ana", delta: -1 } });
  });

  it("genera un UUID si no se pasa id", () => {
    const e = makeEvent("turn_passed", {}, 1);
    expect(e.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
