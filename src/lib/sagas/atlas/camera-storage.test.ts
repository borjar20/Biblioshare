import { afterEach, describe, expect, it, vi } from "vitest";
import type { CameraContext } from "./camera-storage";
import { readCamera, writeCamera } from "./camera-storage";

function fakeStorage() {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

const ORDEN: CameraContext = { lens: "orden", orientation: "h" };

afterEach(() => vi.unstubAllGlobals());

describe("cámara del atlas en sessionStorage", () => {
  it("ida y vuelta por saga, con la clave saga-atlas:<id>", () => {
    const s = fakeStorage();
    vi.stubGlobal("sessionStorage", s);
    writeCamera("abc", { x: 10, y: -4, k: 1.5 }, ORDEN);
    expect([...s.data.keys()]).toEqual(["saga-atlas:abc"]);
    expect(readCamera("abc", ORDEN)).toEqual({ x: 10, y: -4, k: 1.5 });
    expect(readCamera("otra", ORDEN)).toBeNull();
  });

  it("null si getItem lanza", () => {
    vi.stubGlobal("sessionStorage", { getItem: () => { throw new Error("bloqueado"); }, setItem: () => {} });
    expect(readCamera("abc", ORDEN)).toBeNull();
  });

  it("escribir no lanza aunque el almacenamiento falle", () => {
    vi.stubGlobal("sessionStorage", { getItem: () => null, setItem: () => { throw new Error("lleno"); } });
    expect(() => writeCamera("abc", { x: 0, y: 0, k: 1 }, ORDEN)).not.toThrow();
  });

  it("descarta lo que no es una cámara válida", () => {
    const s = fakeStorage();
    vi.stubGlobal("sessionStorage", s);
    s.data.set("saga-atlas:a", "no-json");
    s.data.set("saga-atlas:b", JSON.stringify({ x: 1, y: 2, k: 0 }));
    s.data.set("saga-atlas:c", JSON.stringify({ x: "1", y: 2, k: 1 }));
    expect(readCamera("a", ORDEN)).toBeNull();
    expect(readCamera("b", ORDEN)).toBeNull();
    expect(readCamera("c", ORDEN)).toBeNull();
  });

  it("solo restaura si coinciden lente y orientación", () => {
    vi.stubGlobal("sessionStorage", fakeStorage());
    writeCamera("abc", { x: 10, y: -4, k: 1.5 }, ORDEN);
    expect(readCamera("abc", { lens: "publicacion", orientation: "h" })).toBeNull();
    expect(readCamera("abc", { lens: "orden", orientation: "v" })).toBeNull();
    expect(readCamera("abc", ORDEN)).toEqual({ x: 10, y: -4, k: 1.5 });
  });

  it("ignora el formato antiguo, sin lente ni orientación", () => {
    const s = fakeStorage();
    vi.stubGlobal("sessionStorage", s);
    s.data.set("saga-atlas:abc", JSON.stringify({ x: 10, y: -4, k: 1.5 }));
    expect(readCamera("abc", ORDEN)).toBeNull();
  });
});
