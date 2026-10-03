// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { Activity } from "react";
import { IDBDatabase } from "fake-indexeddb";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../messages/es.json";
import { __resetDbForTests } from "@/lib/play/core/db";
import { useClock } from "@/lib/play/clock/use-clock";
import { ClockScreen } from "./clock-screen";

beforeEach(async () => { await __resetDbForTests(); });
afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  await __resetDbForTests();
});

// Sólo se controla la transacción externa: pantalla, hooks y motor reales.
function holdClockWrite() {
  let holding = true;
  let entered!: () => void;
  let finished!: () => void;
  let activeWrite: ReturnType<IDBDatabase["transaction"]> | null = null;
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const completed = new Promise<void>((resolve) => { finished = resolve; });
  const transaction = IDBDatabase.prototype.transaction;
  const interceptor = vi.spyOn(IDBDatabase.prototype, "transaction").mockImplementation(
    function (this: IDBDatabase, names, mode, options) {
      const tx = transaction.call(this, names, mode, options);
      const stores = typeof names === "string" ? [names] : Array.from(names);
      if (mode === "readwrite" && stores.includes("companion")) {
        interceptor.mockRestore();
        activeWrite = tx;
        const store = tx.objectStore("companion");
        const keepPending = () => {
          if (holding) store.get("__clock_screen_1313_hold__").onsuccess = keepPending;
        };
        tx.addEventListener("complete", finished, { once: true });
        tx.addEventListener("abort", finished, { once: true });
        keepPending();
        entered();
      }
      return tx;
    },
  );
  return {
    started, completed,
    release: () => { holding = false; },
    abort: () => { holding = false; activeWrite?.abort(); },
  };
}

function clockView(mode: "visible" | "hidden" = "visible") {
  return (
    <NextIntlClientProvider locale="es" messages={messages}>
      <Activity mode={mode}>
        <ClockScreen identity="anon" />
      </Activity>
    </NextIntlClientProvider>
  );
}

async function renderClock() {
  const view = render(clockView());
  await screen.findByRole("heading", { name: "Reloj" });
  return view;
}

async function configureClock() {
  const view = await renderClock();
  for (const name of ["Ana", "Beto"]) {
    fireEvent.click(screen.getByRole("button", { name: "Añadir jugador" }));
    const input = screen.getByRole("textbox", { name: "Nombre del jugador" });
    fireEvent.change(input, { target: { value: name } });
    fireEvent.keyDown(input, { key: "Enter" });
  }
  fireEvent.change(screen.getByRole("spinbutton", { name: "Tiempo inicial (segundos)" }), {
    target: { value: "90" },
  });
  return view;
}

describe("ClockScreen — confirmación del guardado", () => {
  it("explica la espera y bloquea controles antes de mostrar la partida", async () => {
    await configureClock();
    const start = screen.getByRole("button", { name: "Empezar 90 s" });
    const write = holdClockWrite();
    try {
      fireEvent.click(start);
      await write.started;

      expect(screen.getByRole("status").textContent).toBe("Guardando el reloj…");
      expect(start.matches(":disabled")).toBe(true);
      expect(screen.getByRole("tab", { name: "Cuenta atrás" }).matches(":disabled")).toBe(true);
      expect(screen.queryByTestId("clock-time-1")).toBeNull();
    } finally {
      await act(async () => { write.release(); await write.completed; });
    }
    expect(screen.getByTestId("clock-time-1").textContent).toBe("1:30");
    expect(screen.getByRole("button", { name: "Pausa" }).matches(":disabled")).toBe(false);
  });

  it("no ofrece controles al volver de Activity hasta hidratar la partida vigente", async () => {
    const retained = await configureClock();
    fireEvent.click(screen.getByRole("button", { name: "Empezar 90 s" }));
    await screen.findByTestId("clock-time-1");
    const other = renderHook(() => useClock("anon"));
    await waitFor(() => expect(other.result.current.loaded).toBe(true));
    retained.rerender(clockView("hidden"));
    const write = holdClockWrite();
    try {
      act(() => { expect(other.result.current.emit("clock_paused", {})).toBe(true); });
      await write.started;
      retained.rerender(clockView());
      expect(screen.queryByRole("heading", { name: "Reloj" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Pausa" })).toBeNull();
    } finally {
      await act(async () => { write.release(); await write.completed; });
    }
    const resume = await screen.findByRole("button", { name: "Reanudar" });
    expect(resume.matches(":disabled")).toBe(false);
    fireEvent.click(resume);
    await screen.findByRole("button", { name: "Pausa" });
    expect(screen.getByRole("status").textContent).toBe("El reloj está guardado en este dispositivo.");
  });

  it("muestra el inicio aceptado al salir y volver inmediatamente, sin retener IDB", async () => {
    const retained = await configureClock();
    fireEvent.click(screen.getByRole("button", { name: "Empezar 90 s" }));
    retained.rerender(clockView("hidden"));
    retained.rerender(clockView());
    const bank = await screen.findByTestId("clock-time-1");
    expect(bank.textContent).toBe("1:30");
    expect(screen.getByRole("button", { name: "Pausa" }).matches(":disabled")).toBe(false);
    expect(screen.getByRole("status").textContent).toBe("El reloj está guardado en este dispositivo.");
    expect(screen.queryByRole("button", { name: "Empezar 90 s" })).toBeNull();
  });

  it("avisa del riesgo de recarga cuando falla IDB y permite seguir jugando", async () => {
    await configureClock();
    const write = holdClockWrite();
    fireEvent.click(screen.getByRole("button", { name: "Empezar 90 s" }));
    await write.started;
    await act(async () => { write.abort(); await write.completed; });

    expect(screen.getByTestId("clock-time-1").textContent).toBe("1:30");
    expect(screen.getByRole("status").textContent).toMatch(/No se han guardado los últimos cambios/);
    expect(screen.getByRole("status").textContent).toMatch(/esos cambios se perderán al salir de esta pantalla, recargar o cerrar/);
    expect(screen.getByRole("status").textContent).toMatch(/Puedes seguir jugando aquí/);
    const pause = screen.getByRole("button", { name: "Pausa" });
    expect(pause.matches(":disabled")).toBe(false);
    fireEvent.click(pause);
    await screen.findByRole("button", { name: "Reanudar" });
    expect(screen.getByRole("status").textContent).toBe("El reloj está guardado en este dispositivo.");
  });

  it("confirma también la configuración y el arranque de la cuenta atrás", async () => {
    await renderClock();
    fireEvent.click(screen.getByRole("tab", { name: "Cuenta atrás" }));
    const configuration = holdClockWrite();
    try {
      fireEvent.click(screen.getByRole("button", { name: "30 s" }));
      await configuration.started;
      expect(screen.getByRole("status").textContent).toBe("Guardando el reloj…");
      expect(screen.getByRole("button", { name: "Empezar" }).matches(":disabled")).toBe(true);
    } finally {
      await act(async () => { configuration.release(); await configuration.completed; });
    }
    const start = screen.getByRole("button", { name: "Empezar" });
    expect(start.matches(":disabled")).toBe(false);
    expect(screen.getByTestId("countdown-time").textContent).toBe("0:30");
    const beginning = holdClockWrite();
    try {
      fireEvent.click(start);
      await beginning.started;
      expect(start.matches(":disabled")).toBe(true);
      expect(screen.queryByRole("button", { name: "Pausa" })).toBeNull();
    } finally {
      await act(async () => { beginning.release(); await beginning.completed; });
    }
    expect(screen.getByRole("button", { name: "Pausa" }).matches(":disabled")).toBe(false);
  });
});
