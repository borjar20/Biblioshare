# Tracker de turnos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cuarto acompañante: orden de turno, rondas, fases y dirección en `/partidas/turnos`, con anillo de fichas y cero inputs a la vista.

**Architecture:** Motor event-sourced sobre `useCompanionStore` (clave `` `${identity}:turns` ``); avance con eliminados y dirección en `nextAlive` (selector puro exportado); UI visual-first — fichas de asiento, fases como píldoras preset, y el centro del anillo como único botón de avance.

**Tech Stack:** React 19, next-intl, Vitest, Playwright.

## Global Constraints

- Rama `feat/play-turns` desde main — commits directos.
- Motor puro bajo `src/lib/play/turns/`; validación estricta (payload inválido lanza).
- Límites: jugadores 2..8, fases 0..6, nombres/fases únicos recortados.
- Visual-first (memoria `biblioplay-visual-first`): NINGÚN input libre a la vista — solo tras fichas/píldoras «+»; borrador a salvo al tocar habituales; `aria-controls`; un primario por vista («Empezar»); `buzz()` solo al cambiar de jugador.
- Unit: `fnm exec --using=22 -- npx.cmd vitest run <path>`. e2e: `fnm exec --using=22 -- npm.cmd run test:e2e -- <spec>` (Playwright gestiona el dev server; NO arrancar otro). Node 20 del shell rompe ambos: siempre el prefijo fnm.
- `git add` con rutas explícitas, nunca `-A` ni `.`.
- Trailers de commit:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01G4eSiCCSCeeEzbYQK1mSS4`

---

### Task 1: Motor de turnos + hook (TDD)

**Files:**
- Create: `src/lib/play/turns/types.ts`
- Create: `src/lib/play/turns/events.ts`
- Create: `src/lib/play/turns/selectors.ts`
- Create: `src/lib/play/turns/reducer.ts`
- Create: `src/lib/play/turns/use-turns.ts`
- Test: `src/lib/play/turns/reducer.test.ts`

**Interfaces:**
- Consumes: `PlayEvent`/`makeEvent` de core; `useCompanionStore`/`CompanionEmit`.
- Produces: `TurnsState`, `initialTurnsState()`; `TurnsEvent` (9 eventos); `aliveCount(state)`, `nextAlive(state, from, direction)`; `turnsReducer`, `replayTurns`, `compactTurnsIfNeeded`, `TURNS_MAX_PLAYERS` (8), `TURNS_MAX_PHASES` (6); `useTurns(identity)` → `{ state, emit, undo, canUndo, clear, loaded }`. Tasks 2-3 los consumen tal cual.

- [ ] **Step 1: `types.ts`**

```ts
// Estado del acompañante «Turnos» (spec turnos §1). Los asientos (players y
// su color por posición) son FIJOS tras configurar; eliminated es un
// subconjunto que sale de la rotación sin perder el asiento.
export type TurnsState = {
  players: string[];
  eliminated: string[];
  phases: string[];
  active: number | null; // null = sin configurar
  phase: number;
  round: number;
  direction: 1 | -1;
};

export function initialTurnsState(): TurnsState {
  return {
    players: [],
    eliminated: [],
    phases: [],
    active: null,
    phase: 0,
    round: 1,
    direction: 1,
  };
}
```

- [ ] **Step 2: `events.ts`**

```ts
import type { PlayEvent } from "@/lib/play/core/types";

// Eventos del tracker (spec turnos §1). turns_configured es atómico (setup
// local + Empezar, como chess_configured): sin él no hay nada que avanzar.
export type TurnsConfiguredEvent = PlayEvent<
  "turns_configured",
  { players: string[]; phases: string[] }
>;
export type TurnAdvancedEvent = PlayEvent<"turn_advanced", Record<string, never>>;
export type PhaseAdvancedEvent = PlayEvent<"phase_advanced", Record<string, never>>;
export type TurnSkippedEvent = PlayEvent<"turn_skipped", Record<string, never>>;
export type DirectionToggledEvent = PlayEvent<"direction_toggled", Record<string, never>>;
export type PlayerEliminatedEvent = PlayEvent<"player_eliminated", { name: string }>;
export type PlayerRestoredEvent = PlayEvent<"player_restored", { name: string }>;
export type TurnsResetEvent = PlayEvent<"turns_reset", Record<string, never>>;
export type TurnsClearedEvent = PlayEvent<"cleared", Record<string, never>>;

export type TurnsEvent =
  | TurnsConfiguredEvent
  | TurnAdvancedEvent
  | PhaseAdvancedEvent
  | TurnSkippedEvent
  | DirectionToggledEvent
  | PlayerEliminatedEvent
  | PlayerRestoredEvent
  | TurnsResetEvent
  | TurnsClearedEvent;

// Mismo patrón anti-olvido que RANDOM_EVENT_TYPE_MAP.
const TURNS_EVENT_TYPE_MAP = {
  turns_configured: true,
  turn_advanced: true,
  phase_advanced: true,
  turn_skipped: true,
  direction_toggled: true,
  player_eliminated: true,
  player_restored: true,
  turns_reset: true,
  cleared: true,
} satisfies Record<TurnsEvent["type"], true>;

export const TURNS_EVENT_TYPES: ReadonlySet<TurnsEvent["type"]> = new Set(
  Object.keys(TURNS_EVENT_TYPE_MAP) as TurnsEvent["type"][],
);
```

- [ ] **Step 3: `selectors.ts`**

```ts
import type { TurnsState } from "./types";

export function aliveCount(state: TurnsState): number {
  return state.players.length - state.eliminated.length;
}

// Siguiente índice VIVO desde `from` según `direction`. Con un solo vivo
// devuelve `from` (el reducer lo impide antes exigiendo ≥2 vivos).
export function nextAlive(state: TurnsState, from: number, direction: 1 | -1): number {
  const n = state.players.length;
  let i = from;
  do {
    i = (i + direction + n) % n;
  } while (state.eliminated.includes(state.players[i]) && i !== from);
  return i;
}
```

- [ ] **Step 4: Tests que fallan (`reducer.test.ts`)**

Fichero completo:

```ts
import { describe, expect, it } from "vitest";
import { makeEvent } from "@/lib/play/core/events";
import type { PlayEvent } from "@/lib/play/core/types";
import { initialTurnsState, type TurnsState } from "./types";
import type { TurnsEvent } from "./events";
import {
  compactTurnsIfNeeded,
  replayTurns,
  turnsReducer,
  TURNS_COMPACT_THRESHOLD,
} from "./reducer";
import { aliveCount, nextAlive } from "./selectors";

