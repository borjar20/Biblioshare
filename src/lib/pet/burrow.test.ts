import { describe, expect, it } from "vitest";
import { arrangeBurrow, type BurrowNeighbor } from "./burrow";

const own = { name: "Nuez", petClass: "wizard" as const, stage: "acorn" as const };
const neighbors: BurrowNeighbor[] = Array.from({ length: 13 }, (_, i) => ({
  userId: `user-${i}`, username: `person${i}`, displayName: null, avatarUrl: null,
  name: `Vecina ${i}`, petClass: "fighter", stage: "adult",
}));

describe("arrangeBurrow", () => {
  it("sin mascota propia muestra doce vecinas y no inventa una bellota", () => {
    const result = arrangeBurrow(null, neighbors);
    expect(result.own).toBeNull();
    expect(result.visible).toHaveLength(12);
    expect(result.hidden.map((p) => p.userId)).toEqual(["user-12"]);
    expect(arrangeBurrow(null, [])).toEqual({ own: null, visible: [], hidden: [] });
  });
  it("reserva uno de los doce sitios para la propia y conserva el orden recibido", () => {
    const result = arrangeBurrow(own, neighbors);
    expect(result.own).toEqual(own);
    expect(result.visible.map((p) => p.userId)).toEqual([
      "user-0", "user-1", "user-2", "user-3", "user-4", "user-5",
      "user-6", "user-7", "user-8", "user-9", "user-10",
    ]);
    expect(result.hidden.map((p) => p.userId)).toEqual(["user-11", "user-12"]);
    expect(neighbors).toHaveLength(13);
  });
});
