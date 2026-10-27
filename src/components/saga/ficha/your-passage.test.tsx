// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Passage } from "@/lib/sagas/passage";
import { YourPassage, YourPassageSkeleton } from "./your-passage";

vi.mock("next-intl/server", () => ({
  getTranslations: async () =>
    Object.assign(
      (k: string, v?: Record<string, unknown>) => (v ? `${k}|${JSON.stringify(v)}` : k),
      { rich: (k: string, v?: Record<string, unknown>) => `${k}|${v?.title ?? ""}` },
    ),
}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (p: { alt: string }) => <img alt={p.alt} />,
}));
afterEach(cleanup);

const full: Passage = {
  since: "2025-03-10",
  completed: 4,
  inProgress: 1,
  pages: { total: 1500, known: 2, of: 3 },
  minutes: { total: 330, known: 1, of: 1 },
  favorite: { key: "book:a", title: "Dune", href: "/libro/a", rating: 10 },
  average: 8,
  curve: [
    { x: 0, rating: 10, key: "book:a", title: "Dune" },
    { x: 1, rating: 5, key: "book:b", title: "Mesías" },
    { x: 4, rating: 7, key: "book:c", title: "Herejes" },
  ],
  curveLength: 5,
  optional: { skipped: 1, total: 2 },
};

const run = async (p: Passage | null) => YourPassage({ passage: Promise.resolve(p), sagaName: "Dune" });

describe("YourPassage", () => {
  it("con null no pinta nada", async () => {
    expect(await run(null)).toBeNull();
  });

  it("pasaje completo: datos y favorita enlazada", async () => {
    render((await run(full))!);
    const root = screen.getByTestId("your-passage");
    expect(root.querySelector("h2")?.textContent).toContain("passageTitle");
    for (const k of ["passageSince", "passageCompleted", "passageInProgress", "passagePages", "passageTime", "passageAverage", "passageSkipped"]) {
      expect(screen.getByText(k)).toBeTruthy();
    }
    expect(root.textContent).toContain("marzo de 2025");
    expect(root.textContent).toMatch(/1.?500/);
    expect(root.textContent).toContain("passageOfKnown");
    expect(root.textContent).toContain('"h":"6"'); // 330 min = 5,5 h → 6
    expect(screen.getByRole("link", { name: /Dune/ }).getAttribute("href")).toBe("/libro/a");
  });

  it("En curso se oculta con 0; Páginas sin «sobre» si known === of", async () => {
    render((await run({ ...full, inProgress: 0, pages: { total: 900, known: 3, of: 3 } }))!);
    expect(screen.queryByText("passageInProgress")).toBeNull();
    expect(screen.getByTestId("your-passage").textContent).not.toContain("passageOfKnown");
  });

  it("con 3 puntos hay svg y polyline de 3 pares; saltando huecos", async () => {
    render((await run(full))!);
    const svg = document.querySelector("svg[role=img]")!;
    expect(svg.getAttribute("viewBox")).toBe("0 0 96 60");
    const pts = svg.querySelector("polyline")!.getAttribute("points")!.trim().split(/\s+/);
    expect(pts).toHaveLength(3);
    expect(pts[2].startsWith("96,")).toBe(true);
    expect(svg.getAttribute("aria-label")).toContain("passageCurveLabel");
    expect(svg.getAttribute("aria-label")).toContain("Dune 5");
  });

  it("con 1 punto no hay svg", async () => {
    render((await run({ ...full, curve: full.curve.slice(0, 1) }))!);
    expect(document.querySelector("svg")).toBeNull();
  });

  it("optional null oculta «Opcionales saltadas»", async () => {
    render((await run({ ...full, optional: null }))!);
    expect(screen.queryByText("passageSkipped")).toBeNull();
  });

  it("esqueleto", () => {
    render(<YourPassageSkeleton />);
    expect(screen.getByTestId("your-passage-skeleton")).toBeTruthy();
  });
});
