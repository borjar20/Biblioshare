import { describe, expect, it } from "vitest";
import { detectFormat } from "@/lib/import/detect-format";

const buf = (s: string) => new TextEncoder().encode(s).buffer as ArrayBuffer;

describe("detectFormat tras retirar Bookmory", () => {
  it("sigue reconociendo Goodreads", () => {
    expect(detectFormat(buf("Book Id,Title,Author,ISBN13,Exclusive Shelf\n"))).toBe("goodreads");
  });
  it("sigue reconociendo Letterboxd", () => {
    expect(detectFormat(buf("Date,Name,Year,Letterboxd URI\n"))).toBe("letterboxd");
  });
  it("un .xlsx (firma PK de zip) ya NO se reconoce: se rechaza, no revienta", () => {
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
    expect(detectFormat(zip.buffer as ArrayBuffer)).toBeNull();
  });
});
