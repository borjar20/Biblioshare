import { cleanup, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { vi } from "vitest";
import messages from "../../../../messages/es.json";
import type { SagaIndexCard } from "@/lib/sagas/build-saga-index";
import { SagasAtlas } from "./sagas-atlas";

// Arnés de los tests del atlas de /sagas (patrón de atlas-test-harness del atlas de la saga).
// Los `vi.mock` de aquí se elevan en ESTE módulo, antes de importar `SagasAtlas`. Viewport
// fijo de 1200×800 con un ResizeObserver de mentira.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/sagas",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (p: { alt: string }) => <img alt={p.alt} />,
}));

export function stubResizeObserver(width = 1200, height = 800) {
  globalThis.ResizeObserver = class {
    constructor(private cb: ResizeObserverCallback) {}
    observe() {
      this.cb([{ contentRect: { width, height } } as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

/** Monta el atlas limpio (sin el render del test anterior) con la URL `?…` dada. */
export function renderSagasAtlas({ cards, authenticated, canCurate = false, search: s = "" }: {
  cards: SagaIndexCard[]; authenticated: boolean; canCurate?: boolean; search?: string;
}) {
  cleanup();
  window.history.replaceState(null, "", s ? `/sagas?${s}` : "/sagas");
  stubResizeObserver();
  return render(
    <NextIntlClientProvider locale="es" messages={messages}>
      <SagasAtlas cards={cards} authenticated={authenticated} canCurate={canCurate} />
    </NextIntlClientProvider>,
  );
}
