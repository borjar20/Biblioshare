import { describe, expect, it } from "vitest";
import {
  detailTabOrder,
  clampDetailTab,
  type DetailTabId,
} from "./tab-visibility";

describe("detailTabOrder", () => {
  it("sin seguir y sin episodios: info + community, sin log", () => {
    expect(detailTabOrder(false, false)).toEqual(["info", "community"]);
  });

  it("seguido sin episodios: añade log al final", () => {
    expect(detailTabOrder(false, true)).toEqual(["info", "community", "log"]);
  });

  it("serie sin seguir: incluye episodes, sin log", () => {
    expect(detailTabOrder(true, false)).toEqual([
      "info",
      "episodes",
      "community",
    ]);
  });

  it("serie seguida: episodes + log", () => {
    expect(detailTabOrder(true, true)).toEqual([
      "info",
      "episodes",
      "community",
      "log",
    ]);
  });
});

describe("clampDetailTab", () => {
  const followed: DetailTabId[] = ["info", "community", "log"];
  const notFollowed: DetailTabId[] = ["info", "community"];

  it("devuelve la pestaña pedida si está disponible", () => {
    expect(clampDetailTab("community", followed)).toBe("community");
    expect(clampDetailTab("log", followed)).toBe("log");
  });

  it("cae a info si la pedida no está disponible (log sin seguir)", () => {
    expect(clampDetailTab("log", notFollowed)).toBe("info");
  });

  it("cae a info con null o un valor desconocido", () => {
    expect(clampDetailTab(null, followed)).toBe("info");
    expect(clampDetailTab("basura", followed)).toBe("info");
  });
});
