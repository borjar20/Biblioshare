// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Passage } from "@/lib/sagas/passage";
import { YourAverage } from "./your-average";

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (k: string, v?: Record<string, unknown>) => `${k}:${v?.rating ?? ""}`,
}));
afterEach(cleanup);

const passage = (average: number | null) => ({ average }) as Passage;

describe("YourAverage", () => {
  it("pinta la nota media con la clave", async () => {
    render(await YourAverage({ passage: Promise.resolve(passage(8)) }));
    expect(screen.getByText(/^nextUpYourAverage:/)).toBeTruthy();
  });
  it("sin pase (null) no pinta nada", async () => {
    expect(await YourAverage({ passage: Promise.resolve(null) })).toBeNull();
  });
  it("sin notas (average null) no pinta nada", async () => {
    expect(await YourAverage({ passage: Promise.resolve(passage(null)) })).toBeNull();
  });
});
