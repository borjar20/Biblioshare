// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { IDBDatabase } from "fake-indexeddb";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../../../messages/es.json";
import { __resetDbForTests, readCompanion, writeCompanion } from "@/lib/play/core/db";
import { makeEvent } from "@/lib/play/core/events";
import { ResourcesScreen } from "./resources-screen";

const pending = "Guardando los recursos…";
const memory = "No se han guardado los últimos cambios de los recursos. Puedes seguir aquí, pero esos cambios se perderán al salir de esta pantalla, recargar o cerrar.";

beforeEach(async () => { await __resetDbForTests(); });
afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  await __resetDbForTests();
});

async function seedFive() {
  expect(await writeCompanion({
    identity: "anon:resources", v: 1, base: null, rev: 2,
    log: [
      makeEvent("players_set", { players: ["Ana"] }, 1, "players"),
      makeEvent("resource_added", { name: "Oro", emoji: "gold", initial: 5, shared: false }, 2, "gold"),
    ],
  })).toEqual({ ok: true });
}

function renderScreen(identity = "anon") {
  return render(<NextIntlClientProvider locale="es" messages={messages}>
    <ResourcesScreen identity={identity} />
  </NextIntlClientProvider>);
}

// Control exclusivo de una transacción IDB real, con el core y la UI reales.
function holdNextWrite() {
  let holding = true;
  let entered!: () => void;
  let finished!: () => void;
  let active: ReturnType<IDBDatabase["transaction"]> | null = null;
  const started = new Promise<void>(resolve => { entered = resolve; });
  const completed = new Promise<void>(resolve => { finished = resolve; });
  const native = IDBDatabase.prototype.transaction;
  const interceptor = vi.spyOn(IDBDatabase.prototype, "transaction").mockImplementation(
    function (this: IDBDatabase, names, mode, options) {
      const tx = native.call(this, names, mode, options);
      const stores = typeof names === "string" ? [names] : Array.from(names);
      if (mode === "readwrite" && stores.includes("companion")) {
        interceptor.mockRestore();
        active = tx;
        const store = tx.objectStore("companion");
        const keepPending = () => {
          if (holding) store.get("__resources_1328_hold__").onsuccess = keepPending;
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
    release: () => { holding = false; if (!active) { interceptor.mockRestore(); finished(); } },
    abort: () => { holding = false; active?.abort(); },
  };
}

describe("ResourcesScreen — persistencia visible #1328", () => {
  it("el click de inicio 5→6 conserva 5 mientras guarda y restaura 6 al remontar inmediatamente", async () => {
    await seedFive();
    const current = renderScreen();
    expect((await screen.findByTestId("res-0-Oro")).textContent).toBe("5");
    fireEvent.click(screen.getByRole("button", { name: "Configurar" }));
    fireEvent.click(screen.getByRole("button", { name: "Editar Oro" }));
    const more = screen.getByRole("button", { name: "Uno más de inicio" });
    const write = holdNextWrite();
    try {
      fireEvent.click(more);
      await write.started;
      expect(screen.getByTestId("res-0-Oro").textContent).toBe("5");
      expect(screen.getByRole("status").textContent).toBe(pending);
      expect(more.matches(":disabled")).toBe(true);
      expect(screen.getByRole("button", { name: "Sumar Oro" }).matches(":disabled")).toBe(false);
    } finally {
      await act(async () => { write.release(); await write.completed; });
    }
    await waitFor(() => expect(screen.getByTestId("res-0-Oro").textContent).toBe("6"));
    current.unmount();
    renderScreen();
    expect((await screen.findByTestId("res-0-Oro")).textContent).toBe("6");
    expect((await readCompanion("anon:resources"))?.log.at(-1)).toMatchObject({
      type: "resource_updated", payload: { name: "Oro", initial: 6, shared: false },
    });
  });

  it("mantiene deltas rápidos y deshacer utilizables durante pending sin perder pasos", async () => {
    await seedFive();
    renderScreen();
    await screen.findByTestId("res-0-Oro");
    fireEvent.click(screen.getByRole("button", { name: "Configurar" }));
    fireEvent.click(screen.getByRole("button", { name: "Editar Oro" }));
    fireEvent.click(screen.getByRole("button", { name: "Cantidades rápidas de Oro" }));
    const more = screen.getByRole("button", { name: "Sumar Oro" });
    const undo = screen.getByRole("button", { name: "Deshacer" });
    const write = holdNextWrite();
    try {
      fireEvent.click(more);
      await write.started;
      expect(more.matches(":disabled")).toBe(false);
      expect(undo.matches(":disabled")).toBe(false);
      expect(screen.getByRole("button", { name: "Uno más de inicio" }).matches(":disabled")).toBe(true);
      fireEvent.click(more);
      fireEvent.click(screen.getByRole("button", { name: "+5" }));
      fireEvent.click(undo);
      expect(screen.getByTestId("res-0-Oro").textContent).toBe("5");
      expect(screen.getByRole("status").textContent).toBe(pending);
    } finally {
      await act(async () => { write.release(); await write.completed; });
    }
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Los recursos están guardados en este dispositivo."));
    expect(screen.getByTestId("res-0-Oro").textContent).toBe("7");
    const record = await readCompanion("anon:resources");
    expect(record?.rev).toBe(6);
    expect(record?.log.slice(2).map(event => event.payload)).toEqual([
      { resource: "Oro", owner: "Ana", delta: 1 },
      { resource: "Oro", owner: "Ana", delta: 1 },
    ]);
  });

  it("mantener pulsado acumula un solo evento y la vista previa termina antes del ACK", async () => {
    await seedFive();
    renderScreen();
    await screen.findByTestId("res-0-Oro");
    const more = screen.getByRole("button", { name: "Sumar Oro" });
    const write = holdNextWrite();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    try {
      fireEvent.pointerDown(more);
      act(() => vi.advanceTimersByTime(640));
      expect(screen.getByTestId("res-0-Oro").textContent).toBe("8");
      fireEvent.pointerUp(more);
      fireEvent.click(more); // El click posterior a soltar no duplica el gesto.
      vi.useRealTimers();
      await write.started;
      expect(screen.getByTestId("res-0-Oro").textContent).toBe("5");
      expect(screen.getByRole("status").textContent).toBe(pending);
    } finally {
      vi.useRealTimers();
      await act(async () => { write.release(); await write.completed; });
    }
    await waitFor(() => expect(screen.getByTestId("res-0-Oro").textContent).toBe("8"));
    const record = await readCompanion("anon:resources");
    expect(record?.rev).toBe(3);
    expect(record?.log.slice(2)).toMatchObject([
      { type: "adjusted", payload: { resource: "Oro", owner: "Ana", delta: 3 } },
    ]);
  });

  it("avisa de cambios en memoria, mantiene controles y remontar pierde sólo el cambio no guardado", async () => {
    await seedFive();
    const current = renderScreen();
    await screen.findByTestId("res-0-Oro");
    fireEvent.click(screen.getByRole("button", { name: "Configurar" }));
    fireEvent.click(screen.getByRole("button", { name: "Editar Oro" }));
    const write = holdNextWrite();
    fireEvent.click(screen.getByRole("button", { name: "Uno más de inicio" }));
    await write.started;
    await act(async () => { write.abort(); await write.completed; });
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe(memory));
    expect(screen.getByTestId("res-0-Oro").textContent).toBe("6");
    for (const name of ["Uno más de inicio", "Sumar Oro", "Deshacer"]) {
      expect(screen.getByRole("button", { name }).matches(":disabled")).toBe(false);
    }
    expect((await readCompanion("anon:resources"))?.rev).toBe(2);
    current.unmount();
    renderScreen();
    expect((await screen.findByTestId("res-0-Oro")).textContent).toBe("5");
    expect(screen.getByRole("status").textContent).toBe("Los recursos están guardados en este dispositivo.");
  });
});
