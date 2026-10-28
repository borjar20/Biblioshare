import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/es.json";
import type { AtlasModel, AtlasWork } from "@/lib/sagas/atlas/model";
import { SagaAtlas, type SagaAtlasProps } from "./saga-atlas";

// Arnés de los tests de la mini-ficha y la lista. Los `vi.mock` van en cada test (vitest los
// eleva por fichero). Viewport fijo con el ResizeObserver de `stubResizeObserver`.

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

export const work = (key: string, i: number, state: AtlasWork["state"], extra: Partial<AtlasWork> = {}): AtlasWork => ({
  key, title: key.toUpperCase(), href: `/libro/${key}`, coverUrl: null, state, role: null, optional: false, skipped: false,
  ownerSagaId: "s1", regionKey: "r1", readingNo: i + 1, readingIndex: i, year: 2000 + i, extra: false, window: null,
  tandem: null, step: null, stepNote: null, ...extra,
});

export const model: AtlasModel = {
  works: [work("a", 0, "done"), work("b", 1, "now", { role: "relato" }), work("c", 2, "todo")],
  regions: [{ key: "r1", name: null, accent: "verde", state: "current", counted: 3, completed: 1 }],
  nowKey: "b", mode: "next", nextTitle: "B", hasItinerary: false,
};

export const props: SagaAtlasProps = {
  sagaId: "s1", sagaName: "Dune", workCount: 3, model, authenticated: true,
  routes: [{ slug: "lectura", name: "Orden de lectura", summary: null, curated: false }], activeRoute: "lectura",
  adoptedRoute: null, counter: null, canEdit: false,
};

export const view = (p: Partial<SagaAtlasProps> = {}) =>
  render(<NextIntlClientProvider locale="es" messages={messages}><SagaAtlas {...props} {...p} /></NextIntlClientProvider>);

export const plane = () => document.querySelector<HTMLElement>("[data-level]")!;
