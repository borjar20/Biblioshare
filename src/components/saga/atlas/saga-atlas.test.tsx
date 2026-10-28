// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import messages from "../../../../messages/es.json";
import type { AtlasModel, AtlasWork } from "@/lib/sagas/atlas/model";
import { SagaAtlas, type SagaAtlasProps } from "./saga-atlas";
import { AtlasWork as AtlasWorkCell } from "./atlas-work";

const replace = vi.fn();
let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/saga/s1/mapa",
  useSearchParams: () => new URLSearchParams(search),
}));
// Server actions de Adoptar: en jsdom no se pueden importar (importan el cliente de servidor).
vi.mock("@/lib/sagas/route-actions", () => ({ adoptRoute: vi.fn(async () => ({})), dropRoute: vi.fn(async () => ({})) }));
vi.mock("@/lib/sagas/optional-actions", () => ({ skipOptional: vi.fn(async () => {}), unskipOptional: vi.fn(async () => {}) }));
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
  sagaId: "s1", sagaName: "Dune", workCount: 3, model, authenticated: true,
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
    search = "lente=publicacion";
    view();
    expect(screen.getByRole("button", { name: "Publicación" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Orden" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("la lente sale de la URL del cliente aunque el payload cacheado diga otra", () => {
    search = "lente=rol";
    view();
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
    search = "lente=rol";
    view();
    expect(document.querySelector("[aria-live='polite']")?.textContent).toBe("2 principales, 1 relato");
  });

  it("los atajos 1–3 cambian de lente desde el lienzo", () => {
    view();
    fireEvent.keyDown(stage(), { key: "3" });
    expect(window.location.search).toBe("?lente=publicacion");
  });

  it("volver a Orden quita lente y conserva ruta", () => {
    window.history.replaceState(null, "", "/saga/s1/mapa?lente=rol&ruta=cronologico");
    search = "lente=rol";
    view();
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

  it("cámara inicial: «ahora» se centra en la zona libre entre la barra y el dock medidos", () => {
    // Barra de 150 px arriba y dock que empieza a 700 (100 px abajo) en un lienzo de 800.
    const rect = (top: number, bottom: number) => ({ top, bottom, left: 0, right: 1200, width: 1200, height: bottom - top, x: 0, y: top, toJSON() {} }) as DOMRect;
    const spy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const chrome = this.getAttribute("data-atlas-chrome");
      if (chrome === "top") return rect(0, 150);
      if (chrome === "dock") return rect(700, 784);
      if (this.getAttribute("role") === "group" && this.tabIndex === 0) return rect(0, 800);
      return rect(0, 0);
    });
    try {
      const works = Array.from({ length: 40 }, (_, i) => work(`w${i}`, i, i < 20 ? "done" : i === 20 ? "now" : "todo"));
      view({ model: { ...model, works, nowKey: "w20" }, workCount: 40 });
      // Centro de la zona libre: 150 + (700 − 150) / 2 = 425 (antes, 400: bajo la barra en móvil).
      expect(plane().style.transform).toBe("translate(-1080px, 425px) scale(1)");
    } finally {
      spy.mockRestore();
    }
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
    expect(plane().style.transform).not.toBe("");
    fireEvent.pointerUp(stage(), { pointerId: 1, pointerType: "mouse" });
    await new Promise((r) => setTimeout(r, 0));
    fireEvent.click(screen.getByRole("button", { name: "A, leída" }));
    // El clic abre la mini-ficha (ya no acerca la cámara: Task 9).
    expect(screen.getByRole("dialog", { name: "A" })).toBeTruthy();
  });

  it("el clic que cierra un arrastre no abre la mini-ficha", () => {
    view();
    const a = screen.getByRole("button", { name: "A, leída" });
    fireEvent.pointerDown(a, { pointerId: 1, pointerType: "mouse", button: 0, buttons: 1, clientX: 100, clientY: 100 });
    fireEvent.pointerMove(stage(), { pointerId: 1, pointerType: "mouse", buttons: 1, clientX: 140, clientY: 100 });
    fireEvent.pointerUp(stage(), { pointerId: 1, pointerType: "mouse" });
    fireEvent.click(a);
    expect(screen.queryByRole("dialog")).toBeNull();
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

describe("lentes Rol y Publicación", () => {
  it("Rol: una etiqueta de carril por rol presente", () => {
    search = "lente=rol";
    view();
    expect(screen.getByText("principales")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Relato" })).toBeTruthy();
    expect(screen.queryByText("Precuela")).toBeNull();
  });

  it("Rol: con ?rol=relato, las obras sin ese rol quedan atenuadas", () => {
    search = "lente=rol&rol=relato";
    view();
    const dimmed = (k: string) => document.querySelector(`[data-work-key="${k}"]`)!.getAttribute("data-dimmed");
    expect(dimmed("a")).toBe("true");
    expect(dimmed("c")).toBe("true");
    expect(dimmed("b")).toBeNull();
  });

  it("Rol: tocar la etiqueta fija y quita el resaltado en la URL", () => {
    search = "lente=rol";
    window.history.replaceState(null, "", "/saga/s1/mapa?lente=rol&ruta=x");
    view();
    fireEvent.click(screen.getByRole("button", { name: "Relato" }));
    expect(window.location.search).toBe("?lente=rol&ruta=x&rol=relato");
    expect(document.querySelector('[data-work-key="a"]')!.getAttribute("data-dimmed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Relato" }));
    expect(window.location.search).toBe("?lente=rol&ruta=x");
    expect(document.querySelector('[data-work-key="a"]')!.getAttribute("data-dimmed")).toBeNull();
  });

  it("Rol: sin ?rol= nada está atenuado", () => {
    search = "lente=rol";
    view();
    expect(document.querySelectorAll("[data-dimmed]")).toHaveLength(0);
  });

  it("Publicación: el resumen nombra el rango de años", () => {
    search = "lente=publicacion";
    view();
    expect(document.querySelector("[aria-live='polite']")?.textContent).toContain("De 2000 a 2002");
  });

  it("Publicación: ticks por año y número de lectura en cada obra", () => {
    search = "lente=publicacion";
    view();
    expect(screen.getByText("2001")).toBeTruthy();
    expect(document.querySelector('[data-work-key="b"] [data-reading-no]')!.textContent).toBe("2");
  });

  it("Publicación: «sin año» y «·» para obras sin año ni número", () => {
    search = "lente=publicacion";
    const works = [work("a", 0, "done", { year: null, readingNo: null }), work("b", 1, "todo")];
    view({ model: { ...model, works, nowKey: null } });
    expect(screen.getByText("sin año")).toBeTruthy();
    expect(document.querySelector('[data-work-key="a"] [data-reading-no]')!.textContent).toBe("·");
  });

  it("Orden no pinta insignias de lectura", () => {
    view();
    expect(document.querySelectorAll("[data-reading-no]")).toHaveLength(0);
  });
  it("el número de lectura no se repite bajo el título cuando hay insignia (Publicación)", () => {
    const w = work("a", 0, "todo");
    const mount = (showReadingNo: boolean) => {
      cleanup();
      render(
        <NextIntlClientProvider locale="es" messages={messages}>
          <AtlasWorkCell work={w} placed={{ key: "a", x: 0, y: 0, scale: 1 }} accent="verde" level="detail" showReadingNo={showReadingNo} />
        </NextIntlClientProvider>,
      );
    };
    mount(true);
    expect(document.body.textContent).not.toContain("#1");
    mount(false);
    expect(document.body.textContent).toContain("#1");
  });
});

describe("capas Itinerario y Progreso, y hoja de itinerarios", () => {
  const routes: SagaAtlasProps["routes"] = [
    { slug: "lectura", name: "Orden de lectura", summary: null, curated: false },
    { slug: "la-guardia", name: "La Guardia", summary: "Solo los libros de la Guardia.", curated: true },
  ];
  const itinerary: AtlasModel = {
    ...model,
    works: [work("a", 0, "done", { step: 1 }), work("b", 1, "now", { role: "relato", step: 2 }), work("c", 2, "todo")],
    hasItinerary: true,
  };

  // Que «Publicación» no llegue como ruta lo cubre `atlasRoutes` (lens.test.ts).
  it("abrir el chip lista las rutas y el resumen de la activa", () => {
    view({ routes, activeRoute: "la-guardia" });
    const chip = screen.getByRole("button", { name: "Itinerario: La Guardia" });
    expect(chip.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(chip);
    expect(chip.getAttribute("aria-expanded")).toBe("true");
    const dialog = screen.getByRole("dialog", { name: "Elige itinerario" });
    expect(dialog).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Orden de lectura" })).toBeTruthy();
    expect((screen.getByRole("radio", { name: "La Guardia" }) as HTMLInputElement).checked).toBe(true);
    expect(dialog.textContent).toContain("Solo los libros de la Guardia.");
  });

  it("sin rutas curadas el chip es una etiqueta que no despliega", () => {
    view();
    expect(screen.queryByRole("button", { name: /Itinerario/ })).toBeNull();
    expect(screen.getByText("Orden de lectura")).toBeTruthy();
  });

  it("elegir una ruta llama a replace con ruta= y conserva lente", () => {
    window.history.replaceState(null, "", "/saga/s1/mapa?lente=rol");
    search = "lente=rol";
    view({ routes, activeRoute: "lectura" });
    fireEvent.click(screen.getByRole("button", { name: "Itinerario: Orden de lectura" }));
    fireEvent.click(screen.getByRole("radio", { name: "La Guardia" }));
    expect(replace).toHaveBeenCalledWith("/saga/s1/mapa?lente=rol&ruta=la-guardia", { scroll: false });
  });

  it("Escape cierra la hoja y devuelve el foco al chip", () => {
    view({ routes, activeRoute: "la-guardia" });
    const chip = screen.getByRole("button", { name: "Itinerario: La Guardia" });
    fireEvent.click(chip);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(chip);
  });

  it("tocar fuera cierra la hoja", () => {
    view({ routes, activeRoute: "la-guardia" });
    fireEvent.click(screen.getByRole("button", { name: "Itinerario: La Guardia" }));
    fireEvent.pointerDown(stage());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  // Secuencia de un clic real de ratón (pointerdown → pointerup → click): ningún control del
  // cromo puede depender de que el lienzo no vea el pointerdown.
  const realClick = (el: Element) => {
    fireEvent.pointerDown(el, { pointerId: 1, pointerType: "mouse", button: 0, buttons: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerUp(el, { pointerId: 1, pointerType: "mouse", button: 0, clientX: 10, clientY: 10 });
    fireEvent.click(el, { detail: 1 });
  };

  it("un clic real (pointerdown, pointerup, click) en el chip abre la hoja", () => {
    view({ routes, activeRoute: "la-guardia" });
    const chip = screen.getByRole("button", { name: "Itinerario: La Guardia" });
    realClick(chip.querySelector("span:nth-child(2)")!); // el texto del chip, como en el navegador
    expect(chip.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("dialog")).toBeTruthy();
    realClick(chip);
    expect(chip.getAttribute("aria-expanded")).toBe("false");
  });

  it("un clic real en Progreso, en las lentes y en el zoom funciona igual", () => {
    view({ routes, activeRoute: "la-guardia" });
    const toggle = screen.getByRole("button", { name: "Progreso" });
    realClick(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    realClick(screen.getByRole("button", { name: "Rol" }));
    expect(screen.getByRole("button", { name: "Rol" }).getAttribute("aria-pressed")).toBe("true");
    const k = () => plane().style.transform;
    const before = k();
    realClick(screen.getByRole("button", { name: "Acercar" }));
    expect(k()).not.toBe(before);
  });

  it("el cromo (barra, dock, zoom) no vive dentro del lienzo que toma los gestos", () => {
    view({ routes, activeRoute: "la-guardia" });
    for (const name of ["Itinerario: La Guardia", "Progreso", "Orden", "Acercar"]) {
      expect(stage().contains(screen.getByRole("button", { name }))).toBe(false);
    }
  });

  it("las flechas solo mueven la selección; Enter la confirma (una navegación)", () => {
    view({ routes, activeRoute: "la-guardia" });
    fireEvent.click(screen.getByRole("button", { name: "Itinerario: La Guardia" }));
    const guardia = screen.getByRole("radio", { name: "La Guardia" });
    const lectura = screen.getByRole("radio", { name: "Orden de lectura" }) as HTMLInputElement;
    // El navegador, con una flecha: keydown en la radio enfocada y luego click/change en la siguiente.
    fireEvent.keyDown(guardia, { key: "ArrowUp" });
    fireEvent.click(lectura);
    expect(replace).not.toHaveBeenCalled();
    expect(lectura.checked).toBe(true);
    fireEvent.keyDown(lectura, { key: "Enter" });
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith("/saga/s1/mapa?ruta=lectura", { scroll: false });
  });

  it("Espacio confirma la radio enfocada", () => {
    view({ routes, activeRoute: "la-guardia" });
    fireEvent.click(screen.getByRole("button", { name: "Itinerario: La Guardia" }));
    const lectura = screen.getByRole("radio", { name: "Orden de lectura" });
    fireEvent.keyDown(lectura, { key: "ArrowUp" });
    fireEvent.click(lectura);
    expect(replace).not.toHaveBeenCalled();
    fireEvent.keyDown(lectura, { key: " " });
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it("tocar fuera cierra sin llevar el foco al chip; cerrar con el chip sí lo lleva", () => {
    view({ routes, activeRoute: "la-guardia" });
    const chip = screen.getByRole("button", { name: "Itinerario: La Guardia" });
    fireEvent.click(chip);
    stage().focus();
    fireEvent.pointerDown(stage());
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(stage());
    fireEvent.click(chip);
    fireEvent.click(chip);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(chip);
  });

  describe("hoja en móvil (< 640 px)", () => {
    const setNarrow = (narrow: boolean) => {
      window.matchMedia = ((q: string) => ({
        matches: narrow && q.includes("max-width"), media: q, onchange: null,
        addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
      })) as unknown as typeof window.matchMedia;
    };
    afterEach(() => {
      delete (window as { matchMedia?: unknown }).matchMedia;
    });

    it("si el foco sale de la hoja, se cierra", () => {
      setNarrow(true);
      view({ routes, activeRoute: "la-guardia" });
      fireEvent.click(screen.getByRole("button", { name: "Itinerario: La Guardia" }));
      const radio = screen.getByRole("radio", { name: "La Guardia" });
      fireEvent.blur(radio, { relatedTarget: stage() });
      expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("el foco que se mueve dentro de la hoja no la cierra", () => {
      setNarrow(true);
      view({ routes, activeRoute: "la-guardia" });
      fireEvent.click(screen.getByRole("button", { name: "Itinerario: La Guardia" }));
      fireEvent.blur(screen.getByRole("radio", { name: "La Guardia" }), { relatedTarget: screen.getByRole("dialog") });
      expect(screen.getByRole("dialog")).toBeTruthy();
    });

    it("en escritorio, el foco que sale no la cierra (desplegable no modal)", () => {
      setNarrow(false);
      view({ routes, activeRoute: "la-guardia" });
      fireEvent.click(screen.getByRole("button", { name: "Itinerario: La Guardia" }));
      fireEvent.blur(screen.getByRole("radio", { name: "La Guardia" }), { relatedTarget: stage() });
      expect(screen.getByRole("dialog")).toBeTruthy();
    });
  });

  it("con counter sale «Llevas 0 de 2 de esta ruta», Adoptar y el enlace de gestión", () => {
    view({ routes, activeRoute: "la-guardia", counter: { completed: 0, total: 2 }, canEdit: true });
    fireEvent.click(screen.getByRole("button", { name: "Itinerario: La Guardia" }));
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("Llevas 0 de 2 de esta ruta");
    expect(screen.getByRole("button", { name: "Leer por aquí" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Gestionar itinerarios/ }).getAttribute("href")).toBe("/saga/s1/rutas");
  });

  it("sin sesión no hay Adoptar ni interruptor de Progreso, y la obra no dice estado", () => {
    view({ routes, activeRoute: "la-guardia", authenticated: false });
    expect(screen.queryByRole("button", { name: "Progreso" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Itinerario: La Guardia" }));
    expect(screen.queryByRole("button", { name: "Leer por aquí" })).toBeNull();
    expect(screen.queryByRole("link", { name: /Gestionar/ })).toBeNull();
    expect(screen.getByRole("button", { name: "C" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "B, Relato" })).toBeTruthy();
  });

  it("con hasItinerary, las obras sin paso llevan data-dimmed y las otras su paso en el nombre", () => {
    view({ model: itinerary, routes, activeRoute: "la-guardia" });
    expect(document.querySelector('[data-work-key="c"]')!.getAttribute("data-dimmed")).toBe("true");
    expect(document.querySelector('[data-work-key="a"]')!.getAttribute("data-dimmed")).toBeNull();
    expect(screen.getByRole("button", { name: "B, ahora, Relato, Paso 2 del itinerario" })).toBeTruthy();
    // Un círculo numerado por paso en el fondo.
    expect([...document.querySelectorAll("[data-step-badge]")].map((n) => n.textContent)).toEqual(["1", "2"]);
  });

  it("la opacidad es el mínimo de las fuentes de atenuación", () => {
    view({ model: itinerary, routes, activeRoute: "la-guardia" });
    const dim = (k: string) => (document.querySelector(`[data-work-key="${k}"]`) as HTMLElement).style.getPropertyValue("--dim");
    expect(dim("a")).toBe("1");
    expect(dim("c")).toBe("0.3"); // fuera de ruta (0,3) gana a pendiente (0,4)
  });

  it("con Progreso, la obra «ahora» lleva la etiqueta «ahora»; apagado, se quita", () => {
    view();
    const now = () => document.querySelector('[data-work-key="b"] [data-now-label]');
    expect(now()?.textContent).toBe("ahora");
    expect(document.querySelector('[data-work-key="a"] [data-done-mark]')).toBeTruthy();
    const toggle = screen.getByRole("button", { name: "Progreso" });
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(now()).toBeNull();
    expect(screen.getByRole("button", { name: "C" })).toBeTruthy();
    expect((document.querySelector('[data-work-key="c"]') as HTMLElement).style.getPropertyValue("--dim")).toBe("1");
  });
});
