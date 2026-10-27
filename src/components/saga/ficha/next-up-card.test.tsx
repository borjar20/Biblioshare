// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Shelf, ShelfWork } from "@/lib/sagas/derive-shelf";
import { NextUpCard } from "./next-up-card";

vi.mock("next-intl/server", () => ({
  getTranslations: async () => Object.assign((k: string) => k, { rich: (k: string) => k }),
}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (p: { alt: string }) => <img alt={p.alt} />,
}));
afterEach(cleanup);

const work: ShelfWork = { key: "i:book:b", title: "Hijos de Dune", href: "/libro/b", coverUrl: null, state: "now", role: null, optional: false, skipped: false, no: 3 };
const base: Shelf = { mode: "next", groups: [], openGroupKey: null, segments: [], nextUp: { work, groupName: "Crónicas", fitsNow: null } };

describe("NextUpCard", () => {
  it("modo next: eyebrow Te toca y enlace a la obra", async () => {
    render(await NextUpCard({ shelf: base }));
    expect(screen.getByText("nextUpEyebrow")).toBeTruthy();
    expect(screen.getByRole("link", { name: /nextUpGo/ }).getAttribute("href")).toBe("/libro/b");
  });
  it("modo start: eyebrow Empieza por", async () => {
    render(await NextUpCard({ shelf: { ...base, mode: "start" } }));
    expect(screen.getByText("nextUpStart")).toBeTruthy();
  });
  it("modo finished", async () => {
    render(await NextUpCard({ shelf: { ...base, mode: "finished", nextUp: null } }));
    expect(screen.getByText("nextUpFinished")).toBeTruthy();
  });
  it("modo empty no pinta nada", async () => {
    expect(await NextUpCard({ shelf: { ...base, mode: "empty", nextUp: null } })).toBeNull();
  });
  it("sin grupo ni número no pinta la línea de metadatos", async () => {
    render(await NextUpCard({ shelf: { ...base, nextUp: { work: { ...work, no: null }, groupName: null, fitsNow: null } } }));
    expect(document.querySelector("p.font-mono.text-muted-foreground")).toBeNull();
    cleanup();
    render(await NextUpCard({ shelf: base }));
    expect(document.querySelector("p.font-mono.text-muted-foreground")?.textContent).toBe("Crónicas · orderNo");
  });
  it("«encaja ahora» enlaza a la ficha de la ventana", async () => {
    const win: ShelfWork = { ...work, key: "i:book:w", title: "Ventana", href: "/libro/w", state: "todo", no: null };
    render(await NextUpCard({ shelf: { ...base, nextUp: { work, groupName: "Crónicas", fitsNow: win } } }));
    expect(screen.getByRole("link", { name: "nextUpFitsNow" }).getAttribute("href")).toBe("/libro/w");
  });
});
