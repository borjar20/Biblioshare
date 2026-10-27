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
  favorite: { key: "book:a", title: "Dune", href: "/libro/a", coverUrl: "/c/a.jpg", rating: 10 },
  average: 8,
  countedAverage: 7,
  curve: [
    { x: 0, rating: 10, key: "book:a", title: "Dune" },
    { x: 1, rating: 5, key: "book:b", title: "Mesías" },
    { x: 4, rating: 1, key: "book:c", title: "Herejes" },
  ],
  curveLength: 5,
  distribution: [
    { level: 5, works: [{ key: "book:a", title: "Dune", href: "/libro/a", coverUrl: "/c/a.jpg" }] },
    { level: 4, works: [] },
    { level: 3, works: [{ key: "book:b", title: "Mesías", href: "/libro/b", coverUrl: null }] },
    { level: 2, works: [] },
    { level: 1, works: [{ key: "book:c", title: "Herejes", href: "/libro/c", coverUrl: "/c/c.jpg" }] },
  ],
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
    expect(root.textContent).toContain('passageAverage');
    expect(root.textContent).toContain('ratingOutOf|{"rating":"4"}'); // 8/10 en puntos: «Tu media» usa average, no countedAverage
    expect(root.textContent).toContain("marzo de 2025");
    expect(root.textContent).toMatch(/1.?500/);
    expect(root.textContent).toContain("passageOfKnown");
    expect(root.textContent).toContain('"h":"6"'); // 330 min = 5,5 h → 6
    expect(screen.getByRole("link", { name: /passageFavoriteLabel/ }).getAttribute("href")).toBe("/libro/a");
  });

  it("En curso se oculta con 0; Páginas sin «sobre» si known === of", async () => {
    render((await run({ ...full, inProgress: 0, pages: { total: 900, known: 3, of: 3 } }))!);
    expect(screen.queryByText("passageInProgress")).toBeNull();
    expect(screen.getByTestId("your-passage").textContent).not.toContain("passageOfKnown");
  });

  it("reparto: cinco niveles de 5 a 1, cada uno con sus portadas enlazadas y su recuento", async () => {
    render((await run(full))!);
    const rows = screen.getByTestId("passage-distribution").querySelectorAll("li");
    expect(rows).toHaveLength(5);
    expect(rows[0].getAttribute("aria-label")).toBe('passageDistributionLevel|{"level":5,"count":1}');
    expect(rows[1].getAttribute("aria-label")).toBe('passageDistributionLevel|{"level":4,"count":0}');
    expect(rows[0].querySelector("a")?.getAttribute("href")).toBe("/libro/a");
    expect(rows[2].querySelector("a")?.getAttribute("title")).toBe("Mesías");
    expect(rows[1].querySelector("a")).toBeNull();
    expect(document.querySelector("svg")).toBeNull();
    const dist = screen.getByTestId("passage-distribution");
    expect(dist.textContent).toContain('passageRated|{"count":3}');
    expect(dist.textContent).toContain('passageMostly|{"level":5}'); // empate a 1: gana el nivel más alto
  });

  it("más de 8 obras en un nivel: se apilan 8 y el resto se resume", async () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ key: `book:${i}`, title: `T${i}`, href: `/libro/${i}`, coverUrl: null }));
    render((await run({ ...full, distribution: [{ level: 5, works: many }, ...full.distribution.slice(1)] }))!);
    const row = screen.getByTestId("passage-distribution").querySelectorAll("li")[0];
    expect(row.querySelectorAll("a")).toHaveLength(8);
    expect(row.textContent).toContain("+3");
  });

  it("sin tallas conocidas (known 0) no hay Páginas ni Tiempo; con known < of sí hay «sobre»", async () => {
    render((await run({ ...full, pages: { total: 0, known: 0, of: 2 }, minutes: { total: 0, known: 0, of: 1 } }))!);
    expect(screen.queryByText("passagePages")).toBeNull();
    expect(screen.queryByText("passageTime")).toBeNull();
    cleanup();
    render((await run(full))!);
    expect(screen.getByText("passagePages")).toBeTruthy();
    expect(screen.getByTestId("your-passage").textContent).toContain("passageOfKnown");
  });

  it("con una sola obra puntuada no hay reparto", async () => {
    render((await run({ ...full, curve: full.curve.slice(0, 1) }))!);
    expect(screen.queryByTestId("passage-distribution")).toBeNull();
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
