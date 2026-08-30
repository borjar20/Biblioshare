// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { guest, guestWithPartner, makeSetup } from "@/lib/play/mtg/test-fixtures";
import { initialMtgState } from "@/lib/play/mtg/reducer";
import { makeEvent } from "@/lib/play/core/events";
import type { GameStartedEvent } from "@/lib/play/mtg/events";
import type { MtgSetup } from "@/lib/play/mtg/types";
import {
  __resetTableSnapshotsForTests,
  readRememberedTable,
  rememberTable,
  rememberedTableSnapshot,
  rotateStartingSeat,
  tableMemoryKey,
} from "./table-memory";

const arrancar = (setup: MtgSetup) =>
  initialMtgState(
    makeEvent("game_started", { toolId: "mtg" as const, setup }, 1000, "e1") as GameStartedEvent,
  );

beforeEach(() => {
  localStorage.clear();
  __resetTableSnapshotsForTests();
});

describe("memoria de la última mesa", () => {
  it("guarda y devuelve la mesa entera, comandantes incluidos", () => {
    const setup = {
      ...makeSetup(),
      participants: [guestWithPartner("ana"), guest("borja"), guest("carlos"), guest("laura")],
    };
    rememberTable("anon", setup);
    const leida = readRememberedTable("anon");
    expect(leida?.participants).toHaveLength(4);
    expect(leida?.participants[0].commanders).toHaveLength(2);
  });

  it("lo que devuelve ARRANCA en el motor: no ofrece una mesa que no puede empezar", () => {
    rememberTable("anon", makeSetup());
    expect(() => arrancar(readRememberedTable("anon")!)).not.toThrow();
  });

  it("va aislada por identidad: la mesa de una cuenta no se lee desde otra", () => {
    // Guarda NOMBRES de personas reales: misma clase de fuga entre cuentas del mismo
    // dispositivo que el arreglo #680.
    rememberTable("uid-1", makeSetup());
    expect(readRememberedTable("uid-2")).toBeNull();
    expect(tableMemoryKey("uid-1")).not.toBe(tableMemoryKey("uid-2"));
  });

  it("no comparte clave con el log de la partida", () => {
    // Si compartieran clave, descartar la partida se llevaría por delante la mesa
    // recordada, que es justo lo que la revancha necesita que sobreviva.
    expect(tableMemoryKey("anon")).not.toBe("biblioshare:play:anon:active");
  });

  it("una identidad vacía es un error de programación, no una mesa compartida", () => {
    expect(() => tableMemoryKey("  ")).toThrow();
  });

  it("descarta lo corrupto en vez de romper la configuración", () => {
    localStorage.setItem(tableMemoryKey("anon"), "{no es json");
    expect(readRememberedTable("anon")).toBeNull();
  });

  it("descarta una mesa semánticamente imposible (comandantes duplicados)", () => {
    localStorage.setItem(
      tableMemoryKey("anon"),
      JSON.stringify({
        v: 1,
        setup: {
          mode: "commander",
          startingLife: 40,
          startingSeat: 0,
          participants: [
            { id: "a", kind: "guest", name: "a", commanders: [{ id: "dup" }] },
            { id: "b", kind: "guest", name: "b", commanders: [{ id: "dup" }] },
          ],
        },
      }),
    );
    expect(readRememberedTable("anon")).toBeNull();
  });

  it("descarta una mesa con más jugadores de los que admite el modo", () => {
    const setup = { ...makeSetup(["ana", "borja", "carlos"]), mode: "duel" as const };
    localStorage.setItem(tableMemoryKey("anon"), JSON.stringify({ v: 1, setup }));
    expect(readRememberedTable("anon")).toBeNull();
  });

  it("descarta un turno inicial fuera de la mesa", () => {
    const setup = { ...makeSetup(), startingSeat: 9 };
    localStorage.setItem(tableMemoryKey("anon"), JSON.stringify({ v: 1, setup }));
    expect(readRememberedTable("anon")).toBeNull();
  });

  it("descarta una versión de snapshot que no reconoce", () => {
    localStorage.setItem(tableMemoryKey("anon"), JSON.stringify({ v: 99, setup: makeSetup() }));
    expect(readRememberedTable("anon")).toBeNull();
  });

  it("el snapshot devuelve la MISMA referencia hasta que se reescribe la mesa", () => {
    // Lo consume `useSyncExternalStore`, que entra en bucle de re-render si el
    // snapshot es un objeto nuevo en cada llamada.
    rememberTable("anon", makeSetup());
    const primera = rememberedTableSnapshot("anon");
    expect(rememberedTableSnapshot("anon")).toBe(primera);

    rememberTable("anon", { ...makeSetup(), startingSeat: 2 });
    const segunda = rememberedTableSnapshot("anon");
    expect(segunda).not.toBe(primera);
    expect(segunda?.startingSeat).toBe(2);
  });

  it("la revancha rota el turno inicial un asiento y vuelve al principio", () => {
    const setup = makeSetup(); // cuatro jugadores, empieza el 0
    expect(rotateStartingSeat(setup).startingSeat).toBe(1);
    expect(rotateStartingSeat({ ...setup, startingSeat: 3 }).startingSeat).toBe(0);
  });

  it("rotar no toca a los participantes: solo cambia quién empieza", () => {
    const setup = makeSetup();
    expect(rotateStartingSeat(setup).participants).toEqual(setup.participants);
  });
});
