// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/es.json";
import type { IndexAtlasSaga } from "@/lib/sagas/index-atlas/model";
import { IndexSheet } from "./index-sheet";

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (p: { alt: string }) => <img alt={p.alt} />,
}));

afterEach(cleanup);

const saga = (extra: Partial<IndexAtlasSaga> = {}): IndexAtlasSaga => ({
  id: "s1", name: "Saga uno", href: "/saga/s1", coverUrl: null, accent: "terracota", zone: "por-descubrir", comarca: "libros",
  titleCount: 3, typeBreakdown: { book: 3, movie: 0, series: 0 }, creator: null, routeCount: 0, ownedCount: 0,
  isFollowed: false, progress: null, children: [], ...extra,
});

function show(s: IndexAtlasSaga, over: Partial<Parameters<typeof IndexSheet>[0]> = {}) {
  const props = {
    saga: s, authenticated: true, anchor: { x: 300, y: 300, halfW: 32, halfH: 48 }, viewport: { width: 1200, height: 800 },
    insets: { top: 80, bottom: 80 }, pending: false, error: false,
    onFollow: vi.fn(), onChild: vi.fn(), onClose: vi.fn(), ...over,
  };
  render(
    <NextIntlClientProvider locale="es" messages={messages}>
      <IndexSheet {...props} />
    </NextIntlClientProvider>,
  );
  return props;
}

describe("IndexSheet", () => {
  it("es un diálogo con el nombre como etiqueta, tipo, autoría y avance", () => {
    show(saga({ creator: "Autora", progress: { completed: 1, total: 3 } }));
    const dialog = screen.getByRole("dialog", { name: "Saga uno" });
    expect(dialog.textContent).toContain("3 libros");
    expect(dialog.textContent).toContain("Autora");
    expect(dialog.textContent).toContain("Llevas 1 de 3");
  });
  it("con sesión, «Seguir» llama a onFollow(true)", () => {
    const p = show(saga());
    const btn = screen.getByRole("button", { name: "Seguir" });
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(btn);
    expect(p.onFollow).toHaveBeenCalledWith(true);
  });
  it("si ya se sigue, dice «Sigues», aria-pressed y llama a onFollow(false)", () => {
    const p = show(saga({ isFollowed: true }));
    const btn = screen.getByRole("button", { name: "Sigues" });
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(btn);
    expect(p.onFollow).toHaveBeenCalledWith(false);
  });
  it("mientras dura la acción el botón está desactivado", () => {
    show(saga(), { pending: true });
    expect((screen.getByRole("button", { name: "Seguir" }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("sin sesión no hay botón de seguir y sí un enlace a entrar", () => {
    show(saga(), { authenticated: false });
    expect(screen.queryByRole("button", { name: "Seguir" })).toBeNull();
    expect(screen.getByRole("link", { name: "Entra para seguirla" }).getAttribute("href")).toBe("/login?next=%2Fsagas");
  });
  it("enlaza a la ficha y al atlas de la saga", () => {
    show(saga());
    expect(screen.getByRole("link", { name: "Abrir ficha" }).getAttribute("href")).toBe("/saga/s1");
    expect(screen.getByRole("link", { name: "Ver atlas" }).getAttribute("href")).toBe("/saga/s1/mapa");
  });
  it("con error muestra el aviso", () => {
    show(saga(), { error: true });
    expect(screen.getByRole("alert").textContent).toContain("No se pudo seguir");
  });
  it("un universo lista sus subsagas y «Ver K0 en el mapa» llama a onChild", () => {
    const p = show(saga({ children: [{ id: "k0", name: "K0", href: "/saga/k0", accent: "beige", titleCount: 2 }] }));
    expect(screen.getByRole("dialog").textContent).toContain("Universo · 2 sagas");
    expect(screen.getByRole("link", { name: /^K0/ }).getAttribute("href")).toBe("/saga/k0");
    fireEvent.click(screen.getByRole("button", { name: "Ver K0 en el mapa" }));
    expect(p.onChild).toHaveBeenCalledWith("k0");
  });
  it("Escape cierra devolviendo el foco", () => {
    const p = show(saga());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(p.onClose).toHaveBeenCalledWith(true);
  });
});
