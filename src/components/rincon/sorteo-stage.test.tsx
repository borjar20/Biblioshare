// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";
import type { SorteoItem } from "./sorteo-logic";

const mocks = vi.hoisted(() => ({ load: vi.fn(), update: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/rincon/load-sorteo", () => ({ loadSorteo: mocks.load }));
vi.mock("@/lib/library/manage-actions", () => ({ updateStatus: mocks.update }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/components/pet/pet-sprite", () => ({ PetSprite: () => null }));
import { SorteoStage } from "./sorteo-stage";

const mk = (id: string): SorteoItem => ({
  itemType: "movie", itemId: id, title: `Peli ${id}`, subtitle: null, coverUrl: null, metaText: "",
  estimatedMinutes: 100, estimateText: null, fresh: true, collectionIds: [],
  plannedSince: "2026-10-01T00:00:00Z", totalEpisodes: null,
});

beforeAll(() => {
  // jsdom no implementa <dialog>.showModal/close ni matchMedia.
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
  window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as never; // reduced motion: retardos cortos
});
beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); localStorage.clear(); });
afterEach(() => { vi.useRealTimers(); cleanup(); });

const ui = (onClose = vi.fn()) => (
  <NextIntlClientProvider locale="es" messages={messages}><SorteoStage open onClose={onClose} /></NextIntlClientProvider>
);
// Cada fase programa su temporizador en un efecto, y React solo confirma los
// efectos al salir de act(): un único runAllTimersAsync se queda a mitad de la
// partida. Se repite hasta que no quede ningún temporizador pendiente.
const flush = async () => {
  for (let i = 0; i < 50; i++) {
    await act(async () => { await vi.runAllTimersAsync(); });
    if (vi.getTimerCount() === 0) return;
  }
};

describe("SorteoStage", () => {
  it("dos candidatos: tirar → duelo → me quedo → CTA → cierra y refresca", async () => {
    mocks.load.mockResolvedValue({ items: [mk("a"), mk("b")], collections: [], pet: null });
    mocks.update.mockResolvedValue({ kind: "done", passId: "p", closed: false, created: false });
    const onClose = vi.fn();
    render(ui(onClose));
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "¡Tirar!" }));
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Peli a" }));
    fireEvent.click(screen.getByRole("button", { name: "Me quedo con «Peli a»" }));
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Ver esta noche" }));
    await flush();
    expect(mocks.update).toHaveBeenCalledWith("movie", "a", "in_progress");
    expect(onClose).toHaveBeenCalled();
    expect(mocks.refresh).toHaveBeenCalled();
    expect(document.documentElement.dataset.sorteoOpen).toBeUndefined();
  });

  it("si falla la carga ofrece reintentar", async () => {
    mocks.load.mockRejectedValueOnce(new Error("x")).mockResolvedValue({ items: [mk("a")], collections: [], pet: null });
    render(ui());
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await flush();
    expect(screen.getByRole("button", { name: "¡Tirar!" })).toBeTruthy();
  });

  it("si falla el CTA enseña el error y no cierra", async () => {
    mocks.load.mockResolvedValue({ items: [mk("a")], collections: [], pet: null });
    mocks.update.mockRejectedValue(new Error("x"));
    const onClose = vi.fn();
    render(ui(onClose));
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "¡Tirar!" }));
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Ver esta noche" }));
    await flush();
    expect(screen.getByText(messages.sorteo.ctaError)).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("cerrar a media partida cancela los temporizadores y vuelve al principio", async () => {
    mocks.load.mockResolvedValue({ items: [mk("a"), mk("b"), mk("c")], collections: [], pet: null });
    const onClose = vi.fn();
    render(ui(onClose));
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "¡Tirar!" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(200); }); // ya presentando
    expect(screen.getByText(messages.sorteo.presenting)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: messages.sorteo.close }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(screen.queryByText(messages.sorteo.presenting)).toBeNull();
    expect(document.documentElement.dataset.sorteoOpen).toBeUndefined();
  });

  it("pool vacío: mensaje y enlace a Buscar", async () => {
    mocks.load.mockResolvedValue({ items: [], collections: [], pet: null });
    render(ui());
    await flush();
    expect(screen.getByRole("link", { name: messages.sorteo.emptyCta })).toHaveProperty("pathname", "/buscar");
  });
});
