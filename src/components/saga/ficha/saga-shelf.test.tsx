// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Shelf, ShelfWork } from "@/lib/sagas/derive-shelf";
import { SagaShelf } from "./saga-shelf";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string, v?: Record<string, unknown>) => (v ? `${key}:${JSON.stringify(v)}` : key) }));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (p: { alt: string }) => <img alt={p.alt} />,
}));

beforeAll(() => { Element.prototype.scrollIntoView = vi.fn(); });
afterEach(cleanup);

const w = (key: string, state: ShelfWork["state"], extra: Partial<ShelfWork> = {}): ShelfWork =>
  ({ key, title: key.toUpperCase(), href: `/libro/${key}`, coverUrl: null, state, role: null, optional: false, skipped: false, no: null, ...extra });

const shelf: Shelf = {
  mode: "next",
  openGroupKey: "s2",
  nextUp: null,
  groups: [
    { key: "s1", name: "Uno", accent: "verde", state: "done", counted: 1, completed: 1, slots: [{ kind: "work", work: w("a", "done") }], extras: [], pileCovers: [] },
    { key: "s2", name: "Dos", accent: "terracota", state: "current", counted: 2, completed: 0, slots: [{ kind: "work", work: w("b", "now", { role: "precuela" }) }, { kind: "tandem", works: [w("c", "todo"), w("d", "todo")] }], extras: [w("x", "todo", { optional: true })], pileCovers: [] },
  ],
  segments: [
    { groupKey: "s1", weight: 1, done: 1, hasNow: false },
    { groupKey: "s2", weight: 3, done: 0, hasNow: true },
  ],
};

const props = { shelf, sagaName: "Dune", routes: [{ slug: "lectura", name: "Lectura" }, { slug: "publicacion", name: "Publicación" }], activeRoute: "lectura", baseHref: "/saga/1", readingHref: "/saga/1/como-leerla?ruta=lectura" };

