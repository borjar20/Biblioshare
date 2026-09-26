import { describe, expect, it, vi } from "vitest";

// feed.ts arrastra `server-only` (vía get-interaction-summary), que lanza en node.
vi.mock("server-only", () => ({}));

import { excerpt } from "./feed";

describe("excerpt (extracto de reseña del feed)", () => {
  it("junta los párrafos en blanco en un salto sencillo", () => {
    expect(excerpt("Top 3 peores apocalipsis:\n\n1. Solo poder comer maíz.")).toBe(
      "Top 3 peores apocalipsis:\n1. Solo poder comer maíz.",
    );
    expect(excerpt("Uno\r\n  \r\n\n  Dos")).toBe("Uno\nDos");
  });

  it("respeta los saltos sencillos del autor", () => {
    expect(excerpt("1. Maíz\n2. Zombis")).toBe("1. Maíz\n2. Zombis");
  });

  it("corta a 200 caracteres con «…» tras juntar los párrafos", () => {
    const long = `${"a".repeat(150)}\n\n\n${"b".repeat(100)}`;
    const out = excerpt(long)!;
    expect(out.endsWith("…")).toBe(true);
    expect(out.startsWith(`${"a".repeat(150)}\nb`)).toBe(true);
  });

  it("vacío o null no da extracto", () => {
    expect(excerpt(null)).toBeNull();
    expect(excerpt("")).toBeNull();
  });
});
