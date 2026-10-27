// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SubsagaDoor } from "@/lib/sagas/subsaga-doors";
import { SubsagaDoors } from "./subsaga-doors";

vi.mock("next-intl/server", () => ({
  getTranslations: async () =>
    Object.assign(
      (k: string, v?: Record<string, unknown>) => (v ? `${k}:${JSON.stringify(v)}` : k),
      { rich: (k: string) => k },
    ),
}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (p: { alt: string }) => <img alt={p.alt} />,
}));
afterEach(cleanup);

const door = (over: Partial<SubsagaDoor> = {}): SubsagaDoor => ({
  sagaId: "a", name: "Crónicas", accent: "verde", href: "/saga/a", covers: ["x.jpg"],
  counted: 4, completed: 1, state: "started", ...over,
});

describe("SubsagaDoors", () => {
  it("sin puertas no pinta nada", async () => {
    expect(await SubsagaDoors({ doors: [], authenticated: true })).toBeNull();
  });
  it("una tarjeta-enlace por puerta, con título", async () => {
    render(await SubsagaDoors({ doors: [door(), door({ sagaId: "b", name: "Otra", href: "/saga/b" })], authenticated: true }));
    expect(screen.getByTestId("subsaga-doors")).toBeTruthy();
    expect(screen.getByText("doorsTitle")).toBeTruthy();
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["/saga/a", "/saga/b"]);
    expect(screen.getByText("Crónicas")).toBeTruthy();
  });
  it("una puerta done dice Terminada", async () => {
    render(await SubsagaDoors({ doors: [door({ state: "done", completed: 4 })], authenticated: true }));
    expect(screen.getByText(/doorDone/)).toBeTruthy();
    expect(screen.queryByText(/doorProgress/)).toBeNull();
  });
  it("sin sesión enseña el recuento y no «x de y»", async () => {
    render(await SubsagaDoors({ doors: [door({ completed: 0 })], authenticated: false }));
    expect(screen.getByText(/doorCount/)).toBeTruthy();
    expect(screen.queryByText(/doorProgress/)).toBeNull();
  });
  it("con sesión enseña «x de y»", async () => {
    render(await SubsagaDoors({ doors: [door()], authenticated: true }));
    expect(screen.getByText(/doorProgress/)).toBeTruthy();
  });
});