describe("SagaShelf", () => {
  it("despliega el grupo abierto y apila el resto", () => {
    render(<SagaShelf {...props} />);
    expect(screen.getByTestId("shelf-pile-s1")).toBeTruthy();
    expect(screen.queryByTestId("shelf-pile-s2")).toBeNull();
    expect(screen.getByTestId("shelf-now").getAttribute("href")).toBe("/libro/b");
  });

  it("pulsar una pila la despliega", () => {
    render(<SagaShelf {...props} />);
    fireEvent.click(screen.getByTestId("shelf-pile-s1"));
    expect(screen.getByTestId("shelf-pile-s2")).toBeTruthy();
    expect(screen.queryByTestId("shelf-pile-s1")).toBeNull();
  });

  it("pulsar un segmento de la minibarra despliega su grupo", () => {
    render(<SagaShelf {...props} />);
    fireEvent.click(screen.getByTestId("shelf-segment-s1"));
    expect(screen.queryByTestId("shelf-pile-s1")).toBeNull();
    expect(screen.getByTestId("shelf-pile-s2")).toBeTruthy();
    expect(screen.getByTestId("shelf-segment-s1").getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByTestId("shelf-now")).toBeNull();
    expect(document.activeElement?.getAttribute("href")).toBe("/libro/a");
  });

  it("si el grupo abierto no existe en la balda nueva, despliega el abierto por defecto", () => {
    const { rerender } = render(<SagaShelf {...props} />);
    fireEvent.click(screen.getByTestId("shelf-pile-s1"));
    // Otra balda (otro itinerario) con el MISMO openGroupKey pero sin «s1».
    const other: Shelf = {
      ...shelf,
      groups: [shelf.groups[1], { ...shelf.groups[0], key: "s3", name: "Tres" }],
      segments: [shelf.segments[1], { ...shelf.segments[0], groupKey: "s3" }],
    };
    rerender(<SagaShelf {...props} shelf={other} />);
    expect(screen.queryByTestId("shelf-pile-s2")).toBeNull();
    expect(screen.getByTestId("shelf-pile-s3")).toBeTruthy();
    expect(screen.getByTestId("shelf-segment-s2").getAttribute("aria-pressed")).toBe("true");
  });

  it("chips de itinerario solo con más de una ruta, y enlazan con ?ruta=", () => {
    const { rerender } = render(<SagaShelf {...props} />);
    expect(screen.getByRole("link", { name: "Publicación" }).getAttribute("href")).toBe("/saga/1?ruta=publicacion");
    rerender(<SagaShelf {...props} routes={[{ slug: "lectura", name: "Lectura" }]} />);
    expect(screen.queryByRole("link", { name: "Publicación" })).toBeNull();
  });

  it("la lista accesible contiene todas las obras, también las de grupos plegados y los extras", () => {
    render(<SagaShelf {...props} />);
    const items = within(screen.getByTestId("shelf-a11y-list")).getAllByRole("listitem");
    expect(items).toHaveLength(5);
  });

  it("el rol se pinta traducido, en la portada y en la lista accesible", () => {
    render(<SagaShelf {...props} />);
    expect(screen.getByTestId("shelf-now").textContent).toContain("roleLabel.precuela");
    expect(screen.getByTestId("shelf-a11y-list").textContent).toContain("roleLabel.precuela");
  });

  it("la lista accesible marca estado, tándem y opcional", () => {
    render(<SagaShelf {...props} />);
    const text = screen.getByTestId("shelf-a11y-list").textContent ?? "";
    expect(text).toContain("shelfState_done");
    expect(text).toContain("shelfTandem");
    expect(text).toContain("optionalChip");
  });

  it("un solo grupo no pinta pilas", () => {
    const one: Shelf = { ...shelf, groups: [shelf.groups[1]], segments: [shelf.segments[1]], openGroupKey: "s2" };
    render(<SagaShelf {...props} shelf={one} />);
    expect(screen.queryByTestId("shelf-pile-s1")).toBeNull();
    expect(screen.getByTestId("shelf-now")).toBeTruthy();
  });

  it("los enlaces de las portadas nunca van aria-hidden", () => {
    render(<SagaShelf {...props} />);
    expect(screen.getByTestId("shelf-now").closest("[aria-hidden='true']")).toBeNull();
  });

  it("rerender con otro openGroupKey abre ese grupo", () => {
    const { rerender } = render(<SagaShelf {...props} />);
    rerender(<SagaShelf {...props} shelf={{ ...shelf, openGroupKey: "s1" }} />);
    expect(screen.getByTestId("shelf-pile-s2")).toBeTruthy();
    expect(screen.queryByTestId("shelf-pile-s1")).toBeNull();
  });

  it("al abrir una pila el foco pasa a la balda desplegada", () => {
    render(<SagaShelf {...props} shelf={{ ...shelf, openGroupKey: "s1" }} />);
    fireEvent.click(screen.getByTestId("shelf-pile-s2"));
    expect(document.activeElement).toBe(screen.getByTestId("shelf-now"));
  });

  it("los enlaces de la lista accesible no son paradas de tabulador", () => {
    render(<SagaShelf {...props} />);
    for (const a of within(screen.getByTestId("shelf-a11y-list")).getAllByRole("link")) expect(a.getAttribute("tabindex")).toBe("-1");
  });

  it("una obra saltada se anuncia en la lista accesible", () => {
    const sk: Shelf = { ...shelf, groups: [shelf.groups[0], { ...shelf.groups[1], extras: [w("z", "todo", { skipped: true })] }] };
    render(<SagaShelf {...props} shelf={sk} />);
    expect(screen.getByTestId("shelf-a11y-list").textContent).toContain("shelfSkipped");
  });

  it("ventana: el arco ocupa de spanFrom+1 a spanTo+2 y el texto usa solo la mitad disponible", () => {
    const win: Shelf = {
      ...shelf,
      groups: [
        shelf.groups[0],
        {
          ...shelf.groups[1],
          slots: [
            { kind: "work", work: w("b", "now") },
            { kind: "work", work: w("e", "todo") },
            { kind: "window", work: w("f", "todo"), afterTitle: "B", beforeTitle: null, spanFrom: 0, spanTo: 1, fitsNow: true },
          ],
          extras: [],
        },
      ],
    };
    const { container } = render(<SagaShelf {...props} shelf={win} />);
    const arc = container.querySelector<HTMLElement>("span[aria-hidden][style*='grid-column']");
    expect(arc?.style.gridColumn).toBe("1 / 3");
    const text = screen.getByTestId("shelf-a11y-list").textContent ?? "";
    expect(text).toContain("shelfWindowAfterA11y");
    expect(text).not.toContain("shelfWindowA11y");
  });

  it("flecha derecha mueve el foco al enlace vecino", () => {
    render(<SagaShelf {...props} />);
    const now = screen.getByTestId("shelf-now");
    now.focus();
    fireEvent.keyDown(now, { key: "ArrowRight" });
    const links = [...document.querySelectorAll<HTMLElement>("a[data-shelf-link]")];
    expect(document.activeElement).toBe(links[links.indexOf(now) + 1]);
  });

  it("al abrir un grupo donde «ahora» no es la primera obra, el foco va a «ahora»", () => {
    const g2 = { ...shelf.groups[1], slots: [{ kind: "work" as const, work: w("p", "done") }, { kind: "work" as const, work: w("b", "now") }] };
    render(<SagaShelf {...props} shelf={{ ...shelf, openGroupKey: "s1", groups: [shelf.groups[0], g2] }} />);
    fireEvent.click(screen.getByTestId("shelf-pile-s2"));
    expect(document.activeElement).toBe(screen.getByTestId("shelf-now"));
  });

  it("pulsar el segmento del grupo ya abierto no deja un foco pendiente que se dispare tras un resync", () => {
    const { rerender } = render(<SagaShelf {...props} />);
    fireEvent.click(screen.getByTestId("shelf-segment-s2"));
    rerender(<SagaShelf {...props} shelf={{ ...shelf, openGroupKey: "s1" }} />);
    expect(document.activeElement).toBe(document.body);
  });

  it("un rerender con la misma clave conserva la pila que el usuario abrió", () => {
    const { rerender } = render(<SagaShelf {...props} />);
    fireEvent.click(screen.getByTestId("shelf-pile-s1"));
    rerender(<SagaShelf {...props} shelf={{ ...shelf }} />);
    expect(screen.queryByTestId("shelf-pile-s1")).toBeNull();
    expect(screen.getByTestId("shelf-pile-s2")).toBeTruthy();
  });
  it("vacía conserva la cabecera (título, chips, «Cómo leerla») y avisa en vez de pintar la balda", () => {
    const empty: Shelf = { mode: "empty", openGroupKey: null, nextUp: null, groups: [], segments: [] };
    render(<SagaShelf {...props} shelf={empty} />);
    expect(screen.getByTestId("saga-shelf")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "shelfTitle" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Publicación" }).getAttribute("href")).toBe("/saga/1?ruta=publicacion");
    expect(screen.getByRole("link", { name: "readingLink →" }).getAttribute("href")).toBe("/saga/1/como-leerla?ruta=lectura");
    expect(screen.getByTestId("shelf-empty").textContent).toBe("shelfEmpty");
    expect(screen.queryByTestId("shelf-count")).toBeNull();
    expect(screen.queryByTestId("shelf-a11y-list")).toBeNull();
  });

  it("con más balda a la derecha pinta la flecha derecha, que desplaza la balda", () => {
    const scrollBy = vi.fn();
    const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
    const saved = { cw: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth"), sw: Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollWidth") };
    Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 300 });
    Object.defineProperty(HTMLElement.prototype, "scrollWidth", { configurable: true, get: () => 900 });
    proto.scrollBy = scrollBy;
    try {
      render(<SagaShelf {...props} />);
      expect(screen.queryByTestId("shelf-scroll-left")).toBeNull();
      fireEvent.click(screen.getByTestId("shelf-scroll-right"));
      expect(scrollBy).toHaveBeenCalledWith({ left: 240, behavior: "smooth" });
    } finally {
      if (saved.cw) Object.defineProperty(HTMLElement.prototype, "clientWidth", saved.cw); else delete proto.clientWidth;
      if (saved.sw) Object.defineProperty(HTMLElement.prototype, "scrollWidth", saved.sw); else delete proto.scrollWidth;
      delete proto.scrollBy;
    }
  });

  it("bajo una portada leída pinta tu nota en puntos cuando llega la promesa; sin nota no pinta nada", async () => {
    const rated = Promise.resolve({ a: 7 });
    await act(async () => {
      render(<SagaShelf {...props} shelf={{ ...shelf, openGroupKey: "s1" }} ratings={rated} />);
    });
    const dots = await screen.findByTestId("shelf-rating");
    expect(dots.querySelectorAll(".bg-gold")).toHaveLength(4); // 7/10 = 3,5 → 4 puntos
    expect(dots.textContent).toContain('shelfYourRating:{"rating":"3,5"}');
    cleanup();
    const none = Promise.resolve({});
    await act(async () => {
      render(<SagaShelf {...props} shelf={{ ...shelf, openGroupKey: "s1" }} ratings={none} />);
    });
    expect(screen.queryByTestId("shelf-rating")).toBeNull();
  });
});