const t0 = 1000;
const ev = <T extends TurnsEvent["type"]>(
  type: T,
  payload: Extract<TurnsEvent, { type: T }>["payload"],
) => makeEvent(type, payload, t0) as TurnsEvent;

const cfg = (players = ["Ana", "Beto", "Carla"], phases: string[] = []) =>
  ev("turns_configured", { players, phases });

function run(events: TurnsEvent[], base: TurnsState | null = null): TurnsState {
  return events.reduce(turnsReducer, base ?? initialTurnsState());
}

describe("turns_configured", () => {
  it("arranca en el primero, ronda 1, dirección 1", () => {
    const s = run([cfg(["Ana", "Beto"], ["Mantenimiento", "Acción"])]);
    expect(s).toMatchObject({ active: 0, phase: 0, round: 1, direction: 1, eliminated: [] });
    expect(s.phases).toEqual(["Mantenimiento", "Acción"]);
  });
  it("rechaza jugadores y fases inválidos", () => {
    const s = initialTurnsState();
    expect(() => turnsReducer(s, cfg(["Ana"]))).toThrow();
    expect(() => turnsReducer(s, cfg(["Ana", "Ana"]))).toThrow();
    expect(() => turnsReducer(s, cfg(["Ana", " "]))).toThrow();
    expect(() =>
      turnsReducer(s, cfg(["a", "b", "c", "d", "e", "f", "g", "h", "i"])),
    ).toThrow();
    expect(() => turnsReducer(s, cfg(["Ana", "Beto"], ["F", "F"]))).toThrow();
    expect(() =>
      turnsReducer(s, cfg(["Ana", "Beto"], ["1", "2", "3", "4", "5", "6", "7"])),
    ).toThrow();
  });
  it("acepta los extremos exactos (8 jugadores, 6 fases)", () => {
    const s = run([
      cfg(["a", "b", "c", "d", "e", "f", "g", "h"], ["1", "2", "3", "4", "5", "6"]),
    ]);
    expect(s.players).toHaveLength(8);
    expect(s.phases).toHaveLength(6);
  });
});

describe("turn_advanced — dirección, eliminados y ronda envolvente", () => {
  it("avanza y la ronda sube al envolver (dir 1)", () => {
    let s = run([cfg()]);
    s = turnsReducer(s, ev("turn_advanced", {})); // Beto
    expect(s).toMatchObject({ active: 1, round: 1 });
    s = turnsReducer(s, ev("turn_advanced", {})); // Carla
    s = turnsReducer(s, ev("turn_advanced", {})); // Ana: envuelve
    expect(s).toMatchObject({ active: 0, round: 2 });
  });
  it("con dirección invertida envuelve hacia el otro lado", () => {
    let s = run([cfg(), ev("direction_toggled", {})]);
    s = turnsReducer(s, ev("turn_advanced", {})); // de Ana (0) a Carla (2): envuelve
    expect(s).toMatchObject({ active: 2, round: 2, direction: -1 });
  });
  it("salta eliminados y resetea la fase", () => {
    let s = run([
      cfg(["Ana", "Beto", "Carla"], ["F1", "F2"]),
      ev("player_eliminated", { name: "Beto" }),
      ev("phase_advanced", {}),
    ]);
    expect(s.phase).toBe(1);
    s = turnsReducer(s, ev("turn_advanced", {}));
    expect(s.active).toBe(2); // Beto saltado
    expect(s.phase).toBe(0);
  });
  it("sin configurar o con <2 vivos lanza", () => {
    expect(() => turnsReducer(initialTurnsState(), ev("turn_advanced", {}))).toThrow();
  });
});

describe("turn_skipped", () => {
  it("equivale a dos avances (rondas incluidas)", () => {
    let s = run([cfg(["Ana", "Beto"])]);
    s = turnsReducer(s, ev("turn_skipped", {})); // Beto pierde: Ana→Beto→Ana, envuelve una vez
    expect(s).toMatchObject({ active: 0, round: 2 });
  });
});

describe("phase_advanced", () => {
  it("avanza y en la última lanza (la UI encadena turn_advanced)", () => {
    let s = run([cfg(["Ana", "Beto"], ["F1", "F2"])]);
    s = turnsReducer(s, ev("phase_advanced", {}));
    expect(s.phase).toBe(1);
    expect(() => turnsReducer(s, ev("phase_advanced", {}))).toThrow();
  });
  it("sin fases lanza", () => {
    const s = run([cfg(["Ana", "Beto"])]);
    expect(() => turnsReducer(s, ev("phase_advanced", {}))).toThrow();
  });
});

describe("eliminar y restaurar", () => {
  it("eliminar al activo avanza primero; restaurar devuelve el asiento", () => {
    let s = run([cfg()]);
    s = turnsReducer(s, ev("player_eliminated", { name: "Ana" }));
    expect(s.active).toBe(1);
    expect(s.eliminated).toEqual(["Ana"]);
    s = turnsReducer(s, ev("player_restored", { name: "Ana" }));
    expect(s.eliminated).toEqual([]);
    expect(aliveCount(s)).toBe(3);
  });
  it("no deja bajar de 2 vivos ni tocar inexistentes", () => {
    let s = run([cfg(), ev("player_eliminated", { name: "Carla" })]);
    expect(() => turnsReducer(s, ev("player_eliminated", { name: "Beto" }))).toThrow();
    expect(() => turnsReducer(s, ev("player_eliminated", { name: "Zoe" }))).toThrow();
    expect(() => turnsReducer(s, ev("player_eliminated", { name: "Carla" }))).toThrow();
    expect(() => turnsReducer(s, ev("player_restored", { name: "Ana" }))).toThrow();
  });
});

