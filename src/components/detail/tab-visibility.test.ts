import { expect, it } from "vitest";
import { detailTabOrder, clampDetailTab } from "./tab-visibility";

it("solo separa un registro seguido y extenso", () => {
  expect(detailTabOrder(false, false)).toEqual(["info"]);
  expect(detailTabOrder(true, true)).toEqual(["info"]);
  expect(detailTabOrder(true, false)).toEqual(["info", "log"]);
});
it("resuelve los enlaces antiguos a secciones de la ficha", () => {
  for (const tab of ["community", "episodes", null, "unknown"]) {
    expect(clampDetailTab(tab, ["info", "log"])).toBe("info");
  }
  expect(clampDetailTab("log", ["info"])).toBe("info");
  expect(clampDetailTab("log", ["info", "log"])).toBe("log");
});
