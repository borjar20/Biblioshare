// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import messages from "../../../../messages/es.json";
import type { AtlasModel, AtlasWork } from "@/lib/sagas/atlas/model";
import { SagaAtlas, type SagaAtlasProps } from "./saga-atlas";

const replace = vi.fn();
let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/saga/s1/mapa",
  useSearchParams: () => new URLSearchParams(search),
}));
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
  search = "";
  replace.mockReset();
  sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});

const plane = () => document.querySelector<HTMLElement>("[data-level]")!;
const stage = () => screen.getByRole("group", { name: /Atlas de Dune/ });

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

  it("la lente sale de la URL del cliente aunque el payload cacheado diga otra", () => {
    search = "lente=rol";
    view({ initialLens: "orden" });
    expect(screen.getByRole("button", { name: "Rol" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("data-ready aparece solo tras medir el viewport y pintar", async () => {
    view();
    const root = document.querySelector<HTMLElement>("[data-progress]")!;
    await waitFor(() => expect(root.getAttribute("data-ready")).toBe("true"));
  });

  it("pulsar «Rol» cambia la URL con replaceState, sin pasar por el router", () => {
    view();
    fireEvent.click(screen.getByRole("button", { name: "Rol" }));
    expect(window.location.pathname + window.location.search).toBe("/saga/s1/mapa?lente=rol");
    expect(replace).not.toHaveBeenCalled();
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
    fireEvent.keyDown(stage(), { key: "3" });
    expect(window.location.search).toBe("?lente=publicacion");
  });

  it("volver a Orden quita lente y conserva ruta", () => {
    window.history.replaceState(null, "", "/saga/s1/mapa?lente=rol&ruta=cronologico");
    view({ initialLens: "rol" });
    fireEvent.click(screen.getByRole("button", { name: "Orden" }));
    expect(window.location.search).toBe("?ruta=cronologico");
  });

  it("cámara inicial: una saga corta se encaja entera (hasta 2×)", () => {
    view();
    expect(plane().style.transform).toContain("scale(2)");
  });

  it("cámara inicial: una saga larga que no cabe a 0,9 se centra en «ahora» a k = 1", () => {
    const works = Array.from({ length: 40 }, (_, i) => work(`w${i}`, i, i < 20 ? "done" : i === 20 ? "now" : "todo"));
    view({ model: { ...model, works, nowKey: "w20" }, workCount: 40 });
    // «ahora» es la 21.ª: x = 20 · 84 = 1680 → translate(600 − 1680) a k = 1.
    expect(plane().style.transform).toBe("translate(-1080px, 400px) scale(1)");
  });

  it("un ratón soltado fuera antes del umbral no deja el puntero pegado (buttons = 0)", () => {
    view();
    const before = plane().style.transform;
    fireEvent.pointerDown(stage(), { pointerId: 1, pointerType: "mouse", button: 0, buttons: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(stage(), { pointerId: 1, pointerType: "mouse", buttons: 0, clientX: 300, clientY: 300 });
    fireEvent.pointerMove(stage(), { pointerId: 1, pointerType: "mouse", buttons: 0, clientX: 400, clientY: 400 });
    expect(plane().style.transform).toBe(before);
  });

  it("un pointerup en window limpia el puntero aunque no llegue al lienzo", () => {
    view();
    const before = plane().style.transform;
    fireEvent.pointerDown(stage(), { pointerId: 7, pointerType: "touch", clientX: 100, clientY: 100 });
    fireEvent.pointerUp(window, { pointerId: 7, pointerType: "touch" });
    fireEvent.pointerMove(stage(), { pointerId: 7, pointerType: "touch", clientX: 300, clientY: 300 });
    expect(plane().style.transform).toBe(before);
  });

  it("tras un arrastre, un clic posterior (Enter) en una obra no se lo come el arrastre", async () => {
    view();
    fireEvent.pointerDown(stage(), { pointerId: 1, pointerType: "mouse", button: 0, buttons: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(stage(), { pointerId: 1, pointerType: "mouse", buttons: 1, clientX: 140, clientY: 100 });
    const dragged = plane().style.transform;
    expect(dragged).not.toBe("");
    fireEvent.pointerUp(stage(), { pointerId: 1, pointerType: "mouse" });
    await new Promise((r) => setTimeout(r, 0));
    fireEvent.click(screen.getByRole("button", { name: "A, leída" }));
    expect(plane().style.transform).not.toBe(dragged);
  });

  it("la cámara movida se guarda al desmontar aunque no haya pasado el debounce", () => {
    const { unmount } = view();
    fireEvent.click(screen.getByRole("button", { name: "Acercar" }));
    expect(sessionStorage.getItem("saga-atlas:s1")).toBeNull();
    unmount();
    expect(JSON.parse(sessionStorage.getItem("saga-atlas:s1")!)).toMatchObject({ k: 2.5 });
  });

  it("la isla en curso lo dice en su aria-label y con texto visible", () => {
    const two: AtlasModel = {
      ...model,
      works: [work("a", 0, "done"), work("b", 1, "now", { regionKey: "r2" }), work("c", 2, "todo", { regionKey: "r2" })],
      regions: [
        { key: "r1", name: "Uno", accent: "verde", state: "done", counted: 1, completed: 1 },
        { key: "r2", name: "Dos", accent: "verde", state: "current", counted: 2, completed: 0 },
      ],
    };
    view({ model: two });
    for (let i = 0; i < 8; i++) fireEvent.click(screen.getByRole("button", { name: "Alejar" }));
    expect(plane().dataset.level).toBe("islands");
    const island = screen.getByRole("button", { name: "Dos: 0 de 2 leídas, en curso" });
    expect(island.textContent).toContain("en curso");
    expect(screen.getByRole("button", { name: "Uno: 1 de 1 leídas" }).textContent).not.toContain("en curso");
  });
});
