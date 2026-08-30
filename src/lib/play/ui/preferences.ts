import type { BoardOrientation, LayoutFamily } from "./layout";

/**
 * Preferencias de VISTA del tablero. No son estado de partida: no entran en el log
 * de eventos, no reordenan asientos y cambiar cualquiera de ellas no altera nada de
 * lo que pasa en la mesa. Por eso viven en `localStorage` SIN aislar por identidad —
 * aquí no hay dato de nadie, solo cómo prefiere mirar este dispositivo. (Lo que sí
 * lleva nombres de personas, la última mesa usada, va aparte y sí aislado:
 * `table-memory.ts`.)
 *
 * `orientation` no sigue el giro del móvil a propósito: girar sin querer
 * recolocaría la mesa delante de cuatro personas en mitad de un turno. Se gira desde
 * el menú, y así es una decisión y no un accidente.
 */
export type BoardPreferences = {
  orientation: BoardOrientation;
  /** `auto` = el que recomiende `defaultLayout` para el número de jugadores de turno. */
  layout: LayoutFamily | "auto";
  keepAwake: boolean;
};

export const PREFERENCES_KEY = "biblioshare:play:board";

export const DEFAULT_PREFERENCES: BoardPreferences = {
  orientation: "portrait",
  layout: "auto",
  keepAwake: true,
};

const ORIENTATIONS: readonly string[] = ["portrait", "landscape"];
const LAYOUTS: readonly string[] = ["auto", "rows", "head", "flat"];

/** Campo a campo: un valor raro no invalida los otros dos. */
function parse(raw: string | null): BoardPreferences {
  if (!raw) return DEFAULT_PREFERENCES;
  try {
    const parsed = JSON.parse(raw) as Partial<BoardPreferences>;
    return {
      orientation: ORIENTATIONS.includes(parsed?.orientation as string)
        ? (parsed.orientation as BoardOrientation)
        : DEFAULT_PREFERENCES.orientation,
      layout: LAYOUTS.includes(parsed?.layout as string)
        ? (parsed.layout as LayoutFamily | "auto")
        : DEFAULT_PREFERENCES.layout,
      keepAwake:
        typeof parsed?.keepAwake === "boolean" ? parsed.keepAwake : DEFAULT_PREFERENCES.keepAwake,
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export function readPreferences(): BoardPreferences {
  try {
    return parse(globalThis.localStorage?.getItem(PREFERENCES_KEY) ?? null);
  } catch {
    // Modo privado o cuota llena: se juega igual con los valores por defecto.
    return DEFAULT_PREFERENCES;
  }
}

let cached: BoardPreferences = readPreferences();
const listeners = new Set<() => void>();

export function writePreferences(next: BoardPreferences): void {
  cached = next;
  try {
    globalThis.localStorage?.setItem(PREFERENCES_KEY, JSON.stringify(next));
  } catch {
    // Sin storage la preferencia dura lo que la pestaña. No rompe la partida.
  }
  for (const listener of listeners) listener();
}

/**
 * Store mínimo para `useSyncExternalStore`: leer `localStorage` con
 * `useState`+`useEffect` está prohibido por lint (`set-state-in-effect`) y además
 * provoca un primer render con el valor equivocado. `getSnapshot` devuelve la MISMA
 * referencia mientras no se escriba — un objeto nuevo por llamada mete a React en un
 * bucle de re-render (misma trampa resuelta en `use-timer-state.ts`).
 */
export const preferencesStore = {
  subscribe(callback: () => void): () => void {
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  },
  getSnapshot(): BoardPreferences {
    return cached;
  },
};

/** Solo para tests: vuelve a leer el storage con la caché vacía. */
export function __resetPreferencesForTests(): void {
  cached = readPreferences();
  listeners.clear();
}
