// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";
import { HeroView } from "./profile-hero";
import { FiguresView } from "./profile-figures";
import { YearView } from "./profile-year";
import { NowView } from "./profile-now";
import { CoverTile } from "./cover-tile";

vi.mock("next/image", () => ({ default: () => null }));

afterEach(cleanup);

const wrap = (ui: React.ReactNode) =>
  render(<NextIntlClientProvider locale="es" messages={messages}>{ui}</NextIntlClientProvider>);
const cover = (id: string, coverUrl: string | null = null) =>
  ({ itemType: "book" as const, itemId: id, title: `Obra ${id}`, coverUrl, href: `/libro/${id}` });

describe("HeroView", () => {
  it("sin mosaico pinta el degradado de acento y el abanico enlaza a las fichas", () => {
    wrap(<HeroView name="Mar" model={{ fan: [cover("a"), cover("b")], mosaic: [] }} />);
    expect(screen.getByTestId("profile-hero").dataset.mosaic).toBe("off");
    expect(screen.getByRole("link", { name: "Obra a" }).getAttribute("href")).toBe("/libro/a");
  });
  it("el mosaico es decorativo", () => {
    wrap(<HeroView name="Mar" model={{ fan: [], mosaic: [cover("x"), cover("y"), cover("z")] }} />);
    expect(screen.getByTestId("profile-hero-mosaic").getAttribute("aria-hidden")).toBe("true");
  });
});

describe("HeroView con mosaico y abanico", () => {
  it("pinta ambos a la vez", () => {
    wrap(<HeroView name="Mar" model={{ fan: [cover("a")], mosaic: [cover("x"), cover("y"), cover("z")] }} />);
    expect(screen.getByTestId("profile-hero-mosaic")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Obra a" })).toBeTruthy();
  });
});

describe("CoverTile", () => {
  it("sin portada enseña las iniciales", () => {
    wrap(<CoverTile cover={{ title: "Obra a", coverUrl: null }} sizes="56px" />);
    expect(screen.getByText("OA")).toBeTruthy();
  });
});

describe("FiguresView", () => {
  it("con menos de 3 notas enseña «—»", () => {
    wrap(<FiguresView stats={{ book: 1, movie: 2, series: 0 }} rating={{ average: null, count: 2 }} />);
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.getByText("libro")).toBeTruthy();
  });
  it("con media la enseña en escala de 5", () => {
    wrap(<FiguresView stats={{ book: 8, movie: 137, series: 2 }} rating={{ average: 9, count: 10 }} />);
    expect(screen.getByText("4,5")).toBeTruthy();
  });
});

describe("YearView", () => {
  it("sin datos no pinta nada", () => {
    const { container } = wrap(<YearView data={null} isOwner={false} />);
    expect(container.childElementCount).toBe(0);
  });
  it("titula «Tu» para el dueño y «Su» para un visitante", () => {
    const data = { year: 2026, total: 3, byMonth: [1, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0], bestMonth: 6, topRated: null };
    wrap(<YearView data={data} isOwner />);
    expect(screen.getByText("Tu 2026")).toBeTruthy();
  });
});

describe("YearView visitante", () => {
  it("titula «Su» y enlaza la mejor valorada", () => {
    const data = { year: 2026, total: 3, byMonth: [1, 0, 0, 0, 0, 0, 2, 0, 0, 0, 0, 0], bestMonth: 6, topRated: { ...cover("dune"), title: "Dune", href: "/libro/dune" } };
    wrap(<YearView data={data} isOwner={false} />);
    expect(screen.getByText("Su 2026")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Dune" }).getAttribute("href")).toBe("/libro/dune");
  });
});

describe("NowView", () => {
  it("sin nada en curso ni mascota no pinta nada", () => {
    const { container } = wrap(<NowView items={[]} pet={null} />);
    expect(container.childElementCount).toBe(0);
  });
  it("la primera obra lleva el avance y el resto va en pastillas", () => {
    wrap(<NowView pet={null} items={[
      { ...cover("a"), progressLabel: "Pág. 668", progressPercent: 99 },
      { ...cover("b"), progressLabel: "T2E4", progressPercent: null },
    ]} />);
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("99");
    expect(screen.getByText("También en curso")).toBeTruthy();
  });
});
