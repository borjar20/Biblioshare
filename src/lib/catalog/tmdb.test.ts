import { describe, expect, it } from "vitest";
import { mapPosterPaths } from "./tmdb";

describe("mapPosterPaths", () => {
  it("convierte file_path en URL absoluta con base w342", () => {
    const urls = mapPosterPaths({
      posters: [{ file_path: "/aaa.jpg" }, { file_path: "/bbb.jpg" }],
    });
    expect(urls).toEqual([
      "https://image.tmdb.org/t/p/w342/aaa.jpg",
      "https://image.tmdb.org/t/p/w342/bbb.jpg",
    ]);
  });

  it("descarta file_path nulo/vacío", () => {
    const urls = mapPosterPaths({
      posters: [{ file_path: null }, { file_path: "" }, { file_path: "/ok.jpg" }],
    });
    expect(urls).toEqual(["https://image.tmdb.org/t/p/w342/ok.jpg"]);
  });

  it("respuesta null o sin posters -> []", () => {
    expect(mapPosterPaths(null)).toEqual([]);
    expect(mapPosterPaths({})).toEqual([]);
  });
});
