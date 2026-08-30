// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_PREFERENCES,
  PREFERENCES_KEY,
  __resetPreferencesForTests,
  preferencesStore,
  readPreferences,
  writePreferences,
} from "./preferences";

beforeEach(() => {
  localStorage.clear();
  __resetPreferencesForTests();
});

describe("preferencias de vista del tablero", () => {
  it("sin nada guardado devuelve los valores por defecto", () => {
    expect(readPreferences()).toEqual(DEFAULT_PREFERENCES);
    expect(DEFAULT_PREFERENCES.layout).toBe("auto");
  });

  it("guarda y relee", () => {
    writePreferences({ orientation: "landscape", layout: "head", keepAwake: false });
    expect(readPreferences()).toEqual({
      orientation: "landscape",
      layout: "head",
      keepAwake: false,
    });
  });

  it("un valor corrupto no rompe el tablero: cae al por defecto", () => {
    localStorage.setItem(PREFERENCES_KEY, "{no es json");
    expect(readPreferences()).toEqual(DEFAULT_PREFERENCES);
  });

  it("un valor fuera del dominio se descarta campo a campo, no entero", () => {
    localStorage.setItem(
      PREFERENCES_KEY,
      JSON.stringify({ orientation: "diagonal", layout: "head", keepAwake: "sí" }),
    );
    const prefs = readPreferences();
    expect(prefs.orientation).toBe(DEFAULT_PREFERENCES.orientation);
    expect(prefs.layout).toBe("head"); // este sí era válido: se conserva
    expect(prefs.keepAwake).toBe(DEFAULT_PREFERENCES.keepAwake);
  });

  it("no lleva identidad en la clave: es preferencia del dispositivo, no dato de nadie", () => {
    // Si algún día guardara algo del jugador tendría que aislarse por identidad como
    // el log de la partida (misma clase de fuga que el arreglo #680 del SW).
    expect(PREFERENCES_KEY).toBe("biblioshare:play:board");
    expect(PREFERENCES_KEY).not.toContain("anon");
  });

  it("el store avisa a sus suscriptores al escribir, y deja de hacerlo al desuscribirse", () => {
    let avisos = 0;
    const unsubscribe = preferencesStore.subscribe(() => {
      avisos += 1;
    });
    writePreferences({ ...DEFAULT_PREFERENCES, orientation: "landscape" });
    expect(avisos).toBe(1);
    expect(preferencesStore.getSnapshot().orientation).toBe("landscape");
    unsubscribe();
    writePreferences(DEFAULT_PREFERENCES);
    expect(avisos).toBe(1);
  });

  it("getSnapshot devuelve la MISMA referencia mientras no cambie nada", () => {
    // useSyncExternalStore entra en bucle infinito si el snapshot es un objeto nuevo
    // en cada llamada.
    expect(preferencesStore.getSnapshot()).toBe(preferencesStore.getSnapshot());
    const antes = preferencesStore.getSnapshot();
    writePreferences({ ...DEFAULT_PREFERENCES, keepAwake: false });
    expect(preferencesStore.getSnapshot()).not.toBe(antes);
  });
});
