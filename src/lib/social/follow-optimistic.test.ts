import { describe, it, expect } from "vitest";
import { followReducer } from "./follow-optimistic";

describe("followReducer", () => {
  it("desde none: público → accepted, privado → pending", () => {
    expect(followReducer("none", { type: "toggle", targetIsPublic: true })).toBe(
      "accepted",
    );
    expect(
      followReducer("none", { type: "toggle", targetIsPublic: false }),
    ).toBe("pending");
  });

  it("desde accepted o pending → none (dejar de seguir / cancelar)", () => {
    expect(
      followReducer("accepted", { type: "toggle", targetIsPublic: true }),
    ).toBe("none");
    expect(
      followReducer("pending", { type: "toggle", targetIsPublic: false }),
    ).toBe("none");
  });

  it("self no cambia", () => {
    expect(followReducer("self", { type: "toggle", targetIsPublic: true })).toBe(
      "self",
    );
  });
});
