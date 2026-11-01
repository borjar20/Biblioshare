// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";
import type { SorteoItem } from "./sorteo-logic";

const mocks = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: mocks.replace }) }));
// La hoja real usa <dialog>.showModal y server actions; aquí basta con saber si está abierta.
vi.mock("./sorteo-sheet", () => ({
  SorteoSheet: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? <div role="dialog"><button type="button" onClick={onClose}>cerrar</button></div> : null,
}));
import { SpineDraw } from "./spine-draw";

const item: SorteoItem = {
  itemType: "book", itemId: "b1", title: "Libro", subtitle: null, coverUrl: null,
  metaText: "", estimatedMinutes: null, estimateText: null, fresh: false, collectionIds: [],
};
const ui = (props: Parameters<typeof SpineDraw>[0]) => (
  <NextIntlClientProvider locale="es" messages={messages}><SpineDraw {...props} /></NextIntlClientProvider>
);

beforeEach(() => { vi.clearAllMocks(); window.history.replaceState(null, "", "/coleccion/rincon?sorteo=1&archivados=1"); });
afterEach(cleanup);

describe("SpineDraw", () => {
  it("empieza cerrado sin initialOpen", () => {
    render(ui({ pool: [item] }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("abre la hoja al montar con initialOpen", () => {
    render(ui({ pool: [item], initialOpen: true }));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
  it("con el pool vacío ignora initialOpen y enseña la tarjeta vacía", () => {
    render(ui({ pool: [], initialOpen: true }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText(messages.rincon.drawEmptyTitle)).toBeTruthy();
  });
  it("al cerrar la hoja abierta por URL quita sorteo y conserva el resto", () => {
    render(ui({ pool: [item], initialOpen: true }));
    fireEvent.click(screen.getByRole("button", { name: "cerrar" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.replace).toHaveBeenCalledWith("/coleccion/rincon?archivados=1", { scroll: false });
  });
  it("al cerrar una hoja abierta con el botón no toca la URL", () => {
    render(ui({ pool: [item] }));
    fireEvent.click(screen.getByRole("button", { name: messages.rincon.drawButton }));
    fireEvent.click(screen.getByRole("button", { name: "cerrar" }));
    expect(mocks.replace).not.toHaveBeenCalled();
  });
});
