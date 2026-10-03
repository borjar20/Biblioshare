// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { Activity, type ReactNode } from "react";
import { IDBDatabase, IDBObjectStore } from "fake-indexeddb";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useClock } from "@/lib/play/clock/use-clock";
import { useCompanion } from "@/lib/play/random/use-companion";
import { useResources } from "@/lib/play/resources/use-resources";
import { useTurns } from "@/lib/play/turns/use-turns";
import { __resetDbForTests, readCompanion } from "./db";

beforeEach(async () => {
  await __resetDbForTests();
});

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  await __resetDbForTests();
});

/** Retiene la primera escritura con solicitudes IDB pendientes. El motor,
 *  el adaptador db.ts y sus callbacks siguen siendo los reales. */
function holdNextCompanionWrite() {
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
          if (!holding) return;
          store.get("__clock_1313_hold__").onsuccess = keepPending;
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

describe("Reloj — inicio confirmado", () => {
  it("no publica una partida iniciada mientras su escritura sigue pendiente", async () => {
    const { result, unmount } = renderHook(() => useClock("anon"));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    const write = holdNextCompanionWrite();
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);

    try {
      act(() => {
        expect(result.current.emit("chess_configured", {
          players: ["Ana", "Beto"], initialMs: 90_000, incrementMs: 0,
        })).toBe(true);
      });
      await write.started;

      expect(result.current.state.mode).toBeNull();
      expect(result.current.persistence).toBe("pending");
      now.mockReturnValue(2_000);
    } finally {
      write.release();
      await act(async () => { await write.completed; });
    }
    expect(result.current.persistence).toBe("saved");
    expect(result.current.state).toMatchObject({ mode: "chess", lastEventAt: 1_000 });
    unmount();
    const restored = renderHook(() => useClock("anon"));
    await waitFor(() => expect(restored.result.current.loaded).toBe(true));
    expect(restored.result.current.state).toMatchObject({
      mode: "chess", initialMs: 90_000, lastEventAt: 1_000,
      players: [{ name: "Ana", bankMs: 90_000 }, { name: "Beto", bankMs: 90_000 }],
    });
  });

  it("permite jugar en memoria y expone que el guardado falló", async () => {
    const { result } = renderHook(() => useClock("anon"));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    const write = holdNextCompanionWrite();
    act(() => {
      result.current.emit("chess_configured", {
        players: ["Ana", "Beto"], initialMs: 90_000, incrementMs: 0,
      });
    });
    await write.started;
    await act(async () => { write.abort(); await write.completed; });

    expect(result.current.persistence).toBe("memory");
    expect(result.current.state.mode).toBe("chess");
    act(() => { expect(result.current.emit("clock_paused", {})).toBe(true); });
    await waitFor(() => expect(result.current.persistence).toBe("saved"));
    expect(result.current.state.paused).toBe(true);
  });

  it("recupera el último estado durable si los cambios en memoria se pierden al salir", async () => {
    const { result, unmount } = renderHook(() => useClock("anon"));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    act(() => { result.current.emit("chess_configured", {
      players: ["Ana", "Beto"], initialMs: 90_000, incrementMs: 0,
    }); });
    await waitFor(() => expect(result.current.persistence).toBe("saved"));
    const write = holdNextCompanionWrite();
    act(() => { result.current.emit("clock_paused", {}); });
    await write.started;
    await act(async () => { write.abort(); await write.completed; });
    expect(result.current.persistence).toBe("memory");
    expect(result.current.state.paused).toBe(true);
    unmount();

    const restored = renderHook(() => useClock("anon"));
    await waitFor(() => expect(restored.result.current.loaded).toBe(true));
    expect(restored.result.current.state).toMatchObject({
      mode: "chess", paused: false, initialMs: 90_000,
      players: [{ name: "Ana" }, { name: "Beto" }],
    });
  });

  it("no aplica el ACK ni un callback de la identidad anterior a la identidad nueva", async () => {
    const { result, rerender } = renderHook(({ identity }) => useClock(identity), {
      initialProps: { identity: "anon" },
    });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    const oldEmit = result.current.emit;
    const write = holdNextCompanionWrite();
    try {
      act(() => { oldEmit("chess_configured", {
        players: ["Ana", "Beto"], initialMs: 90_000, incrementMs: 0,
      }); });
      await write.started;
      rerender({ identity: "new-user" });
      expect(result.current.loaded).toBe(false);
    } finally {
      await act(async () => { write.release(); await write.completed; });
    }
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.state.mode).toBeNull();
    expect(result.current.persistence).toBe("idle");
    act(() => { expect(oldEmit("chess_configured", {
      players: ["Ana", "Beto"], initialMs: 90_000, incrementMs: 0,
    })).toBe(false); });
  });

  it("termina un inicio aceptado al desmontar y rechaza acciones posteriores", async () => {
    const { result, unmount } = renderHook(() => useClock("anon"));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    const emit = result.current.emit;
    const write = holdNextCompanionWrite();
    try {
      act(() => { emit("chess_configured", {
        players: ["Ana", "Beto"], initialMs: 90_000, incrementMs: 0,
      }); });
      await write.started;
      unmount();
      expect(emit("clock_paused", {})).toBe(false);
    } finally {
      await act(async () => { write.release(); await write.completed; });
    }
    const restored = renderHook(() => useClock("anon"));
    await waitFor(() => expect(restored.result.current.loaded).toBe(true));
    expect(restored.result.current.state).toMatchObject({ mode: "chess", paused: false });
  });

  it("termina todos los commits aceptados al desmontar si no hay conflicto", async () => {
    const clock = renderHook(() => useClock("anon"));
    await waitFor(() => expect(clock.result.current.loaded).toBe(true));
    const write = holdNextCompanionWrite();
    try {
      act(() => {
        expect(clock.result.current.emit("chess_configured", {
          players: ["Ana", "Beto"], initialMs: 90_000, incrementMs: 0,
        })).toBe(true);
        expect(clock.result.current.emit("clock_paused", {})).toBe(true);
      });
      clock.unmount();
      await write.started;
    } finally {
      await act(async () => { write.release(); await write.completed; });
    }
    const record = await readCompanion("anon:clock");
    expect(record?.rev).toBe(2);
    expect(record?.log.map((event) => event.type)).toEqual(["chess_configured", "clock_paused"]);
    const restored = renderHook(() => useClock("anon"));
    await waitFor(() => expect(restored.result.current.loaded).toBe(true));
    expect(restored.result.current.state).toMatchObject({ mode: "chess", paused: true });
  });

  it.each(["remontar", "abrir otra instancia"] as const)(
    "hidrata un único commit aceptado al %s inmediatamente, sin retener IDB",
    async (returnMode) => {
      const old = renderHook(() => useClock("anon"));
      await waitFor(() => expect(old.result.current.loaded).toBe(true));
      let restored!: typeof old;
      act(() => {
        expect(old.result.current.emit("chess_configured", {
          players: ["Ana", "Beto"], initialMs: 90_000, incrementMs: 0,
        })).toBe(true);
        if (returnMode === "remontar") old.unmount();
        restored = renderHook(() => useClock("anon"));
      });
      await waitFor(async () => expect((await readCompanion("anon:clock"))?.rev).toBe(1));
      await waitFor(() => expect(restored.result.current.loaded).toBe(true));
      expect(restored.result.current.persistence).toBe("saved");
      expect(restored.result.current.state).toMatchObject({
        mode: "chess", paused: false, initialMs: 90_000,
        players: [{ name: "Ana" }, { name: "Beto" }],
      });
    },
  );

  it("hidrata un único commit aceptado al volver inmediatamente de Activity, sin retener IDB", async () => {
    let mode: "visible" | "hidden" = "visible";
    function Wrapper({ children }: { children: ReactNode }) {
      return <Activity mode={mode}>{children}</Activity>;
    }
    const retained = renderHook(() => useClock("anon"), { wrapper: Wrapper });
    await waitFor(() => expect(retained.result.current.loaded).toBe(true));
    act(() => { expect(retained.result.current.emit("chess_configured", {
      players: ["Ana", "Beto"], initialMs: 90_000, incrementMs: 0,
    })).toBe(true); });
    mode = "hidden";
    retained.rerender();
    mode = "visible";
    retained.rerender();
    await waitFor(async () => expect((await readCompanion("anon:clock"))?.rev).toBe(1));
    await waitFor(() => expect(retained.result.current.loaded).toBe(true));
    expect(retained.result.current.persistence).toBe("saved");
    expect(retained.result.current.state).toMatchObject({ mode: "chess", paused: false });
  });

  it("hidrata la cola aceptada completa al volver de Activity antes de que termine", async () => {
    let mode: "visible" | "hidden" = "visible";
    function Wrapper({ children }: { children: ReactNode }) {
      return <Activity mode={mode}>{children}</Activity>;
    }
    const retained = renderHook(() => useClock("anon"), { wrapper: Wrapper });
    await waitFor(() => expect(retained.result.current.loaded).toBe(true));
    const write = holdNextCompanionWrite();
    try {
      act(() => {
        expect(retained.result.current.emit("chess_configured", {
          players: ["Ana", "Beto"], initialMs: 90_000, incrementMs: 0,
        })).toBe(true);
        expect(retained.result.current.emit("clock_paused", {})).toBe(true);
      });
      await write.started;
      mode = "hidden";
      retained.rerender();
      mode = "visible";
      retained.rerender();
      expect(retained.result.current.loaded).toBe(false);
    } finally {
      await act(async () => { write.release(); await write.completed; });
    }
    await waitFor(async () => expect((await readCompanion("anon:clock"))?.rev).toBe(2));
    await waitFor(() => expect(retained.result.current.loaded).toBe(true));
    expect(retained.result.current.persistence).toBe("saved");
    expect(retained.result.current.state).toMatchObject({ mode: "chess", paused: true });
  });

  it("no demora la solicitud de lectura de otra identidad por la cola de anon", async () => {
    const clock = renderHook(() => useClock("anon"));
    await waitFor(() => expect(clock.result.current.loaded).toBe(true));
    const write = holdNextCompanionWrite();
    let other!: typeof clock;
    try {
      act(() => { expect(clock.result.current.emit("chess_configured", {
        players: ["Ana", "Beto"], initialMs: 90_000, incrementMs: 0,
      })).toBe(true); });
      await write.started;
      // Observa el límite externo. IDB serializa el almacén por sí mismo;
      // el store debe poder solicitar esta lectura sin esperar a otra clave.
      const reads = vi.spyOn(IDBObjectStore.prototype, "get");
      other = renderHook(() => useClock("new-user"));
      await waitFor(() => expect(reads).toHaveBeenCalledWith("new-user:clock"));
    } finally {
      await act(async () => { write.release(); await write.completed; });
    }
    await waitFor(() => expect(other.result.current.loaded).toBe(true));
    expect(other.result.current.state.mode).toBeNull();
    expect(other.result.current.persistence).toBe("idle");
  });

  it("marca Activity como no cargada hasta completar su nueva hidratación", async () => {
    let mode: "visible" | "hidden" = "visible";
    function Wrapper({ children }: { children: ReactNode }) {
      return <Activity mode={mode}>{children}</Activity>;
    }
    const retained = renderHook(() => useClock("anon"), { wrapper: Wrapper });
    await waitFor(() => expect(retained.result.current.loaded).toBe(true));
    act(() => { retained.result.current.emit("chess_configured", {
      players: ["Ana", "Beto"], initialMs: 90_000, incrementMs: 0,
    }); });
    await waitFor(() => expect(retained.result.current.persistence).toBe("saved"));
    const oldEmit = retained.result.current.emit;
    const other = renderHook(() => useClock("anon"));
    await waitFor(() => expect(other.result.current.loaded).toBe(true));

    mode = "hidden";
    retained.rerender();
    const write = holdNextCompanionWrite();
    try {
      act(() => { expect(other.result.current.emit("clock_paused", {})).toBe(true); });
      await write.started;
      mode = "visible";
      retained.rerender();
      expect(retained.result.current.loaded).toBe(false);
      expect(retained.result.current.persistence).toBe("idle");
      act(() => { expect(retained.result.current.emit("clock_paused", {})).toBe(false); });
    } finally {
      await act(async () => { write.release(); await write.completed; });
    }
    await waitFor(() => expect(retained.result.current.loaded).toBe(true));
    expect(retained.result.current.state.paused).toBe(true);
    expect(retained.result.current.persistence).toBe("saved");
    act(() => {
      expect(oldEmit("clock_resumed", {})).toBe(false);
      expect(retained.result.current.emit("clock_resumed", {})).toBe(true);
    });
    await waitFor(() => expect(retained.result.current.persistence).toBe("saved"));
    expect(retained.result.current.state.paused).toBe(false);
  });

  it("vuelve a hidratar al regresar a una identidad y no revive sus callbacks anteriores", async () => {
    const { result, rerender } = renderHook(({ identity }) => useClock(identity), {
      initialProps: { identity: "anon" },
    });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    const oldEmit = result.current.emit;
    const write = holdNextCompanionWrite();
    try {
      act(() => { oldEmit("chess_configured", {
        players: ["Ana", "Beto"], initialMs: 90_000, incrementMs: 0,
      }); });
      await write.started;
      rerender({ identity: "new-user" });
      rerender({ identity: "anon" });
      expect(result.current.loaded).toBe(false);
    } finally {
      await act(async () => { write.release(); await write.completed; });
    }
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.state.mode).toBe("chess");
    act(() => { expect(oldEmit("clock_paused", {})).toBe(false); });
    act(() => { expect(result.current.emit("clock_paused", {})).toBe(true); });
    await waitFor(() => expect(result.current.persistence).toBe("saved"));
    expect(result.current.state.paused).toBe(true);
  });

  it("compone emits del mismo tick y no rebobina el head al publicar un ACK intermedio", async () => {
    const { result, unmount } = renderHook(() => useClock("anon"));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
    const first = holdNextCompanionWrite();
    let second: ReturnType<typeof holdNextCompanionWrite> | null = null;
    try {
      act(() => {
        expect(result.current.emit("chess_configured", {
          players: ["Ana", "Beto"], initialMs: 90_000, incrementMs: 0,
        })).toBe(true);
        expect(result.current.emit("clock_paused", {})).toBe(true);
      });
      await first.started;
      second = holdNextCompanionWrite();
      await act(async () => { first.release(); await first.completed; });
      await second.started;
      expect(result.current.state.paused).toBe(false);
      expect(result.current.persistence).toBe("pending");

      now.mockReturnValue(500);
      act(() => { expect(result.current.emit("clock_resumed", {})).toBe(true); });
    } finally {
      first.release();
      second?.release();
      await act(async () => {
        await first.completed;
        if (second) await second.completed;
      });
    }
    await waitFor(() => expect(result.current.persistence).toBe("saved"));
    expect(result.current.state).toMatchObject({ mode: "chess", paused: false, lastEventAt: 1_000 });
    unmount();
    const restored = renderHook(() => useClock("anon"));
    await waitFor(() => expect(restored.result.current.loaded).toBe(true));
    expect(restored.result.current.state).toMatchObject({
      mode: "chess", paused: false, initialMs: 90_000, lastEventAt: 1_000,
    });
  });

  it("conserva configure y undo del mismo tick a través de la cola de escrituras", async () => {
    const clock = renderHook(() => useClock("anon"));
    await waitFor(() => expect(clock.result.current.loaded).toBe(true));
    const write = holdNextCompanionWrite();
    try {
      act(() => {
        expect(clock.result.current.emit("chess_configured", {
          players: ["Ana", "Beto"], initialMs: 90_000, incrementMs: 0,
        })).toBe(true);
        clock.result.current.undo();
      });
      await write.started;
    } finally {
      await act(async () => { write.release(); await write.completed; });
    }
    await waitFor(() => expect(clock.result.current.persistence).toBe("saved"));
    expect(clock.result.current.state.mode).toBeNull();
    expect(clock.result.current.canUndo).toBe(false);
    expect(await readCompanion("anon:clock")).toMatchObject({ rev: 2, log: [] });
  });

  it("adopta la partida ganadora por CAS sin sobrescribirla con commits de la rama perdida", async () => {
    const stale = renderHook(() => useClock("anon"));
    const winner = renderHook(() => useClock("anon"));
    await waitFor(() => {
      expect(stale.result.current.loaded).toBe(true);
      expect(winner.result.current.loaded).toBe(true);
    });
    act(() => { winner.result.current.emit("chess_configured", {
      players: ["Cara", "Dani"], initialMs: 60_000, incrementMs: 0,
    }); });
    await waitFor(() => expect(winner.result.current.persistence).toBe("saved"));
    act(() => {
      expect(stale.result.current.emit("chess_configured", {
        players: ["Ana", "Beto"], initialMs: 90_000, incrementMs: 0,
      })).toBe(true);
      expect(stale.result.current.emit("clock_paused", {})).toBe(true);
    });
    await waitFor(() => expect(stale.result.current.persistence).toBe("saved"));
    expect(stale.result.current.state).toMatchObject({
      initialMs: 60_000, paused: false, players: [{ name: "Cara" }, { name: "Dani" }],
    });
    act(() => { expect(stale.result.current.emit("clock_paused", {})).toBe(true); });
    await waitFor(() => expect(stale.result.current.persistence).toBe("saved"));
    stale.unmount();
    winner.unmount();
    const restored = renderHook(() => useClock("anon"));
    await waitFor(() => expect(restored.result.current.loaded).toBe(true));
    expect(restored.result.current.state).toMatchObject({
      initialMs: 60_000, paused: true, players: [{ name: "Cara" }, { name: "Dani" }],
    });
  });

  it.each(["desmontar", "cambiar de identidad"] as const)(
    "invalida la cola que pierde un CAS incluso después de %s",
    async (detach) => {
      const stale = renderHook(({ identity }) => useClock(identity), {
        initialProps: { identity: "anon" },
      });
      const winner = renderHook(() => useClock("anon"));
      await waitFor(() => {
        expect(stale.result.current.loaded).toBe(true);
        expect(winner.result.current.loaded).toBe(true);
      });
      act(() => { winner.result.current.emit("chess_configured", {
        players: ["Cara", "Dani"], initialMs: 60_000, incrementMs: 0,
      }); });
      await waitFor(() => expect(winner.result.current.persistence).toBe("saved"));
      const write = holdNextCompanionWrite();
      try {
        act(() => {
          expect(stale.result.current.emit("chess_configured", {
            players: ["Ana", "Beto"], initialMs: 90_000, incrementMs: 0,
          })).toBe(true);
          expect(stale.result.current.emit("clock_paused", {})).toBe(true);
        });
        if (detach === "desmontar") stale.unmount();
        else stale.rerender({ identity: "new-user" });
        await write.started;
      } finally {
        await act(async () => { write.release(); await write.completed; });
      }
      const record = await readCompanion("anon:clock");
      expect(record).toMatchObject({ rev: 1, log: [{
        type: "chess_configured",
        payload: { players: ["Cara", "Dani"], initialMs: 60_000, incrementMs: 0 },
      }] });
      expect(record?.log).toHaveLength(1);
      const restored = renderHook(() => useClock("anon"));
      await waitFor(() => expect(restored.result.current.loaded).toBe(true));
      expect(restored.result.current.state).toMatchObject({
        initialMs: 60_000, paused: false, players: [{ name: "Cara" }, { name: "Dani" }],
      });
      if (detach === "cambiar de identidad") {
        await waitFor(() => expect(stale.result.current.loaded).toBe(true));
        expect(stale.result.current.state.mode).toBeNull();
      }
    },
  );

  it("rechaza un inicio inválido sin publicarlo y permite corregirlo", async () => {
    const { result } = renderHook(() => useClock("anon"));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    act(() => { expect(result.current.emit("chess_configured", {
      players: ["Ana", "Ana"], initialMs: 90_000, incrementMs: 0,
    })).toBe(false); });
    expect(result.current.state.mode).toBeNull();
    expect(result.current.persistence).toBe("idle");
    act(() => { expect(result.current.emit("chess_configured", {
      players: ["Ana", "Beto"], initialMs: 90_000, incrementMs: 0,
    })).toBe(true); });
    await waitFor(() => expect(result.current.persistence).toBe("saved"));
    expect(result.current.state.mode).toBe("chess");
  });

  it("conserva Aleatorio y Turnos optimistas y espera el ACK de Recursos con emit booleano", async () => {
    const useTools = () => ({
      random: useCompanion("anon"),
      resources: useResources("anon"),
      turns: useTurns("anon"),
    });
    const { result, unmount } = renderHook(useTools);
    await waitFor(() => {
      expect(result.current.random.loaded).toBe(true);
      expect(result.current.resources.loaded).toBe(true);
      expect(result.current.turns.loaded).toBe(true);
    });
    const write = holdNextCompanionWrite();
    try {
      act(() => {
        expect(result.current.random.emit("players_set", { players: ["Ana", "Beto"] })).toBe(true);
        expect(result.current.resources.emit("players_set", { players: ["Ana", "Beto"] })).toBe(true);
        expect(result.current.turns.emit("turns_configured", {
          players: ["Ana", "Beto"], phases: ["Inicio"],
        })).toBe(true);
      });
      await write.started;
      expect(result.current.random.state.players).toEqual(["Ana", "Beto"]);
      expect(result.current.resources.state.players).toEqual([]);
      expect(result.current.resources.persistence).toBe("pending");
      expect(result.current.turns.state.players).toEqual(["Ana", "Beto"]);
    } finally {
      await act(async () => { write.release(); await write.completed; });
    }
    await waitFor(() => expect(result.current.resources.persistence).toBe("saved"));
    expect(result.current.resources.state.players).toEqual(["Ana", "Beto"]);
    unmount();
    const restored = renderHook(useTools);
    await waitFor(() => {
      expect(restored.result.current.random.loaded).toBe(true);
      expect(restored.result.current.resources.loaded).toBe(true);
      expect(restored.result.current.turns.loaded).toBe(true);
    });
    expect(restored.result.current.random.state.players).toEqual(["Ana", "Beto"]);
    expect(restored.result.current.resources.state.players).toEqual(["Ana", "Beto"]);
    expect(restored.result.current.turns.state.players).toEqual(["Ana", "Beto"]);
  });
});
