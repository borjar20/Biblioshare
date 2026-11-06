// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";
import type { SorteoItem } from "./sorteo-logic";

const mocks = vi.hoisted(() => ({ replace: vi.fn(), query: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
  useSearchParams: () => new URLSearchParams(mocks.query),
}));
vi.mock("./sorteo-stage", () => ({
  SorteoStage: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? <div role="dialog"><button type="button" onClick={onClose}>cerrar</button></div> : null,
}));
import { SpineDraw } from "./spine-draw";

const item: SorteoItem = {
  itemType: "book", itemId: "b1", title: "Libro", subtitle: null, coverUrl: null,
  metaText: "", estimatedMinutes: null, estimateText: null, fresh: false, collectionIds: [],
  plannedSince: "2026-01-01T00:00:00Z", totalEpisodes: null,
};
const ui = (props: Parameters<typeof SpineDraw>[0]) => (
  <NextIntlClientProvider locale="es" messages={messages}><SpineDraw {...props} /></NextIntlClientProvider>
);
function setUrl(query: string) {
  mocks.query = query;
  window.history.replaceState(null, "", `/coleccion/rincon${query ? `?${query}` : ""}`);
}

beforeEach(() => { vi.clearAllMocks(); setUrl("sorteo=1&archivados=1"); });
afterEach(cleanup);

describe("SpineDraw", () => {
  it("empieza cerrado sin openFromUrl, aunque la URL traiga sorteo", () => {
    render(ui({ pool: [item] }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(window.location.search).toBe("?sorteo=1&archivados=1");
  });
  it("abre la hoja con sorteo=1 y openFromUrl", async () => {
    render(ui({ pool: [item], openFromUrl: true }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });
  it("quita sorteo con replaceState y conserva el resto de parámetros", () => {
    const spy = vi.spyOn(window.history, "replaceState");
    render(ui({ pool: [item], openFromUrl: true }));
    expect(spy).toHaveBeenCalledWith(null, "", "/coleccion/rincon?archivados=1");
    expect(window.location.search).toBe("?archivados=1");
    spy.mockRestore();
  });
  it("con el pool vacío no abre, enseña la tarjeta vacía y aun así limpia la URL", () => {
    render(ui({ pool: [], openFromUrl: true }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText(messages.rincon.drawEmptyTitle)).toBeTruthy();
    expect(window.location.search).toBe("?archivados=1");
  });
  it("cerrar la hoja no navega ni toca la URL", async () => {
    render(ui({ pool: [item], openFromUrl: true }));
    const spy = vi.spyOn(window.history, "replaceState");
    fireEvent.click(await screen.findByRole("button", { name: "cerrar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
  it("reabre al llegar sorteo=1 con la ruta ya montada (Activity, segunda visita)", async () => {
    setUrl("");
    const view = render(ui({ pool: [item], openFromUrl: true }));
    expect(screen.queryByRole("dialog")).toBeNull();
    setUrl("sorteo=1");
    view.rerender(ui({ pool: [item], openFromUrl: true }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });
  it("abre con el botón sin tocar la URL", async () => {
    setUrl("archivados=1");
    render(ui({ pool: [item] }));
    fireEvent.click(screen.getByRole("button", { name: messages.rincon.drawButton }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
