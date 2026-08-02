import { describe, expect, it } from "vitest";
import { itemsMissingFromLibrary } from "./collection-card-items";

describe("itemsMissingFromLibrary", () => {
  it("excluye del recuento y del payload los ítems con pase activo del visitante", () => {
    const items = [
      { id: "owned", viewerHasActivePass: true },
      { id: "missing-a", viewerHasActivePass: false },
      { id: "missing-b" },
    ];

    expect(itemsMissingFromLibrary(items).map((item) => item.id)).toEqual([
      "missing-a",
      "missing-b",
    ]);
  });
});