describe("turns_reset y cleared", () => {
  it("reset conserva players/phases y vuelve a sin-configurar", () => {
    const s = run([
      cfg(["Ana", "Beto"], ["F1"]),
      ev("turn_advanced", {}),
      ev("turns_reset", {}),
    ]);
    expect(s).toMatchObject({ active: null, round: 1, direction: 1, eliminated: [] });
    expect(s.players).toEqual(["Ana", "Beto"]);
    expect(s.phases).toEqual(["F1"]);
  });
  it("reset sin configurar lanza; cleared vacía todo", () => {
    expect(() => run([ev("turns_reset", {})])).toThrow();
    expect(run([cfg(), ev("cleared", {})])).toEqual(initialTurnsState());
  });
});

describe("nextAlive", () => {
  it("recorre vivos en ambas direcciones", () => {
    const s = run([cfg(["a", "b", "c", "d"]), ev("player_eliminated", { name: "b" })]);
    expect(nextAlive(s, 0, 1)).toBe(2);
    expect(nextAlive(s, 2, -1)).toBe(0);
    expect(nextAlive(s, 0, -1)).toBe(3);
  });
});

describe("replay y compactación", () => {
  it("replay rechaza eventos desconocidos", () => {
    const alien = makeEvent("dice_rolled", { count: 1, sides: 6, results: [1] }, t0) as PlayEvent;
    expect(() => replayTurns(null, [alien])).toThrow();
  });
  it("compactación re-basa conservando el estado", () => {
    const log: TurnsEvent[] = [cfg()];
    for (let i = 0; i < TURNS_COMPACT_THRESHOLD; i++) log.push(ev("turn_advanced", {}));
    const before = replayTurns(null, log);
    const compacted = compactTurnsIfNeeded({ base: null, log });
    expect(compacted.log.length).toBeLessThan(log.length);
    expect(replayTurns(compacted.base, compacted.log)).toEqual(before);
  });
});
```

- [ ] **Step 5: Verificar que fallan**

Run: `fnm exec --using=22 -- npx.cmd vitest run src/lib/play/turns/reducer.test.ts`
Expected: FAIL — módulos inexistentes.

- [ ] **Step 6: Implementar `reducer.ts`**

```ts
import type { PlayEvent } from "@/lib/play/core/types";
import { TURNS_EVENT_TYPES, type TurnsEvent } from "./events";
import { aliveCount, nextAlive } from "./selectors";
import { initialTurnsState, type TurnsState } from "./types";

// Reducer PURO del tracker (spec turnos §1): valida y lanza ante payload
// inválido. La ronda sube AL ENVOLVER: con dir 1, cuando el índice nuevo es
// ≤ que el viejo entre vivos; con dir −1, simétrico.

export const TURNS_MAX_PLAYERS = 8;
export const TURNS_MAX_PHASES = 6;

function assertNames(names: readonly string[], min: number, max: number, what: string): void {
  if (names.length < min || names.length > max) {
    throw new Error(`${what} fuera de ${min}..${max}`);
  }
  const seen = new Set<string>();
  for (const name of names) {
    if (name.trim() === "" || name !== name.trim()) throw new Error(`${what}: vacío o sin recortar`);
    if (seen.has(name)) throw new Error(`${what}: duplicado`);
    seen.add(name);
  }
}

function requireStarted(s: TurnsState): number {
  if (s.active === null) throw new Error("sin configurar");
  return s.active;
}

function advanceOnce(s: TurnsState): TurnsState {
  const active = requireStarted(s);
  if (aliveCount(s) < 2) throw new Error("hacen falta 2 vivos");
  const next = nextAlive(s, active, s.direction);
  const wrapped = s.direction === 1 ? next <= active : next >= active;
  return { ...s, active: next, phase: 0, round: s.round + (wrapped ? 1 : 0) };
}

export function turnsReducer(state: TurnsState, event: TurnsEvent): TurnsState {
  switch (event.type) {
    case "turns_configured": {
      const { players, phases } = event.payload;
      assertNames(players, 2, TURNS_MAX_PLAYERS, "jugadores");
      assertNames(phases, 0, TURNS_MAX_PHASES, "fases");
      return {
        players: [...players],
        eliminated: [],
        phases: [...phases],
        active: 0,
        phase: 0,
        round: 1,
        direction: 1,
      };
    }
    case "turn_advanced":
      return advanceOnce(state);
    case "phase_advanced": {
      requireStarted(state);
      if (state.phases.length === 0) throw new Error("sin fases");
      if (state.phase >= state.phases.length - 1) throw new Error("ya en la última fase");
      return { ...state, phase: state.phase + 1 };
    }
    case "turn_skipped":
      return advanceOnce(advanceOnce(state));
    case "direction_toggled": {
      requireStarted(state);
      return { ...state, direction: state.direction === 1 ? -1 : 1 };
    }
    case "player_eliminated": {
      const active = requireStarted(state);
      const { name } = event.payload;
      if (!state.players.includes(name)) throw new Error("jugador inexistente");
      if (state.eliminated.includes(name)) throw new Error("ya eliminado");
      if (aliveCount(state) - 1 < 2) throw new Error("no pueden quedar menos de 2 vivos");
      // Si cae el activo, el turno pasa ANTES de marcarlo (spec §1).
      const s = state.players[active] === name ? advanceOnce(state) : state;
      return { ...s, eliminated: [...s.eliminated, name] };
    }
    case "player_restored": {
      requireStarted(state);
      const { name } = event.payload;
      if (!state.eliminated.includes(name)) throw new Error("no estaba eliminado");
      return { ...state, eliminated: state.eliminated.filter((n) => n !== name) };
    }
    case "turns_reset": {
      requireStarted(state);
      return {
        ...state,
        eliminated: [],
        active: null,
        phase: 0,
        round: 1,
        direction: 1,
      };
    }
    case "cleared":
      return initialTurnsState();
  }
}

function isTurnsEvent(event: PlayEvent): event is TurnsEvent {
  return (TURNS_EVENT_TYPES as ReadonlySet<string>).has(event.type);
}

