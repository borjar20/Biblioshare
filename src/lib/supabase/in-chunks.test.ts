import { describe, expect, it } from "vitest";
import { chunkIds, IN_CHUNK_SIZE } from "./in-chunks";

describe("chunkIds", () => {
  it("lista vacía -> sin lotes (no se lanza una consulta con `in.()`)", () => {
    expect(chunkIds([])).toEqual([]);
  });

  it("por debajo del tamaño -> un solo lote, la misma lista", () => {
    expect(chunkIds([1, 2, 3])).toEqual([[1, 2, 3]]);
  });

  it("justo en el tamaño -> un solo lote", () => {
    const ids = Array.from({ length: IN_CHUNK_SIZE }, (_, i) => i);
    expect(chunkIds(ids)).toHaveLength(1);
  });

  it("uno más que el tamaño -> dos lotes", () => {
    const ids = Array.from({ length: IN_CHUNK_SIZE + 1 }, (_, i) => i);
    const chunks = chunkIds(ids);
    expect(chunks).toHaveLength(2);
    expect(chunks[1]).toEqual([IN_CHUNK_SIZE]);
  });

  it("no pierde ni duplica ningún id", () => {
    const ids = Array.from({ length: 226 }, (_, i) => `id-${i}`);
    const flat = chunkIds(ids).flat();
    expect(flat).toEqual(ids);
    expect(new Set(flat).size).toBe(226);
  });

  it("acepta un tamaño propio", () => {
    expect(chunkIds([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
