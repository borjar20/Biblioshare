// src/components/detail/close-pass-sheet.test.tsx
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/es.json";

const mocks = vi.hoisted(() => ({ close: vi.fn(), ctx: vi.fn(), mutuals: vi.fn(), joint: vi.fn() }));
vi.mock("@/lib/passes/actions", () => ({ closePass: mocks.close }));
vi.mock("@/lib/passes/load-closing-context", () => ({ loadClosingContext: mocks.ctx }));
vi.mock("@/lib/social/joint-viewing-actions", () => ({ loadMutualFollows: mocks.mutuals, createJointViewing: mocks.joint }));
vi.mock("@/components/pet/pet-sprite", () => ({ PetSprite: () => null }));
import { ClosePassSheet } from "./close-pass-sheet";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); this.dispatchEvent(new Event("close")); };
  window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as never;
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.ctx.mockResolvedValue({ recap: { sessions: 23, days: 41, longestStreak: 9, pages: 412, episodes: null }, pet: null });
  mocks.mutuals.mockResolvedValue([]);
  mocks.close.mockResolvedValue({ ok: true });
});
afterEach(cleanup);
const ui = (status: "completed" | "dropped", itemType: "book" | "movie" = "book", onClose = vi.fn()) => (
  <NextIntlClientProvider locale="es" messages={messages}>
    <ClosePassSheet passId="p" itemType={itemType} itemId="i" status={status} open onClose={onClose} />
  </NextIntlClientProvider>
);
const flush = async () => { await act(async () => { await vi.runAllTimersAsync(); }); };

