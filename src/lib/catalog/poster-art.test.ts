import { describe, expect, it } from "vitest";
import { pickPosterArt, posterTitleClass } from "./poster-art";

describe("pickPosterArt", () => {
  it("TMDB va a sangre y en 780 px", () => {
    expect(pickPosterArt({ coverUrl: "https://image.tmdb.org/t/p/w342/a.jpg" }))
      .toEqual({ kind: "bleed", src: "https://image.tmdb.org/t/p/w780/a.jpg" });
  });
  it("otros orígenes van sobre su atmósfera y no cambian de URL", () => {
    const ol = "https://covers.openlibrary.org/b/id/1-L.jpg";
    expect(pickPosterArt({ coverUrl: ol })).toEqual({ kind: "atmosphere", src: ol });
    const g = "https://books.google.com/books/content?id=x&img=1&zoom=2";
    expect(pickPosterArt({ coverUrl: g }).kind).toBe("atmosphere");
    const s = "https://abc.supabase.co/storage/v1/object/public/c/1.jpg";
    expect(pickPosterArt({ coverUrl: s }).kind).toBe("atmosphere");
  });
  it("sin portada es tipográfico", () => {
    expect(pickPosterArt({ coverUrl: null })).toEqual({ kind: "type" });
    expect(pickPosterArt({ coverUrl: "" })).toEqual({ kind: "type" });
  });
});

describe("posterTitleClass", () => {
  const size = (n: number) => posterTitleClass("x".repeat(n));
  it("baja por tramos, incluidos sus límites", () => {
    expect(size(20)).toContain("text-[64px]");
    expect(size(21)).toContain("text-[50px]");
    expect(size(45)).toContain("text-[50px]");
    expect(size(46)).toContain("text-[38px]");
    expect(size(80)).toContain("text-[38px]");
    expect(size(81)).toContain("text-[30px]");
  });
  it("incluye su tamaño de escritorio", () => {
    expect(size(20)).toContain("xl:text-[88px]");
    expect(size(81)).toContain("xl:text-[38px]");
  });
});
