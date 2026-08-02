import { describe, it, expect } from "vitest";
import { safeNext, loginHref } from "./safe-next";

describe("safeNext", () => {
  it("acepta rutas internas", () => {
    expect(safeNext("/coleccion")).toBe("/coleccion");
    expect(safeNext("/club/mi-club?tab=x")).toBe("/club/mi-club?tab=x");
  });
  it("rechaza protocol-relative y externas", () => {
    expect(safeNext("//evil.com")).toBe("/");
    expect(safeNext("https://evil.com")).toBe("/");
    expect(safeNext("evil")).toBe("/");
    expect(safeNext("/\\evil.com")).toBe("/");
    expect(safeNext("/path\\x")).toBe("/");
  });
  it("cae a / con vacío/null", () => {
    expect(safeNext(null)).toBe("/");
    expect(safeNext(undefined)).toBe("/");
    expect(safeNext("")).toBe("/");
  });
});

describe("loginHref", () => {
  it("codifica la ruta en next", () => {
    expect(loginHref("/coleccion")).toBe("/login?next=%2Fcoleccion");
  });
});
