// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ItemStatusProvider } from "./item-status-context";
import { ItemDetailTabs } from "./item-detail-tabs";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/libro/b1",
  useSearchParams: () => new URLSearchParams(),
}));

type IOCallback = (entries: Array<Partial<IntersectionObserverEntry>>) => void;
let fire: IOCallback = () => {};

beforeEach(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: IOCallback) {
        fire = cb;
      }
      observe() {}
      disconnect() {}
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderTabs() {
  return render(
    <ItemStatusProvider initialStatus="in_progress">
      <ItemDetailTabs
        itemType="book"
        tablistLabel="Secciones de la ficha"
        labels={{ info: "Información", community: "Comunidad", log: "Mi registro" }}
        info={<p>info</p>}
        community={<p>comunidad</p>}
        log={<p>registro</p>}
        // eslint-disable-next-line @next/next/no-html-link-for-pages -- doble de prueba, no navegación real
        stickyAction={<a href="/sesion/p1">Registrar sesión</a>}
      />
    </ItemStatusProvider>,
  );
}

describe("ItemDetailTabs · stickyAction", () => {
  it("el CTA no se ve mientras la barra no está pegada", () => {
    renderTabs();
    const slot = screen.getByTestId("tabs-sticky-action");
    expect(slot.className).toContain("hidden");
  });

  it("aparece cuando el centinela sale por arriba (barra pegada)", () => {
    renderTabs();
    act(() => fire([{ isIntersecting: false, boundingClientRect: { top: -10 } as DOMRectReadOnly }]));
    expect(screen.getByTestId("tabs-sticky-action").className).toContain("lg:flex");
  });

  it("el CTA vive FUERA del tablist (un enlace dentro de role=tablist rompe el patrón ARIA)", () => {
    renderTabs();
    const tablist = screen.getByRole("tablist");
    expect(tablist.contains(screen.getByTestId("tabs-sticky-action"))).toBe(false);
  });
});