describe("ClosePassSheet (ritual)", () => {
  it("abre con el recuento y la última página del libro", async () => {
    vi.useFakeTimers();
    const { container } = render(ui("completed"));
    await flush();
    expect(screen.getByRole("heading", { name: "¿Qué te ha parecido?" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain("23 sesiones en 41 días");
    expect(container.querySelector('[class*="lastPage"]')).toBeTruthy();
    vi.useRealTimers();
  });
  it("película: entrada de cine", async () => {
    vi.useFakeTimers();
    const { container } = render(ui("completed", "movie"));
    await flush();
    expect(container.querySelector('[class*="ticket"]')).toBeTruthy();
    vi.useRealTimers();
  });
  it("guardar despide (frase y cierre) y solo después avisa al padre", async () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const { container } = render(ui("completed", "book", onClose));
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "8/10" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar", exact: true } as never));
    // Primer flush: resuelve closePass y empieza la despedida (la espera se
    // programa en un efecto, que act ejecuta al final). Tal cual venía en el
    // brief, con un solo flush, el test también pasaba con el cierre inmediato
    // de antes: aquí se comprueba que primero hay frase y cierre, y aviso después.
    await flush();
    expect(onClose).not.toHaveBeenCalled();
    expect(container.querySelector('[class*="_closing_"]')).toBeTruthy();
    expect(screen.getByText(messages.ritual.closing.farewellSr)).toBeTruthy();
    await flush();
    expect(onClose).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
  it("abandonar: sin lacre", async () => {
    vi.useFakeTimers();
    render(ui("dropped"));
    await flush();
    expect(screen.queryByRole("button", { name: "8/10" })).toBeNull();
    vi.useRealTimers();
  });
  it("si falla el contexto, el cierre sigue con frase genérica", async () => {
    vi.useFakeTimers();
    mocks.ctx.mockRejectedValue(new Error("x"));
    render(ui("completed"));
    await flush();
    expect(screen.getByRole("status").textContent).toContain("Otro libro para la balda.");
    vi.useRealTimers();
  });
});

// Más allá del brief: lo que distingue «despide y luego cierra» de «cierra ya»,
// y que el formulario sigue enviando lo mismo que lee closePass.
describe("ClosePassSheet (contrato)", () => {
  const advance = async (ms: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
  const farewellTexts = [messages.ritual.closing.farewell["0"], messages.ritual.closing.farewell["1"]];
  afterEach(() => { vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as never); });

  it("envía a closePass finishedOn de hoy, la nota del lacre, la reseña e isPublic marcado", async () => {
    vi.useFakeTimers();
    render(ui("completed"));
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "8/10" }));
    fireEvent.change(screen.getByLabelText("Reseña"), { target: { value: "Muy bueno" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar", exact: true } as never));
    await flush();
    expect(mocks.close).toHaveBeenCalledTimes(1);
    const [passId, itemType, itemId, , fd] = mocks.close.mock.calls[0] as [string, string, string, unknown, FormData];
    expect([passId, itemType, itemId]).toEqual(["p", "book", "i"]);
    expect(fd.get("finishedOn")).toBe(new Date().toISOString().slice(0, 10));
    expect(fd.getAll("rating")).toEqual(["8"]);
    expect(fd.get("review")).toBe("Muy bueno");
    expect(fd.get("isPublic")).toBe("on");
    vi.useRealTimers();
  });

  it("la despedida va antes del aviso al padre (1,6 s sin movimiento reducido)", async () => {
    vi.useFakeTimers();
    vi.mocked(window.matchMedia).mockReturnValue({ matches: false } as never);
    const onClose = vi.fn();
    render(ui("completed", "book", onClose));
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Guardar", exact: true } as never));
    await advance(0);
    const bubble = screen.getAllByRole("status")[0];
    expect(farewellTexts.some((f) => bubble.textContent?.includes(f))).toBe(true);
    expect(screen.getByText(messages.ritual.closing.farewellSr)).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    await advance(1500);
    expect(onClose).not.toHaveBeenCalled();
    await advance(200);
    expect(onClose).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("con movimiento reducido la espera es de 120 ms como mucho", async () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(ui("completed", "book", onClose));
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Guardar", exact: true } as never));
    await advance(0);
    expect(onClose).not.toHaveBeenCalled();
    await advance(120);
    expect(onClose).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("si closePass devuelve error, la hoja sigue abierta y sin despedida", async () => {
    vi.useFakeTimers();
    mocks.close.mockResolvedValue({ error: "invalidDate" });
    const onClose = vi.fn();
    render(ui("completed", "book", onClose));
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Guardar", exact: true } as never));
    await flush();
    expect(screen.getByText(messages.passes.errors.invalidDate)).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("al reabrir, el sello vuelve a hoy y no queda la despedida anterior", async () => {
    vi.useFakeTimers();
    const sheet = (open: boolean) => (
      <NextIntlClientProvider locale="es" messages={messages}>
        <ClosePassSheet passId="p" itemType="book" itemId="i" status="completed" open={open} onClose={vi.fn()} />
      </NextIntlClientProvider>
    );
    const { container, rerender } = render(sheet(true));
    await flush();
    const reopen = async () => {
      rerender(sheet(false));
      await flush();
      rerender(sheet(true));
      await flush();
    };
    // Tras guardar: sin restos de la despedida.
    fireEvent.click(screen.getByRole("button", { name: "Guardar", exact: true } as never));
    await flush();
    await flush();
    await reopen();
    expect(container.querySelector('[class*="_closing_"]')).toBeNull();
    expect(screen.queryByText(messages.ritual.closing.farewellSr)).toBeNull();
    expect(screen.getByRole("button", { name: "Guardar", exact: true } as never)).toHaveProperty("disabled", false);
    // Tras «Ahora no» (sin envío, así que React no resetea el formulario): el
    // sello no controlado vuelve a hoy porque el objeto se remonta.
    const date = () => container.querySelector<HTMLInputElement>('input[name="finishedOn"]')!;
    fireEvent.change(date(), { target: { value: "2020-01-02" } });
    fireEvent.click(screen.getByRole("button", { name: "Ahora no" }));
    await flush();
    await reopen();
    expect(date().value).toBe(new Date().toISOString().slice(0, 10));
    vi.useRealTimers();
  });

  it("«Ahora no» cierra sin llamar a closePass", async () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    render(ui("completed", "book", onClose));
    await flush();
    fireEvent.click(screen.getByRole("button", { name: "Ahora no" }));
    await flush();
    expect(mocks.close).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  const ana = { userId: "u-ana", username: "ana", displayName: "Ana", avatarUrl: null };

  it("con acompañantes: crea el visionado conjunto y después se despide y cierra", async () => {
    vi.useFakeTimers();
    mocks.mutuals.mockResolvedValue([ana]);
    mocks.joint.mockResolvedValue({ ok: true, viewingId: "v" });
    const onClose = vi.fn();
    render(ui("completed", "book", onClose));
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /Ana/ }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar", exact: true } as never));
    await flush();
    await flush();
    expect(mocks.joint).toHaveBeenCalledWith("p", "book", "i", ["u-ana"]);
    expect(onClose).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("si falla el visionado conjunto, la hoja sigue abierta con el error y sin despedida", async () => {
    vi.useFakeTimers();
    mocks.mutuals.mockResolvedValue([ana]);
    mocks.joint.mockResolvedValue({ ok: false, error: "not_mutual" });
    const onClose = vi.fn();
    render(ui("completed", "book", onClose));
    await flush();
    fireEvent.click(screen.getByRole("button", { name: /Ana/ }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar", exact: true } as never));
    await flush();
    await flush();
    expect(screen.getByText(messages.passes.jointSheet.errors.not_mutual)).toBeTruthy();
    expect(screen.queryByText(messages.ritual.closing.farewellSr)).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