export function replayTurns(base: TurnsState | null, log: PlayEvent[]): TurnsState {
  return log.reduce((state, event) => {
    if (!isTurnsEvent(event)) throw new Error(`evento desconocido: ${event.type}`);
    return turnsReducer(state, event);
  }, base ?? initialTurnsState());
}

export const TURNS_COMPACT_THRESHOLD = 200;
export const TURNS_COMPACT_KEEP = 20;

export function compactTurnsIfNeeded(input: { base: TurnsState | null; log: PlayEvent[] }): {
  base: TurnsState | null;
  log: PlayEvent[];
} {
  if (input.log.length <= TURNS_COMPACT_THRESHOLD) return input;
  const cut = input.log.length - TURNS_COMPACT_KEEP;
  return {
    base: replayTurns(input.base, input.log.slice(0, cut)),
    log: input.log.slice(cut),
  };
}
```

- [ ] **Step 7: Verificar que pasan**

Run: `fnm exec --using=22 -- npx.cmd vitest run src/lib/play/turns/reducer.test.ts` — Expected: PASS.

- [ ] **Step 8: `use-turns.ts`**

```ts
"use client";

import { useCallback } from "react";
import {
  useCompanionStore,
  type CompanionEmit,
} from "@/lib/play/core/use-companion-store";
import type { TurnsState } from "./types";
import type { TurnsEvent } from "./events";
import { compactTurnsIfNeeded, replayTurns, turnsReducer } from "./reducer";

/**
 * Store del acompañante «Turnos». Clave propia (`${identity}:turns`). Sin
 * feed; `clear` = evento cleared. Deshacer va expuesto en la UI: revertir un
 * avance accidental es EL caso de uso.
 */
export function useTurns(identity: string): {
  state: TurnsState;
  emit: CompanionEmit<TurnsEvent>;
  undo: () => void;
  canUndo: boolean;
  clear: () => void;
  loaded: boolean;
} {
  const store = useCompanionStore<TurnsState, TurnsEvent>({
    storageKey: `${identity}:turns`,
    replay: replayTurns,
    reducer: turnsReducer,
    compact: compactTurnsIfNeeded,
  });

  const { emit } = store;
  const clear = useCallback(() => {
    emit("cleared", {});
  }, [emit]);

  return { ...store, clear };
}
```

- [ ] **Step 9: Typecheck + commit**

Run: `fnm exec --using=22 -- npx.cmd tsc --noEmit` — Expected: sin errores.

```bash
git add src/lib/play/turns/types.ts src/lib/play/turns/events.ts src/lib/play/turns/selectors.ts src/lib/play/turns/reducer.ts src/lib/play/turns/reducer.test.ts src/lib/play/turns/use-turns.ts
git commit -m "feat(play): motor del tracker de turnos -- avance con eliminados, ronda envolvente y fases

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01G4eSiCCSCeeEzbYQK1mSS4"
```

---

### Task 2: Pantalla y setup — fichas y fases preset

**Files:**
- Create: `src/app/partidas/turnos/page.tsx`
- Create: `src/components/play/turns/turns-screen.tsx`
- Create: `src/components/play/turns/turns-setup.tsx`
- Modify: `messages/es.json` (namespace `play.turns`)

**Interfaces:**
- Consumes: `useTurns` (Task 1), `usePlayers`, `SEAT_ACCENT`, `buttonVariants`, `shuffle` de `@/lib/play/random/draws`.
- Produces: `TurnsScreen({ identity })`; en `turns-screen.tsx` queda el hueco `{/* juego: Task 3 */}` que Task 3 sustituye por `<TurnsGame …>`.

- [ ] **Step 1: Página (`page.tsx`)**

```tsx
import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { PlayFrame } from "@/components/play/play-frame";
import { TurnsScreen } from "@/components/play/turns/turns-screen";

export const metadata: Metadata = { title: "Turnos — Biblioshare" };

// Mismo boundary de petición que el resto de companions (#435): identidad de
// sesión fuera del prerender; anónimo funciona entero. key: remonta (#680).
async function Screen() {
  await connection();
  const identity = (await getCurrentUser())?.id ?? "anon";
  return <TurnsScreen key={identity} identity={identity} />;
}

export default function TurnsPage() {
  return (
    <PlayFrame>
      <Suspense fallback={null}>
        <Screen />
      </Suspense>
    </PlayFrame>
  );
}
```

- [ ] **Step 2: `turns-screen.tsx`**

```tsx
"use client";

import { useTranslations } from "next-intl";
import { useTurns } from "@/lib/play/turns/use-turns";
import { TurnsSetup } from "./turns-setup";

/**
 * Pantalla del acompañante «Turnos» (spec turnos §2): setup o juego según
 * haya turns_configured vigente. El juego entra en la tarea siguiente.
 */
