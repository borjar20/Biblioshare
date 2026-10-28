// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import messages from "../../../../messages/es.json";
import type { AtlasModel, AtlasWork } from "@/lib/sagas/atlas/model";
import { SagaAtlas, type SagaAtlasProps } from "./saga-atlas";

const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }), usePathname: () => "/saga/s1/mapa" }));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (p: { alt: string }) => <img alt={p.alt} />,
}));

beforeAll(() => {
  // Viewport fijo de 1200×800: el hook mide con ResizeObserver.
  globalThis.ResizeObserver = class {
    constructor(private cb: ResizeObserverCallback) {}
    observe() {
      this.cb([{ contentRect: { width: 1200, height: 800 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
afterEach(() => {
  cleanup();
  replace.mockReset();
  sessionStorage.clear();
});

const work = (key: string, i: number, state: AtlasWork["state"], extra: Partial<AtlasWork> = {}): AtlasWork => ({
  key, title: key.toUpperCase(), href: `/libro/${key}`, coverUrl: null, state, role: null, optional: false, skipped: false,
  ownerSagaId: "s1", regionKey: "r1", readingNo: i + 1, readingIndex: i, year: 2000 + i, extra: false, window: null,
  tandem: null, step: null, stepNote: null, ...extra,
});
const model: AtlasModel = {
  works: [work("a", 0, "done"), work("b", 1, "now", { role: "relato" }), work("c", 2, "todo")],
  regions: [{ key: "r1", name: null, accent: "verde", state: "current", counted: 3, completed: 1 }],
  nowKey: "b", mode: "next", nextTitle: "B", hasItinerary: false,
};
const props: SagaAtlasProps = {
  sagaId: "s1", sagaName: "Dune", workCount: 3, model, authenticated: true, initialLens: "orden", initialRole: null,
  routes: [{ slug: "lectura", name: "Orden de lectura", summary: null, curated: false }], activeRoute: "lectura",
  adoptedRoute: null, counter: null, canEdit: false,
};
const view = (p: Partial<SagaAtlasProps> = {}) =>
  render(<NextIntlClientProvider locale="es" messages={messages}><SagaAtlas {...props} {...p} /></NextIntlClientProvider>);

describe("SagaAtlas", () => {
  it("pinta un botón por obra con su aria-label", () => {
    view();
    expect(screen.getByRole("button", { name: "A, leída" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "B, ahora, Relato" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "C, pendiente" })).toBeTruthy();
    expect(document.querySelectorAll("[data-work-key]")).toHaveLength(3);
  });

  it("la lente activa tiene aria-pressed=true", () => {
    view({ initialLens: "publicacion" });
    expect(screen.getByRole("button", { name: "Publicación" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Orden" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("pulsar «Rol» llama a replace con lente=rol", () => {
    view();
    fireEvent.click(screen.getByRole("button", { name: "Rol" }));
    expect(replace).toHaveBeenCalledWith("/saga/s1/mapa?lente=rol", { scroll: false });
    expect(screen.getByRole("button", { name: "Rol" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("el resumen enseña «Llevas 1 de 3»", () => {
    view();
    const summary = document.querySelector("[aria-live='polite']");
    expect(summary?.textContent).toContain("Llevas 1 de 3");
    expect(summary?.textContent).toContain("te toca B");
  });

  it("el resumen de Rol lista los roles presentes en plural", () => {
    view({ initialLens: "rol" });
    expect(document.querySelector("[aria-live='polite']")?.textContent).toBe("2 principales, 1 relato");
  });

  it("los atajos 1–3 cambian de lente desde el lienzo", () => {
    view();
    fireEvent.keyDown(screen.getByRole("group", { name: /Atlas de Dune/ }), { key: "3" });
    expect(replace).toHaveBeenCalledWith("/saga/s1/mapa?lente=publicacion", { scroll: false });
  });
});
