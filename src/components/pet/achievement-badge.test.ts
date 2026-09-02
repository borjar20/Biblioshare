import { describe, expect, it } from "vitest";
import { rankFor } from "./achievement-badge";

describe("rankFor", () => {
  it("rota bronce/plata/oro/leyenda cada 4 niveles; 0 sin insignia", () => {
    expect(rankFor(1)).toBe("bronze");
    expect(rankFor(4)).toBe("legend");
    expect(rankFor(5)).toBe("bronze");
    expect(rankFor(8)).toBe("legend");
    expect(rankFor(0)).toBeNull();
  });
});
