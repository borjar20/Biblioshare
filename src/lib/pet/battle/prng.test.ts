import { describe, expect, it } from "vitest";
import { isSeed, nextBp, nextInt, nextU32, seedFromHex, seedFromIndex, subStream } from "./prng";

const SEED = "0123456789abcdef0123456789abcdef";

describe("seedFromHex", () => {
  it("acepta 32 hex en minúsculas y rechaza lo demás", () => {
    expect(isSeed(SEED)).toBe(true);
    expect(isSeed(SEED.toUpperCase())).toBe(false);
    expect(isSeed(SEED.slice(1))).toBe(false);
    expect(() => seedFromHex("0".repeat(32))).toThrow("INVALID_SEED");
    expect(() => seedFromHex("zz")).toThrow("INVALID_SEED");
  });

  it("parte el seed en cuatro palabras big-endian", () => {
    expect(seedFromHex(SEED).s).toEqual([0x01234567, 0x89abcdef, 0x01234567, 0x89abcdef]);
  });
});

describe("xoshiro128**", () => {
  // Vector calculado a mano en el plan (Task 1): s1·5 = 0xB05B05AB, rotl7 = 0x2D82D5D8,
  // ·9 = 0x99998498. Si falla, revisar la implementación contra el C de referencia
  // ANTES de tocar este número.
  it("primera tirada del seed de referencia", () => {
    expect(nextU32(seedFromHex(SEED))).toBe(0x99998498);
  });

  it("es determinista y distinto por seed", () => {
    const a = seedFromHex(SEED);
    const b = seedFromHex(SEED);
    const c = seedFromHex("fedcba9876543210fedcba9876543210");
    const seqA = [nextU32(a), nextU32(a), nextU32(a)];
    const seqB = [nextU32(b), nextU32(b), nextU32(b)];
    const seqC = [nextU32(c), nextU32(c), nextU32(c)];
    expect(seqA).toEqual(seqB);
    expect(seqA).not.toEqual(seqC);
  });

  it("nextInt y nextBp respetan sus rangos", () => {
    const st = seedFromHex(SEED);
    for (let i = 0; i < 10_000; i++) {
      const n = nextInt(st, 20, 40);
      expect(n).toBeGreaterThanOrEqual(20);
      expect(n).toBeLessThanOrEqual(40);
      const bp = nextBp(st);
      expect(bp).toBeGreaterThanOrEqual(0);
      expect(bp).toBeLessThan(10_000);
    }
  });
});

describe("subStream", () => {
  it("mismo (seed, etiqueta, tick) → misma secuencia; otro tick u otra etiqueta → otra", () => {
    const a = subStream(SEED, "ulti:A", 120);
    const b = subStream(SEED, "ulti:A", 120);
    expect(nextU32(a)).toBe(nextU32(b));
    expect(nextU32(subStream(SEED, "ulti:A", 120))).not.toBe(nextU32(subStream(SEED, "ulti:A", 121)));
    expect(nextU32(subStream(SEED, "ulti:A", 120))).not.toBe(nextU32(subStream(SEED, "ulti:B", 120)));
  });

  it("no toca el flujo principal", () => {
    const main = seedFromHex(SEED);
    const before = [...main.s];
    subStream(SEED, "ulti:A", 5);
    expect(main.s).toEqual(before);
  });
});

describe("seedFromIndex", () => {
  it("da seeds válidos, distintos y estables", () => {
    expect(isSeed(seedFromIndex(0))).toBe(true);
    expect(seedFromIndex(0)).toBe(seedFromIndex(0));
    expect(seedFromIndex(0)).not.toBe(seedFromIndex(1));
  });
});
