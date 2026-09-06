import { describe, expect, it } from "vitest";
import { canonicalJson } from "./canonical";

describe("canonicalJson", () => {
  it("ordena claves, no mete espacios y anida", () => {
    expect(canonicalJson({ b: 1, a: { z: [1, "x", null], y: true } })).toBe(
      '{"a":{"y":true,"z":[1,"x",null]},"b":1}',
    );
  });

  it("el orden de inserción no cambia la salida", () => {
    expect(canonicalJson({ tick: 5, seq: 0 })).toBe(canonicalJson({ seq: 0, tick: 5 }));
  });

  it("solo enteros seguros", () => {
    expect(canonicalJson(-0)).toBe("0");
    expect(() => canonicalJson(1.5)).toThrow("CANON_NOT_INTEGER");
    expect(() => canonicalJson(NaN)).toThrow("CANON_NOT_INTEGER");
    expect(() => canonicalJson(Number.MAX_SAFE_INTEGER + 1)).toThrow("CANON_NOT_INTEGER");
  });

  it("rechaza undefined y tipos no JSON en vez de omitirlos", () => {
    expect(() => canonicalJson({ a: undefined })).toThrow("CANON_UNDEFINED");
    expect(() => canonicalJson(() => 1)).toThrow("CANON_TYPE");
    expect(() => canonicalJson(Symbol("x"))).toThrow("CANON_TYPE");
  });

  it("escapa cadenas como JSON", () => {
    expect(canonicalJson('a"b\n')).toBe('"a\\"b\\n"');
  });
});
