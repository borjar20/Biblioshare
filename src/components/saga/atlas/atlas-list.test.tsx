// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { AtlasModel } from "@/lib/sagas/atlas/model";
import { model, plane, stubResizeObserver, view, work } from "./atlas-test-harness";

let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/saga/s1/mapa",
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock("@/lib/sagas/route-actions", () => ({ adoptRoute: vi.fn(async () => ({})), dropRoute: vi.fn(async () => ({})) }));
vi.mock("@/lib/sagas/optional-actions", () => ({ skipOptional: vi.fn(async () => {}), unskipOptional: vi.fn(async () => {}) }));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (p: { alt: string }) => <img alt={p.alt} />,
}));

beforeAll(() => stubResizeObserver());
afterEach(() => {
  cleanup();
  search = "";
  sessionStorage.clear();
  window.history.replaceState(null, "", "/");
});

// Años al revés que la lectura: la lente Publicación tiene que invertir la lista.
const listed: AtlasModel = {
  ...model,
  works: [
    work("a", 0, "done", { year: 2010 }),
    work("b", 1, "now", { role: "relato", year: 2005, window: { reason: null, afterKey: "a", beforeKey: null, afterTitle: "A", beforeTitle: null, notice: null } }),
    work("c", 2, "todo", { key: "i:book:c", title: "C", year: 1990, optional: true }),
  ],
};
const toggle = () => screen.getByRole("button", { name: "Ver como lista" });
const items = () => within(screen.getByRole("list", { name: /Dune/ })).getAllByRole("listitem");

describe("Ver como lista", () => {
  it("sustituye el plano por una ol con un li por obra, en orden de lectura", () => {
    view({ model: listed });
    expect(toggle().getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(toggle());
    expect(toggle().getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("list", { name: /Dune/ }).tagName).toBe("OL");
    expect(items().map((li) => within(li).getByRole("link").textContent)).toEqual(["1A", "2B", "3C"]);
    // El plano sigue montado (la cámara mide su viewport) pero fuera del árbol accesible y del foco.
    const stage = document.querySelector<HTMLElement>("[data-atlas-stage]")!;
    expect(stage.getAttribute("aria-hidden")).toBe("true");
    expect(stage.hasAttribute("inert")).toBe(true);
    expect(screen.queryByRole("button", { name: /^A,/ })).toBeNull();
  });

  it("con lente=publicacion, en orden de año", () => {
    search = "lente=publicacion";
    view({ model: listed });
    fireEvent.click(toggle());
    expect(items().map((li) => within(li).getByRole("link").getAttribute("href"))).toEqual(["/libro/c", "/libro/b", "/libro/a"]);
  });

  it("cada entrada lleva estado (con Progreso), rol y ventana en texto, y saltar si procede", () => {
    view({ model: listed });
    fireEvent.click(toggle());
    const [, b, c] = items();
    expect(b.textContent).toContain("ahora");
    expect(b.textContent).toContain("Relato");
    expect(b.textContent).toContain("Encaja después de A");
    expect(within(c).getByTestId("skip-optional")).toBeTruthy();
    expect(within(b).queryByTestId("skip-optional")).toBeNull();
  });

  it("sin sesión, la línea no afirma estado", () => {
    view({ model: listed, authenticated: false });
    fireEvent.click(toggle());
    expect(items()[1].textContent).not.toContain("ahora");
  });

  it("volver al mapa devuelve el plano", () => {
    view({ model: listed });
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole("button", { name: "Ver como lista" }));
    expect(screen.queryByRole("list", { name: /Dune/ })).toBeNull();
    expect(screen.getByRole("button", { name: /^A,/ })).toBeTruthy();
  });
});

describe("teclado: la cámara sigue al foco", () => {
  // 40 obras: la cámara inicial centra «ahora» (w20) a k = 1 → translate(-1080px, 400px).
  const long: AtlasModel = {
    ...model,
    works: Array.from({ length: 40 }, (_, i) => work(`w${i}`, i, i < 20 ? "done" : i === 20 ? "now" : "todo")),
    nowKey: "w20",
  };
  const cell = (key: string) => document.querySelector<HTMLElement>(`[data-work-key="${key}"]`)!;

  it("enfocar con teclado una obra fuera de la vista la centra sin cambiar el zoom", () => {
    view({ model: long, workCount: 40 });
    fireEvent.keyDown(document, { key: "Tab" });
    act(() => cell("w0").focus());
    // w0 está en x = 0 → centrada: translate(600px, …) a k = 1.
    expect(plane().style.transform).toBe("translate(600px, 400px) scale(1)");
  });

  it("una obra ya visible no mueve la cámara", () => {
    view({ model: long, workCount: 40 });
    fireEvent.keyDown(document, { key: "Tab" });
    act(() => cell("w21").focus());
    expect(plane().style.transform).toBe("translate(-1080px, 400px) scale(1)");
  });

  it("el foco que llega por puntero no mueve la cámara", () => {
    view({ model: long, workCount: 40 });
    fireEvent.keyDown(document, { key: "Tab" });
    fireEvent.pointerDown(cell("w0"));
    act(() => cell("w0").focus());
    expect(plane().style.transform).toBe("translate(-1080px, 400px) scale(1)");
  });
});
