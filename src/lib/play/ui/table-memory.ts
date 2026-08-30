import { MTG_MODES, type MtgMode } from "@/lib/play/mtg/modes";
import type { MtgSetup } from "@/lib/play/mtg/types";

/**
 * «La última mesa usada». La fricción no está en la primera partida —esa se
 * configura con ganas—, está en la tercera de la tarde: si hay que reescribir cuatro
 * nombres y cuatro comandantes cada vez, se deja de usar la app y se vuelve a los
 * dados. Esto es lo que hace posible «Revancha» y el prerrelleno de «Nueva partida».
 *
 * CERO motor: no es un evento, no entra en el replay y no cambia el estado de
 * ninguna partida. Es una clave aparte del log, escrita al EMPEZAR cada partida.
 *
 * Va aislada por identidad porque guarda NOMBRES de personas: la mesa de una cuenta
 * no puede aparecer en otra del mismo dispositivo (arreglo #680, misma clase de
 * fuga que resuelve `playStorageKey`).
 */
const MEMORY_VERSION = 1 as const;

export function tableMemoryKey(identity: string): string {
  // Una identidad vacía colapsaría la clave a un valor compartido y fusionaría las
  // mesas de dos cuentas reales bajo la misma entrada. Las llamadoras pasan un uid
  // o el literal "anon", nunca "".
  if (identity.trim() === "") {
    throw new Error("tableMemoryKey: identity no puede estar vacía");
  }
  return `biblioshare:play:${identity}:table`;
}

/**
 * Valida la forma Y lo que el motor exigiría al arrancar. No basta con que sea JSON
 * válido: ofrecer una mesa que `initialMtgState` va a rechazar convierte «Revancha»
 * en un botón que no hace nada.
 */
function isUsableSetup(value: unknown): value is MtgSetup {
  if (typeof value !== "object" || value === null) return false;
  const setup = value as MtgSetup;
  const config = MTG_MODES[setup.mode as MtgMode];
  if (!config) return false;
  if (!Array.isArray(setup.participants)) return false;
  const n = setup.participants.length;
  if (n < config.minPlayers || n > config.maxPlayers) return false;
  if (typeof setup.startingLife !== "number" || !Number.isFinite(setup.startingLife)) return false;
  if (
    typeof setup.startingSeat !== "number" ||
    !Number.isInteger(setup.startingSeat) ||
    setup.startingSeat < 0 ||
    setup.startingSeat >= n
  ) {
    return false;
  }

  const participantIds = new Set<string>();
  const commanderIds = new Set<string>();
  for (const participant of setup.participants) {
    if (typeof participant?.id !== "string" || participant.id === "") return false;
    if (participantIds.has(participant.id)) return false;
    participantIds.add(participant.id);
    if (!Array.isArray(participant.commanders)) return false;
    if (participant.commanders.length < 1 || participant.commanders.length > config.maxCommanders) {
      return false;
    }
    for (const commander of participant.commanders) {
      if (typeof commander?.id !== "string" || commander.id === "") return false;
      // Dos ids iguales mezclarían dos contadores de 21 y el umbral dejaría de
      // significar nada (decisión 2026-08-29 (8)). El reducer lo rechaza; aquí se
      // descarta antes de ofrecerlo.
      if (commanderIds.has(commander.id)) return false;
      commanderIds.add(commander.id);
    }
  }
  return true;
}

export function rememberTable(identity: string, setup: MtgSetup): void {
  try {
    globalThis.localStorage?.setItem(
      tableMemoryKey(identity),
      JSON.stringify({ v: MEMORY_VERSION, setup }),
    );
  } catch {
    // Sin storage se juega igual; solo se pierde el prerrelleno de la siguiente.
  }
  snapshots.delete(identity);
}

/**
 * Igual que `readRememberedTable` pero devolviendo SIEMPRE la misma referencia
 * mientras no se reescriba la mesa. Lo necesita `useSyncExternalStore`, que es como
 * se lee `localStorage` en este repo (leerlo con `useState`+`useEffect` está
 * prohibido por lint y además pinta un primer render con el valor equivocado): un
 * objeto nuevo en cada llamada mete a React en un bucle de re-render.
 */
const snapshots = new Map<string, MtgSetup | null>();

export function rememberedTableSnapshot(identity: string): MtgSetup | null {
  if (!snapshots.has(identity)) snapshots.set(identity, readRememberedTable(identity));
  return snapshots.get(identity) ?? null;
}

/** Solo para tests: olvida lo cacheado, no lo guardado. */
export function __resetTableSnapshotsForTests(): void {
  snapshots.clear();
}

export function readRememberedTable(identity: string): MtgSetup | null {
  try {
    const raw = globalThis.localStorage?.getItem(tableMemoryKey(identity)) ?? null;
    if (!raw) return null;
    const snapshot = JSON.parse(raw) as { v?: number; setup?: unknown };
    if (snapshot?.v !== MEMORY_VERSION) return null;
    return isUsableSetup(snapshot.setup) ? snapshot.setup : null;
  } catch {
    return null;
  }
}

/**
 * Revancha: empieza el siguiente. Es la convención de cualquier mesa y evita la
 * discusión de quién empieza. Sigue siendo editable en «Personalizar».
 */
export function rotateStartingSeat(setup: MtgSetup): MtgSetup {
  return { ...setup, startingSeat: (setup.startingSeat + 1) % setup.participants.length };
}
