// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Passage } from "@/lib/sagas/passage";
import { YourAverage } from "./your-average";

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (k: string, v?: Record<string, unknown>) => `${k}:${v?.rating ?? ""}`,
}));
afterEach(cleanup);

// `average` (todas las obras) difiere a propósito de `countedAverage`: el bloque usa la segunda.
const passage = (countedAverage: number | null) => ({ average: 3, countedAverage }) as Passage;

describe("YourAverage", () => {
  it("pinta la nota media con la clave", async () => {
    render(await YourAverage({ passage: Promise.resolve(passage(8)) }));
    expect(screen.getByText("nextUpYourAverage:4")).toBeTruthy();
  });
  it("sin pase (null) no pinta nada", async () => {
    expect(await YourAverage({ passage: Promise.resolve(null) })).toBeNull();
  });
  it("sin notas en obras que cuentan (countedAverage null) no pinta nada", async () => {
    expect(await YourAverage({ passage: Promise.resolve(passage(null)) })).toBeNull();
  });
});
