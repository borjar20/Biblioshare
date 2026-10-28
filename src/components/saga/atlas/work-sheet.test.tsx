// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { AtlasModel } from "@/lib/sagas/atlas/model";
import { model, plane, stubResizeObserver, view, work } from "./atlas-test-harness";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/saga/s1/mapa",
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("@/lib/sagas/route-actions", () => ({ adoptRoute: vi.fn(async () => ({})), dropRoute: vi.fn(async () => ({})) }));
// Las actions de saltar importan el cliente de servidor: en jsdom no se pueden cargar.
vi.mock("@/lib/sagas/optional-actions", () => ({ skipOptional: vi.fn(async () => {}), unskipOptional: vi.fn(async () => {}) }));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (p: { alt: string }) => <img alt={p.alt} />,
}));

beforeAll(() => stubResizeObserver());
afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

const rich: AtlasModel = {
  ...model,
  works: [
    work("a", 0, "done"),
    work("b", 1, "now", {
      role: "relato",
      window: { reason: "spoiler", afterKey: "a", beforeKey: "c", afterTitle: "A", beforeTitle: "C", notice: "dentro" },
      step: 2, stepNote: "Justo después del prólogo",
    }),
    // Clave real (`i:tipo:id`): el botón de saltar saca de ella el par (tipo, id).
    work("c", 2, "todo", { key: "i:book:c", title: "C", optional: true, tandem: { mode: "simultaneo", note: null, partnerKeys: ["d"] } }),
    work("d", 3, "todo", { tandem: { mode: "indistinto", note: "Da igual cuál primero", partnerKeys: ["i:book:c"] } }),
  ],
};
const open = (name: RegExp) => {
  fireEvent.click(screen.getByRole("button", { name }));
  return screen.getByRole("dialog");
};

describe("mini-ficha", () => {
  it("clic en una obra con ventana enseña «Encaja entre A y C», el motivo y «Ahora encaja»", () => {
    view({ model: rich });
    const sheet = open(/^B,/);
    expect(sheet.textContent).toContain("Encaja entre A y C");
    expect(sheet.textContent).toContain("Fuera de la ventana hay spoilers");
    expect(sheet.textContent).toContain("Ahora encaja");
  });

  it("enseña título, número, rol con glifo, paso y su nota", () => {
    view({ model: rich });
    const sheet = open(/^B,/);
    expect(within(sheet).getByRole("heading").textContent).toBe("B");
    expect(sheet.textContent).toContain("#2");
    expect(sheet.textContent).toContain("✦");
    expect(sheet.textContent).toContain("Relato");
    expect(sheet.textContent).toContain("Paso 2 del itinerario");
    expect(sheet.querySelector("em")?.textContent).toBe("Justo después del prólogo");
  });

  it("tándem: los títulos de las compañeras y la nota", () => {
    view({ model: rich });
    expect(open(/^C(,|$)/).textContent).toContain("A la vez que D");
    fireEvent.keyDown(document, { key: "Escape" });
    const d = open(/^D,/);
    expect(d.textContent).toContain("En cualquier orden con C");
    expect(d.textContent).toContain("Da igual cuál primero");
  });

  it("«Abrir ficha» enlaza a work.href", () => {
    view({ model: rich });
    const sheet = open(/^B,/);
    expect(within(sheet).getByRole("link", { name: "Abrir ficha" }).getAttribute("href")).toBe("/libro/b");
  });

  it("una opcional con sesión tiene skip-optional; sin sesión, no", () => {
    view({ model: rich });
    expect(within(open(/^C(,|$)/)).getByTestId("skip-optional")).toBeTruthy();
    cleanup();
    view({ model: rich, authenticated: false });
    expect(within(open(/^C(,|$)/)).queryByTestId("skip-optional")).toBeNull();
  });

  it("una opcional ya saltada ofrece deshacer", () => {
    const skipped = { ...rich, works: rich.works.map((w) => (w.key === "i:book:c" ? { ...w, skipped: true } : w)) };
    view({ model: skipped });
    expect(within(open(/^C(,|$)/)).getByTestId("unskip-optional").textContent).toBe("Deshacer");
  });

  it("una obra no opcional no tiene botón de saltar", () => {
    view({ model: rich });
    expect(within(open(/^B,/)).queryByTestId("skip-optional")).toBeNull();
  });

  it("clic en una obra abre la ficha sin mover la cámara", () => {
    view({ model: rich });
    const before = plane().style.transform;
    open(/^B,/);
    expect(plane().style.transform).toBe(before);
  });

  it("Escape cierra la mini-ficha y devuelve el foco a la obra", () => {
    view({ model: rich });
    open(/^B,/);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement?.getAttribute("data-work-key")).toBe("b");
  });

  it("✕ cierra la mini-ficha", () => {
    view({ model: rich });
    const sheet = open(/^B,/);
    fireEvent.click(within(sheet).getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("tocar otra obra cambia de ficha; tocar el lienzo vacío la cierra", () => {
    view({ model: rich });
    open(/^B,/);
    const a = screen.getByRole("button", { name: /^A,/ });
    fireEvent.pointerDown(a);
    expect(screen.getByRole("dialog")).toBeTruthy(); // sin parpadeo: no se cierra para reabrirse
    fireEvent.click(a);
    expect(within(screen.getByRole("dialog")).getByRole("heading").textContent).toBe("A");
    fireEvent.pointerDown(screen.getByRole("group", { name: /Atlas de Dune/ }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("la obra seleccionada lo dice con aria-expanded", () => {
    view({ model: rich });
    open(/^B,/);
    expect(screen.getByRole("button", { name: /^B,/ }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: /^A,/ }).getAttribute("aria-expanded")).toBe("false");
  });
});