export function TurnsScreen({ identity }: { identity: string }) {
  const t = useTranslations("play.turns");
  const turns = useTurns(identity);

  if (!turns.loaded) return null;

  return (
    <div>
      <h1 className="font-serif text-[26px] font-semibold">{t("title")}</h1>
      <p className="mt-1 text-[14px] text-muted-foreground">{t("subtitle")}</p>

      <div className="mt-5">
        {turns.state.active === null ? (
          <TurnsSetup identity={identity} state={turns.state} emit={turns.emit} />
        ) : null}
        {/* juego: Task 3 */}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `turns-setup.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { usePlayers } from "@/lib/play/core/use-players";
import { shuffle } from "@/lib/play/random/draws";
import type { CompanionEmit } from "@/lib/play/core/use-companion-store";
import type { TurnsEvent } from "@/lib/play/turns/events";
import type { TurnsState } from "@/lib/play/turns/types";
import { TURNS_MAX_PHASES, TURNS_MAX_PLAYERS } from "@/lib/play/turns/reducer";
import { SEAT_ACCENT } from "@/lib/play/ui/seats";

// Fases habituales de mesa: se ENCIENDEN en el orden en que se tocan. Solo
// español (única locale); un set custom entra por la píldora «+».
const PHASE_PRESETS = ["Mantenimiento", "Robar", "Acción", "Construir", "Combate", "Final"];

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase();
}

/**
 * Setup del tracker (spec turnos §2): cero inputs a la vista — jugadores como
 * fichas de asiento (el orden es el de alta; «Barajar» lo sortea) y fases como
 * píldoras preset que se encienden en orden de toque, con badge numérico. Los
 * dos únicos inputs viven tras fichas/píldoras «+». «Empezar» emite
 * turns_configured. Tras un reset, el estado conserva players/phases y este
 * formulario los precarga.
 */
export function TurnsSetup({
  identity,
  state,
  emit,
}: {
  identity: string;
  state: TurnsState;
  emit: CompanionEmit<TurnsEvent>;
}) {
  const t = useTranslations("play.turns");
  const { players: regulars } = usePlayers(identity);
  const [players, setPlayers] = useState<string[]>(state.players);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [phasesOn, setPhasesOn] = useState<string[]>(state.phases);
  const [phaseName, setPhaseName] = useState("");
  const [addingPhase, setAddingPhase] = useState(false);

  function addPlayer(candidate: string, fromInput = false) {
    const trimmed = candidate.trim();
    if (trimmed === "" || players.includes(trimmed) || players.length >= TURNS_MAX_PLAYERS) {
      return;
    }
    setPlayers([...players, trimmed]);
    // Solo el alta DESDE el input limpia y cierra (memoria visual-first).
    if (fromInput) {
      setName("");
      setAdding(false);
    }
  }

  function togglePhase(phase: string) {
    setPhasesOn(
      phasesOn.includes(phase)
        ? phasesOn.filter((p) => p !== phase)
        : phasesOn.length < TURNS_MAX_PHASES
          ? [...phasesOn, phase]
          : phasesOn,
    );
  }

  function addPhase(candidate: string) {
    const trimmed = candidate.trim();
    if (
      trimmed === "" ||
      phasesOn.includes(trimmed) ||
      phasesOn.length >= TURNS_MAX_PHASES
    ) {
      return;
    }
    setPhasesOn([...phasesOn, trimmed]);
    setPhaseName("");
    setAddingPhase(false);
  }

  const regularTokens = regulars.filter((r) => !players.includes(r.name)).slice(0, 6);
  const customPhases = phasesOn.filter((p) => !PHASE_PRESETS.includes(p));

  const pillClass = (selected: boolean) =>
    `rounded-chip border px-3 py-1.5 text-[13px] font-semibold ${
      selected ? "border-foreground bg-surface-muted" : "border-border"
    }`;

  return (
    <div>
      <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {t("players")}
      </p>
      <div className="mt-2 flex flex-wrap items-start gap-3">
        {players.map((p, i) => (
          <span key={p} className="flex w-14 flex-col items-center gap-1">
            <button
              type="button"
              aria-label={t("removeToken", { name: p })}
              title={p}
              onClick={() => setPlayers(players.filter((x) => x !== p))}
              className="flex h-11 w-11 select-none items-center justify-center rounded-full text-[14px] font-semibold text-surface"
              style={{ background: `var(${SEAT_ACCENT[i % SEAT_ACCENT.length].varName})` }}
            >
              {initials(p)}
            </button>
            <span className="max-w-full truncate text-[10px] text-muted-foreground">{p}</span>
          </span>
        ))}
        {regularTokens.map((r) => (
          <span key={r.playerId} className="flex w-14 flex-col items-center gap-1">
            <button
              type="button"
              onClick={() => addPlayer(r.name)}
              aria-label={r.name}
              title={r.name}
              className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed border-border text-[14px] font-semibold text-muted-foreground opacity-70"
            >
              {initials(r.name)}
            </button>
            <span className="max-w-full truncate text-[10px] text-muted-foreground">{r.name}</span>
          </span>
        ))}
        {players.length < TURNS_MAX_PLAYERS ? (
          <span className="flex w-14 flex-col items-center gap-1">
            <button
              type="button"
              aria-label={t("addPlayer")}
              aria-expanded={adding}
              aria-controls="turns-add-player"
              onClick={() => setAdding(!adding)}
              className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed border-border text-[18px] font-semibold text-muted-foreground"
            >
              +
            </button>
            <span className="text-[10px] text-muted-foreground">{t("addPlayer")}</span>
          </span>
        ) : null}
      </div>
      {adding ? (
        <div id="turns-add-player" className="mt-2 flex justify-center">
          <input
            autoFocus
            value={name}
            placeholder={t("namePlaceholder")}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addPlayer(name, true);
            }}
            aria-label={t("nameLabel")}
            className="w-48 rounded-md border border-border bg-surface px-2 py-1.5 text-[14px]"
          />
        </div>
      ) : null}
      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          disabled={players.length < 2}
          onClick={() => setPlayers(shuffle(players))}
          className="rounded-chip border border-border px-3 py-1.5 text-[13px] font-semibold disabled:opacity-40"
        >
          {t("shuffle")}
        </button>
        {players.length < 2 ? (
          <p className="text-[13px] text-muted-foreground">{t("playersHint")}</p>
        ) : null}
      </div>

      <p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {t("phases")}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {PHASE_PRESETS.map((phase) => {
          const idx = phasesOn.indexOf(phase);
          return (
            <button
              key={phase}
              type="button"
              aria-pressed={idx >= 0}
              onClick={() => togglePhase(phase)}
              className={pillClass(idx >= 0)}
            >
              {idx >= 0 ? `${idx + 1} · ${phase}` : phase}
            </button>
          );
        })}
        {customPhases.map((phase) => (
          <button
            key={phase}
            type="button"
            aria-pressed
            onClick={() => togglePhase(phase)}
            className={pillClass(true)}
          >
            {phasesOn.indexOf(phase) + 1} · {phase}
          </button>
        ))}
        {phasesOn.length < TURNS_MAX_PHASES ? (
          <button
            type="button"
            aria-label={t("addPhase")}
            aria-expanded={addingPhase}
            aria-controls="turns-add-phase"
            onClick={() => setAddingPhase(!addingPhase)}
            className={pillClass(false)}
          >
            +
          </button>
        ) : null}
      </div>
      {addingPhase ? (
        <div id="turns-add-phase" className="mt-2">
          <input
            autoFocus
            value={phaseName}
            placeholder={t("phasePlaceholder")}
            onChange={(e) => setPhaseName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addPhase(phaseName);
            }}
            aria-label={t("phaseLabel")}
            className="w-48 rounded-md border border-border bg-surface px-2 py-1.5 text-[14px]"
          />
        </div>
      ) : null}

      <button
        type="button"
        disabled={players.length < 2}
        onClick={() => emit("turns_configured", { players, phases: phasesOn })}
        className={buttonVariants("primary", "mt-5 w-full justify-center py-3 text-[15px]")}
      >
        {t("start")}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: i18n — namespace `play.turns`**

En `messages/es.json`, dentro de `play` (junto a `resources`), añadir:

```json
"turns": {
  "title": "Turnos",
  "subtitle": "Orden de turno, rondas y fases para cualquier juego.",
  "players": "Jugadores",
  "addPlayer": "Añadir jugador",
  "nameLabel": "Nombre del jugador",
  "namePlaceholder": "Añadir jugador…",
  "removeToken": "Quitar a {name}",
  "playersHint": "Añade entre 2 y 8 jugadores.",
  "shuffle": "Barajar",
  "phases": "Fases (opcional)",
  "addPhase": "Añadir fase",
  "phaseLabel": "Nombre de la fase",
  "phasePlaceholder": "Nombre de la fase…",
  "start": "Empezar",
  "round": "R{n}",
  "nextPhase": "Siguiente fase",
  "nextPlayer": "Siguiente jugador",
  "invert": "Invertir",
  "skip": "Saltar siguiente",
  "eliminateToken": "Eliminar a {name}",
  "restoreToken": "Restaurar a {name}",
  "eliminateConfirm": "¿Eliminar a {name}?",
  "cancel": "Cancelar",
  "undo": "Deshacer",
  "reset": "Reiniciar",
  "resetConfirm": "¿Seguro? Vuelve a la configuración"
}
```

- [ ] **Step 5: Verificar + commit**

Run: `fnm exec --using=22 -- npx.cmd tsc --noEmit` — Expected: sin errores.

```bash
git add src/app/partidas/turnos/page.tsx src/components/play/turns/turns-screen.tsx src/components/play/turns/turns-setup.tsx messages/es.json
git commit -m "feat(play): setup del tracker -- fichas de asiento, barajar y fases preset que se encienden en orden

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01G4eSiCCSCeeEzbYQK1mSS4"
```

---

### Task 3: Juego — `TurnRing`

**Files:**
- Create: `src/components/play/turns/turns-game.tsx`
- Modify: `src/components/play/turns/turns-screen.tsx` (montar el juego)

**Interfaces:**
- Consumes: `useTurns` (vía props state/emit/undo/canUndo), `nextAlive` no hace falta; `buzz`, `SEAT_ACCENT`, `aliveCount` de selectors.
- Produces: `TurnsGame({ state, emit, undo, canUndo })`.

- [ ] **Step 1: `turns-game.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { CompanionEmit } from "@/lib/play/core/use-companion-store";
import type { TurnsEvent } from "@/lib/play/turns/events";
import type { TurnsState } from "@/lib/play/turns/types";
import { aliveCount } from "@/lib/play/turns/selectors";
import { buzz } from "@/components/play/random/stage/stage-helpers";
import { SEAT_ACCENT } from "@/lib/play/ui/seats";

const RING = 280; // lado del contenedor en px
const RADIUS = 108; // radio de las fichas desde el centro

function initials(name: string): string {
  return name.trim().slice(0, 2).toUpperCase();
}

/**
 * Juego del tracker (spec turnos §2): anillo de fichas con la activa grande y
 * anillada, flecha de dirección, y el CENTRO como botón de avance (fase si
 * quedan; si no, jugador — buzz solo al cambiar de jugador). Tocar ficha viva
 * arma el confirm de eliminar; tocar eliminada restaura directo.
 */
export function TurnsGame({
  state,
  emit,
  undo,
  canUndo,
}: {
  state: TurnsState;
  emit: CompanionEmit<TurnsEvent>;
  undo: () => void;
  canUndo: boolean;
}) {
  const t = useTranslations("play.turns");
  const [pendingEliminate, setPendingEliminate] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const active = state.active as number;

  // buzz SOLO al cambiar de jugador (no de fase).
  const prevActive = useRef(active);
  useEffect(() => {
    if (prevActive.current !== active) {
      prevActive.current = active;
      buzz();
    }
  }, [active]);

  const hasPhases = state.phases.length > 0;
  const onLastPhase = !hasPhases || state.phase >= state.phases.length - 1;

  function advance() {
    if (hasPhases && !onLastPhase) emit("phase_advanced", {});
    else emit("turn_advanced", {});
    setPendingEliminate(null);
  }

  const n = state.players.length;

  return (
    <div>
      <div className="relative mx-auto" style={{ width: RING, height: RING }}>
        {state.players.map((p, i) => {
          const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
          const x = RING / 2 + RADIUS * Math.cos(angle);
          const y = RING / 2 + RADIUS * Math.sin(angle);
          const isActive = i === active;
          const eliminated = state.eliminated.includes(p);
          const size = isActive ? 56 : 44;
          return (
            <span
              key={p}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5"
              style={{ left: x, top: y }}
            >
              <button
                type="button"
                data-testid={`turn-token-${i}`}
                data-active={isActive}
                data-eliminated={eliminated}
                aria-label={
                  eliminated ? t("restoreToken", { name: p }) : t("eliminateToken", { name: p })
                }
                title={p}
                onClick={() => {
                  if (eliminated) {
                    emit("player_restored", { name: p });
                    setPendingEliminate(null);
                  } else {
                    setPendingEliminate(p);
                  }
                }}
                className={`flex select-none items-center justify-center rounded-full font-semibold text-surface transition-all ${
                  eliminated ? "opacity-35" : ""
                }`}
                style={{
                  width: size,
                  height: size,
                  fontSize: isActive ? 17 : 14,
                  background: `var(${SEAT_ACCENT[i % SEAT_ACCENT.length].varName})`,
                  boxShadow: isActive ? "0 0 0 3px var(--accent)" : undefined,
                }}
              >
                {initials(p)}
              </button>
              <span className="max-w-[64px] truncate text-[10px] text-muted-foreground">{p}</span>
            </span>
          );
        })}

        {/* Flecha de dirección, arriba y dentro del anillo. */}
        <svg
          viewBox="0 0 60 24"
          className="absolute left-1/2 top-[52px] h-6 w-14 -translate-x-1/2"
          aria-hidden="true"
          style={state.direction === -1 ? { transform: "translateX(-50%) scaleX(-1)" } : undefined}
        >
          <path
            d="M 8 18 Q 30 4 50 14"
            fill="none"
            stroke="var(--accent-ink)"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
          <polygon points="50,14 42,10 45,19" fill="var(--accent-ink)" />
        </svg>

        {/* El centro es el botón de avance. */}
        <button
          type="button"
          data-testid="turn-center"
          aria-label={hasPhases && !onLastPhase ? t("nextPhase") : t("nextPlayer")}
          onClick={advance}
          className="absolute left-1/2 top-1/2 flex h-24 w-24 -translate-x-1/2 -translate-y-1/2 select-none flex-col items-center justify-center rounded-full border-2 bg-surface-muted [touch-action:manipulation]"
          style={{ borderColor: "var(--accent)" }}
        >
          <span data-testid="turn-round" className="font-serif text-[26px] font-semibold leading-none">
            {t("round", { n: state.round })}
          </span>
          {hasPhases ? (
            <span className="max-w-[80px] truncate font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
              {state.phases[state.phase]}
            </span>
          ) : null}
        </button>
      </div>

      {hasPhases ? (
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          {state.phases.map((phase, i) => (
            <span
              key={phase}
              className={`rounded-chip border px-3 py-1 text-[12px] ${
                i === state.phase
                  ? "border-foreground bg-surface-muted font-semibold"
                  : "border-border text-muted-foreground"
              }`}
            >
              {phase}
            </span>
          ))}
        </div>
      ) : null}

      {pendingEliminate ? (
        <div className="mt-3 flex items-center justify-center gap-3">
          <button
            type="button"
            disabled={aliveCount(state) <= 2}
            onClick={() => {
              emit("player_eliminated", { name: pendingEliminate });
              setPendingEliminate(null);
            }}
            className="p-2 text-[13px] font-semibold text-play-danger underline disabled:opacity-40"
          >
            {t("eliminateConfirm", { name: pendingEliminate })}
          </button>
          <button
            type="button"
            onClick={() => setPendingEliminate(null)}
            className="p-2 text-[13px] text-muted-foreground underline"
          >
            {t("cancel")}
          </button>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => emit("direction_toggled", {})}
          className="rounded-chip border border-border px-3 py-1.5 text-[13px] font-semibold"
        >
          {t("invert")}
        </button>
        <button
          type="button"
          onClick={() => emit("turn_skipped", {})}
          className="rounded-chip border border-border px-3 py-1.5 text-[13px] font-semibold"
        >
          {t("skip")}
        </button>
        <button
          type="button"
          onClick={undo}
          disabled={!canUndo}
          className="-my-2 p-2 text-[12px] text-muted-foreground underline disabled:opacity-40"
        >
          {t("undo")}
        </button>
        {confirmReset ? (
          <button
            type="button"
            onClick={() => {
              emit("turns_reset", {});
              setConfirmReset(false);
            }}
            className="-my-2 p-2 text-[12px] text-play-danger underline"
          >
            {t("resetConfirm")}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            className="-my-2 p-2 text-[12px] text-muted-foreground underline"
          >
            {t("reset")}
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Montar en `turns-screen.tsx`**

Añadir `import { TurnsGame } from "./turns-game";` y sustituir `{/* juego: Task 3 */}` por:

```tsx
        {turns.state.active !== null ? (
          <TurnsGame
            state={turns.state}
            emit={turns.emit}
            undo={turns.undo}
            canUndo={turns.canUndo}
          />
        ) : null}
```

- [ ] **Step 3: Verificar + commit**

Run: `fnm exec --using=22 -- npx.cmd tsc --noEmit` — Expected: sin errores.

```bash
git add src/components/play/turns/turns-game.tsx src/components/play/turns/turns-screen.tsx
git commit -m "feat(play): TurnRing -- anillo de fichas con el centro como boton de avance, flecha de direccion y confirm de eliminar

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01G4eSiCCSCeeEzbYQK1mSS4"
```

---

### Task 4: Hub + e2e + verificación completa

**Files:**
- Create: `src/components/play/marks/turns-table-mark.tsx`
- Modify: `src/components/play/tool-grid.tsx` (tarjeta tras la de Recursos)
- Modify: `messages/es.json` (`play.tools.turns.name`)
- Test: `e2e/partidas-turnos.spec.ts`

**Interfaces:**
- Consumes: `SEAT_ACCENT`.
- Produces: nada nuevo.

- [ ] **Step 1: `turns-table-mark.tsx`**

```tsx
import { SEAT_ACCENT } from "@/lib/play/ui/seats";

/**
 * La marca de Turnos es la mesa vista desde arriba: cuatro asientos en anillo
 * con el activo mayor y una flecha de rotación en --accent-ink. Sin texto ni
 * <title>: la etiqueta la pone la tarjeta que lo envuelve.
 */
export function TurnsTableMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      <ellipse cx="32" cy="54" rx="24" ry="5" fill="var(--play-felt)" />
      {/* Los cuatro asientos: el de arriba, activo y mayor. */}
      <circle cx="32" cy="14" r="9" fill={`var(${SEAT_ACCENT[0].varName})`} />
      <circle cx="52" cy="32" r="6" fill={`var(${SEAT_ACCENT[1].varName})`} />
      <circle cx="32" cy="48" r="6" fill={`var(${SEAT_ACCENT[2].varName})`} />
      <circle cx="12" cy="32" r="6" fill={`var(${SEAT_ACCENT[3].varName})`} />
      {/* Flecha de rotación entre asientos. */}
      <path
        d="M 44 18 A 17 17 0 0 1 49 26"
        fill="none"
        stroke="var(--accent-ink)"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <polygon points="50,29 44,25 51,22" fill="var(--accent-ink)" />
    </svg>
  );
}
```

- [ ] **Step 2: Tarjeta en `tool-grid.tsx`**

Añadir el import `import { TurnsTableMark } from "./marks/turns-table-mark";` y, ENTRE la
tarjeta de Recursos y la de «más herramientas», insertar:

```tsx
      {/* Turnos: cuarto acompañante sin partida — tarjeta estática. */}
      <li>
        <Link
          href="/partidas/turnos"
          className="flex flex-col items-center gap-3 rounded-card border border-border bg-surface p-4 transition-colors hover:bg-surface-muted"
        >
          <TurnsTableMark className="h-16 w-16" />
          <span className="text-center font-serif text-[15px] font-semibold">
            {t("tools.turns.name")}
          </span>
        </Link>
      </li>
```

- [ ] **Step 3: i18n de la tarjeta**

En `messages/es.json`, dentro de `play.tools` (tras `resources`), añadir:

```json
"turns": { "name": "Turnos" }
```

- [ ] **Step 4: e2e `e2e/partidas-turnos.spec.ts`**

```ts
import { test, expect } from "@playwright/test";

// Acompañante «Turnos». Anónimo, IDB propio (clave :turns). Viewport móvil.
test.use({ viewport: { width: 390, height: 844 } });

test("configurar, avanzar fases y turnos, invertir, eliminar, recargar y deshacer", async ({
  page,
}) => {
  await page.goto("/partidas/turnos");
  await expect(page.getByRole("heading", { name: "Turnos" })).toBeVisible();

  // Fichas: la ficha «+» abre el input; Enter añade y cierra.
  for (const name of ["Ana", "Beto", "Carla"]) {
    await page.getByRole("button", { name: "Añadir jugador" }).click();
    await page.getByLabel("Nombre del jugador").fill(name);
    await page.getByLabel("Nombre del jugador").press("Enter");
  }
  // Fases preset: se encienden en orden de toque.
  await page.getByRole("button", { name: "Mantenimiento" }).click();
  await page.getByRole("button", { name: /Acción/ }).click();
  await page.getByRole("button", { name: /^empezar$/i }).click();

  // Ana activa; el centro avanza FASE primero y luego JUGADOR.
  await expect(page.getByTestId("turn-token-0")).toHaveAttribute("data-active", "true");
  await expect(page.getByTestId("turn-center")).toHaveAccessibleName("Siguiente fase");
  await page.getByTestId("turn-center").click(); // a Acción
  await expect(page.getByTestId("turn-center")).toHaveAccessibleName("Siguiente jugador");
  await page.getByTestId("turn-center").click(); // a Beto
  await expect(page.getByTestId("turn-token-1")).toHaveAttribute("data-active", "true");
  await expect(page.getByTestId("turn-round")).toHaveText("R1");

  // Invertir: el avance va hacia atrás (Beto → Ana) SIN envolver (la vuelta
  // no se completa retrocediendo hacia el asiento 0).
  await page.getByRole("button", { name: /^invertir$/i }).click();
  await page.getByTestId("turn-center").click(); // fase
  await page.getByTestId("turn-center").click(); // jugador, hacia atrás
  await expect(page.getByTestId("turn-token-0")).toHaveAttribute("data-active", "true");
  await expect(page.getByTestId("turn-round")).toHaveText("R1");

  // Otro avance (Ana → Carla hacia atrás) SÍ envuelve → R2.
  await page.getByTestId("turn-center").click(); // fase
  await page.getByTestId("turn-center").click(); // jugador
  await expect(page.getByTestId("turn-token-2")).toHaveAttribute("data-active", "true");
  await expect(page.getByTestId("turn-round")).toHaveText("R2");

  // Eliminar a Beto (no activo) con confirm; el anillo lo atenúa.
  await page.getByTestId("turn-token-1").click();
  await page.getByRole("button", { name: "¿Eliminar a Beto?" }).click();
  await expect(page.getByTestId("turn-token-1")).toHaveAttribute("data-eliminated", "true");

  // Recarga conserva activo, ronda y eliminado.
  await page.reload();
  await expect(page.getByTestId("turn-token-2")).toHaveAttribute("data-active", "true");
  await expect(page.getByTestId("turn-round")).toHaveText("R2");
  await expect(page.getByTestId("turn-token-1")).toHaveAttribute("data-eliminated", "true");

  // Deshacer revierte la eliminación.
  await page.getByRole("button", { name: /^deshacer$/i }).click();
  await expect(page.getByTestId("turn-token-1")).toHaveAttribute("data-eliminated", "false");
});

test("la tarjeta del hub navega a turnos", async ({ page }) => {
  await page.goto("/partidas");
  await page.getByRole("link", { name: "Turnos", exact: true }).click();
  await expect(page).toHaveURL(/\/partidas\/turnos$/);
  await expect(page.getByRole("heading", { name: "Turnos" })).toBeVisible();
});
```

- [ ] **Step 5: Verificación completa**

Run (en orden):
1. `fnm exec --using=22 -- npx.cmd tsc --noEmit` — Expected: sin errores.
2. `fnm exec --using=22 -- npx.cmd vitest run src/lib/play` — Expected: PASS todo.
3. `fnm exec --using=22 -- npm.cmd run test:e2e -- partidas-turnos.spec.ts` — Expected: 2/2 PASS.
4. `fnm exec --using=22 -- npm.cmd run test:e2e -- partidas-reloj.spec.ts partidas-recursos.spec.ts partidas-aleatorio.spec.ts` — Expected: 3/3 + 2/2 + 5/5 PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/play/marks/turns-table-mark.tsx src/components/play/tool-grid.tsx messages/es.json e2e/partidas-turnos.spec.ts
git commit -m "feat(play): tarjeta de Turnos en el hub, marca de mesa con flecha y e2e del acompanante

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01G4eSiCCSCeeEzbYQK1mSS4"
```
