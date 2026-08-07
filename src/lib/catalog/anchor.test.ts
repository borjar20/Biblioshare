import { describe, expect, test } from "vitest";
import { anchorHref } from "./anchor";

test("anchorHref enruta por tipo", () => {
  expect(anchorHref("book", "1")).toBe("/libro/1");
  expect(anchorHref("saga", "2")).toBe("/saga/2");
  expect(anchorHref("person", "3")).toBe("/persona/3");
});

describe("anchorHref: resto de tipos de catálogo", () => {
  test("movie y series delegan en itemHref", () => {
    expect(anchorHref("movie", "4")).toBe("/pelicula/4");
    expect(anchorHref("series", "5")).toBe("/serie/5");
  });
});
