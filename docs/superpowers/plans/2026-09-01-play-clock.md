# Reloj de partida — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Segundo acompañante de BiblioPlay: reloj de ajedrez por jugador (con incremento Fischer) y cuenta atrás compartida, en `/partidas/reloj`, persistente y crash-safe.

**Architecture:** Event-sourcing con timestamps: el reducer «liquida» el tiempo transcurrido entre eventos usando `event.at` y el tick de pantalla es solo UI (`remainingAt(state, now)`). El hook `use-companion` del Aleatorio se generaliza a `useCompanionStore` en core (Aleatorio migra con su clave vieja; el reloj usa `` `${identity}:clock` ``). UI con zonas grandes tocables por jugador y aro SVG para la cuenta atrás.

**Tech Stack:** React 19, IDB (almacén `companion` existente), next-intl, Vitest, Playwright.

## Global Constraints

- Rama nueva `feat/play-clock` desde `main` (la crea el controlador antes de la Task 1; commits directos en ella).
- Motor puro: nada de `Date.now()`/`Math.random()` en `src/lib/play/clock/` — el `at` viene inyectado.
- El Aleatorio NO cambia de comportamiento: su suite unit y sus 5 e2e deben pasar sin tocar los specs.
- Validación estricta: payload inválido o `at` anterior al `lastEventAt` vigente → el reducer lanza.
- Rangos: jugadores 2..6, `initialMs` 10_000..7_200_000, `incrementMs` 0..60_000, `durationMs` 5_000..7_200_000.
- UN primario por vista (`buttonVariants("primary")`): «Empezar» en setup de ajedrez; el CTA de estado en cuenta atrás.
- Sin sonido; `buzz()` (vibración) al caer bandera y al llegar la cuenta atrás a 0.
- Solo tokens existentes (`--play-seat-N` vía `SEAT_ACCENT[i].varName`, `--play-danger`, `--surface-muted`…).
- Unit: `fnm exec --using=22 -- npx.cmd vitest run <path>` (Node 20 del shell rompe vitest).
- e2e: `fnm exec --using=22 -- npm.cmd run test:e2e -- <spec>` (reutiliza dev server del 3000; NO arrancar otro).
- `git add` con rutas explícitas, nunca `-A` ni `.`.
- Trailers de commit:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01G4eSiCCSCeeEzbYQK1mSS4`

---

### Task 1: `useCompanionStore` genérico + migración del Aleatorio

**Files:**
- Create: `src/lib/play/core/use-companion-store.ts`
- Modify: `src/lib/play/random/use-companion.ts` (pasa a envoltorio fino)

**Interfaces:**
- Consumes: `readCompanion`/`writeCompanion`/`deleteCompanion`/`CompanionRecord` de `core/db`, `makeEvent` de `core/events`.
- Produces: `useCompanionStore<S, E>(opts)` con `opts = { storageKey, replay, reducer, compact, feed?, feedMax? }` devolviendo `{ state, feed, emit, undo, canUndo, loaded }`. `useCompanion(identity)` del Aleatorio conserva EXACTAMENTE su firma actual (con `clear`). Task 3 crea el wrapper del reloj sobre esto.

- [ ] **Step 1: Crear `use-companion-store.ts`**

Contenido completo (es el `use-companion.ts` actual generalizado — misma mecánica: replay validado al cargar, validación pre-commit, compactación, CAS con adopción, snapRef síncrono):

```ts
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { makeEvent } from "./events";
import type { PlayEvent } from "./types";
import {
  deleteCompanion,
  readCompanion,
  writeCompanion,
  type CompanionRecord,
} from "./db";

type Snapshot<S> = { base: S | null; log: PlayEvent[]; rev: number };

// Tipo público de `emit`. Ver el comentario junto a la implementación sobre
// por qué se castea al devolver en vez de dejar que TS la relacione.
export type CompanionEmit<E extends PlayEvent> = <T extends E["type"]>(
  type: T,
  payload: Extract<E, { type: T }>["payload"],
) => boolean;

/**
 * Store genérico de acompañante (generalización del hook del Aleatorio, spec
 * reloj §1): carga de IDB con replay validado (registro corrupto se descarta),
 * dispatch con validación del reducer, compactación al pasar el umbral y
 * persistencia CAS. Sin IDB (privado, cuota) se sigue en memoria. En conflicto
 * CAS (otra pestaña) se ADOPTA el registro vigente. `storageKey` es la clave
 * del almacén `companion` (su keyPath se llama `identity` por herencia del
 * Aleatorio, que usa la identidad a secas; el reloj usa `${identity}:clock`).
 */
export function useCompanionStore<S, E extends PlayEvent>(opts: {
  storageKey: string;
  replay: (base: S | null, log: PlayEvent[]) => S;
  reducer: (state: S, event: E) => S;
  compact: (input: { base: S | null; log: PlayEvent[] }) => { base: S | null; log: PlayEvent[] };
  feed?: (log: PlayEvent[], max: number) => E[];
  feedMax?: number;
}): {
  state: S;
  feed: E[];
  emit: CompanionEmit<E>;
  undo: () => void;
  canUndo: boolean;
  loaded: boolean;
} {
  const { storageKey, replay, reducer, compact, feed: feedFn, feedMax = 20 } = opts;
  const [snapshot, setSnapshot] = useState<Snapshot<S>>({ base: null, log: [], rev: 0 });
  const [loaded, setLoaded] = useState(false);
  // Rev vivo para la cadena de escrituras: los setState son asíncronos y dos
  // emits seguidos no pueden partir del mismo rev. Mutar el ref EN el efecto
  // (patrón documentado de React) evita el error de lint `react-hooks/refs`.
  const snapRef = useRef(snapshot);
  useEffect(() => {
    snapRef.current = snapshot;
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const record = await readCompanion(storageKey);
      if (cancelled) return;
      if (record) {
        try {
          // Validación por replay: si el registro no re-juega, está roto
          // también para la UI — se borra y se arranca de cero.
          replay((record.base as S | null) ?? null, record.log);
          setSnapshot({
            base: (record.base as S | null) ?? null,
            log: record.log,
            rev: record.rev,
          });
        } catch {
          await deleteCompanion(storageKey);
        }
      }
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
    // replay es estable por módulo; la clave es lo único que re-carga.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const state = useMemo(
    () => replay(snapshot.base, snapshot.log),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapshot.base, snapshot.log],
  );

  const persist = useCallback(
    async (next: Snapshot<S>) => {
      const record: CompanionRecord = {
        identity: storageKey,
        v: 1,
        base: next.base,
        log: next.log,
        rev: next.rev,
      };
      const result = await writeCompanion(record);
      if (!result.ok && result.reason === "conflict") {
        // Otra pestaña escribió antes: se adopta su registro si re-juega.
        try {
          replay((result.current.base as S | null) ?? null, result.current.log);
          setSnapshot({
            base: (result.current.base as S | null) ?? null,
            log: result.current.log,
            rev: result.current.rev,
          });
        } catch {
          // vigente corrupto: nos quedamos con lo nuestro en memoria
        }
      }
      // "unavailable": memoria y a seguir.
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storageKey],
  );

  const commit = useCallback(
    (log: PlayEvent[]) => {
      const current = snapRef.current;
      const compacted = compact({ base: current.base, log });
      const next: Snapshot<S> = { ...compacted, rev: current.rev + 1 };
      // Síncrono a propósito: un segundo emit/undo en el MISMO tick debe ver
      // este commit (si no, dos commits compartirían rev y el CAS perdería
      // uno en silencio).
      snapRef.current = next;
      setSnapshot(next);
      void persist(next);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [persist],
  );

  // Firma propia (no `CompanionEmit`) para que TS compruebe el CUERPO con el
  // `T` real de cada llamada; el cast va al devolver — dos firmas genéricas
  // que distribuyen `Extract` por caminos independientes no las relaciona el
  // checker aunque sean equivalentes (límite conocido de TS).
  const emit = useCallback(
    <T extends E["type"]>(type: T, payload: Extract<E, { type: T }>["payload"]): boolean => {
      const current = snapRef.current;
      const event = makeEvent(type, payload, Date.now()) as unknown as E;
      try {
        // Validación ANTES de comprometer: el reducer lanza ante payload inválido.
        reducer(replay(current.base, current.log), event);
      } catch {
        return false;
      }
      commit([...current.log, event]);
      return true;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [commit],
  );

  const undo = useCallback(() => {
    const current = snapRef.current;
    if (current.log.length === 0) return;
    commit(current.log.slice(0, -1));
  }, [commit]);

  const feed = useMemo(
    () => (feedFn ? feedFn(snapshot.log, feedMax) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapshot.log],
  );

  return {
    state,
    feed,
    emit: emit as CompanionEmit<E>,
    undo,
    canUndo: snapshot.log.length > 0,
    loaded,
  };
}
```

- [ ] **Step 2: `random/use-companion.ts` pasa a envoltorio**

Contenido completo del fichero:

```ts
"use client";

import { useCallback } from "react";
import {
  useCompanionStore,
  type CompanionEmit,
} from "@/lib/play/core/use-companion-store";
import type { RandomState } from "./types";
import type { RandomEvent } from "./events";
import { compactIfNeeded, randomReducer, replayRandom } from "./reducer";
import { resultFeed } from "./selectors";

const FEED_MAX = 20;

/**
 * Estado del acompañante «Aleatorio» sobre el store genérico de core (spec
 * reloj §1). Conserva la clave HISTÓRICA (`identity` a secas) — sin migración
 * de datos — y añade `clear` (evento `cleared`) sobre la interfaz común.
 */
export function useCompanion(identity: string): {
  state: RandomState;
  feed: RandomEvent[];
  emit: CompanionEmit<RandomEvent>;
  undo: () => void;
  canUndo: boolean;
  clear: () => void;
  loaded: boolean;
} {
  const store = useCompanionStore<RandomState, RandomEvent>({
    storageKey: identity,
    replay: replayRandom,
    reducer: randomReducer,
    compact: compactIfNeeded,
    feed: resultFeed,
    feedMax: FEED_MAX,
  });

  const { emit } = store;
  const clear = useCallback(() => {
    emit("cleared", {});
  }, [emit]);

  return { ...store, clear };
}
```

- [ ] **Step 3: Verificar — el Aleatorio no cambia de comportamiento**

Run (en orden):
1. `fnm exec --using=22 -- npx.cmd tsc --noEmit` — Expected: sin errores.
2. `fnm exec --using=22 -- npx.cmd vitest run src/lib/play/random src/components/play/random` — Expected: PASS todo, sin tocar ningún test.
3. `fnm exec --using=22 -- npm.cmd run test:e2e -- partidas-aleatorio.spec.ts` — Expected: 5/5 PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/play/core/use-companion-store.ts src/lib/play/random/use-companion.ts
git commit -m "refactor(play): useCompanionStore generico en core -- el Aleatorio migra conservando su clave

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01G4eSiCCSCeeEzbYQK1mSS4"
```

---

### Task 2: Motor del reloj — tipos, eventos y reducer (TDD)

**Files:**
- Create: `src/lib/play/clock/types.ts`
- Create: `src/lib/play/clock/events.ts`
- Create: `src/lib/play/clock/reducer.ts`
- Test: `src/lib/play/clock/reducer.test.ts`

**Interfaces:**
- Consumes: `PlayEvent`/`makeEvent` de core.
- Produces: `ClockState`, `ClockPlayer`, `initialClockState()`, `ClockEvent` (unión de 8 eventos), `CLOCK_EVENT_TYPES`, `clockReducer(state, event)`, `replayClock(base, log)`, `compactClockIfNeeded(input)`, y las constantes de rango exportadas (`CLOCK_INITIAL_MS_MIN/MAX`, `CLOCK_INCREMENT_MS_MAX`, `CLOCK_DURATION_MS_MIN/MAX`, `CLOCK_MAX_PLAYERS`). Tasks 3-5 los consumen.

- [ ] **Step 1: `types.ts`**

```ts
// Estado del acompañante «Reloj» (spec reloj §1). Los bancos están liquidados
// hasta lastEventAt: lo que falta hasta «ahora» lo añade el selector
// remainingAt — el reducer jamás mira el reloj del sistema.
export type ClockPlayer = { name: string; bankMs: number; flagged: boolean };

export type ClockState = {
  mode: "chess" | "countdown" | null; // null = sin configurar
  players: ClockPlayer[];
  active: number | null;
  incrementMs: number;
  initialMs: number;
  durationMs: number;
  countdownLeftMs: number;
  countdownRunning: boolean;
  paused: boolean;
  lastEventAt: number;
};

export function initialClockState(): ClockState {
  return {
    mode: null,
    players: [],
    active: null,
    incrementMs: 0,
    initialMs: 300_000,
    durationMs: 60_000,
    countdownLeftMs: 60_000,
    countdownRunning: false,
    paused: false,
    lastEventAt: 0,
  };
}
```

- [ ] **Step 2: `events.ts`**

```ts
import type { PlayEvent } from "@/lib/play/core/types";

// Eventos del reloj (spec reloj §1). Todos llevan su timestamp en `at` y el
// reducer liquida el tiempo transcurrido entre eventos — por eso el orden
// temporal importa y un log con `at` hacia atrás es corrupto.
export type ChessConfiguredEvent = PlayEvent<
  "chess_configured",
  { players: string[]; initialMs: number; incrementMs: number }
>;
export type CountdownConfiguredEvent = PlayEvent<"countdown_configured", { durationMs: number }>;
export type TurnPassedEvent = PlayEvent<"turn_passed", Record<string, never>>;
export type ClockPausedEvent = PlayEvent<"clock_paused", Record<string, never>>;
export type ClockResumedEvent = PlayEvent<"clock_resumed", Record<string, never>>;
export type CountdownStartedEvent = PlayEvent<"countdown_started", Record<string, never>>;
export type CountdownResetEvent = PlayEvent<"countdown_reset", Record<string, never>>;
export type ClockResetEvent = PlayEvent<"clock_reset", Record<string, never>>;

export type ClockEvent =
  | ChessConfiguredEvent
  | CountdownConfiguredEvent
  | TurnPassedEvent
  | ClockPausedEvent
  | ClockResumedEvent
  | CountdownStartedEvent
  | CountdownResetEvent
  | ClockResetEvent;

// Mismo patrón anti-olvido que RANDOM_EVENT_TYPE_MAP (random/events.ts).
const CLOCK_EVENT_TYPE_MAP = {
  chess_configured: true,
  countdown_configured: true,
  turn_passed: true,
  clock_paused: true,
  clock_resumed: true,
  countdown_started: true,
  countdown_reset: true,
  clock_reset: true,
} satisfies Record<ClockEvent["type"], true>;

export const CLOCK_EVENT_TYPES: ReadonlySet<ClockEvent["type"]> = new Set(
  Object.keys(CLOCK_EVENT_TYPE_MAP) as ClockEvent["type"][],
);
```

- [ ] **Step 3: Tests que fallan (`reducer.test.ts`)**

Fichero completo:

```ts
import { describe, expect, it } from "vitest";
import { makeEvent } from "@/lib/play/core/events";
import type { PlayEvent } from "@/lib/play/core/types";
import { initialClockState, type ClockState } from "./types";
import type { ClockEvent } from "./events";
import {
  clockReducer,
  compactClockIfNeeded,
  replayClock,
  CLOCK_COMPACT_THRESHOLD,
} from "./reducer";

const ev = <T extends ClockEvent["type"]>(
  type: T,
  at: number,
  payload: Extract<ClockEvent, { type: T }>["payload"],
) => makeEvent(type, payload, at) as ClockEvent;

const chess = (at: number, players = ["Ana", "Beto"], initialMs = 60_000, incrementMs = 0) =>
  ev("chess_configured", at, { players, initialMs, incrementMs });

function run(events: ClockEvent[], base: ClockState | null = null): ClockState {
  return events.reduce(clockReducer, base ?? initialClockState());
}

describe("chess_configured", () => {
  it("configura bancos, activo 0 y sin pausa", () => {
    const s = run([chess(1000)]);
    expect(s.mode).toBe("chess");
    expect(s.players).toEqual([
      { name: "Ana", bankMs: 60_000, flagged: false },
      { name: "Beto", bankMs: 60_000, flagged: false },
    ]);
    expect(s.active).toBe(0);
    expect(s.paused).toBe(false);
    expect(s.lastEventAt).toBe(1000);
  });
  it("rechaza jugadores y rangos inválidos", () => {
    const s = initialClockState();
    expect(() => clockReducer(s, chess(1000, ["Ana"]))).toThrow();
    expect(() => clockReducer(s, chess(1000, ["Ana", "Ana"]))).toThrow();
    expect(() => clockReducer(s, chess(1000, ["Ana", " "]))).toThrow();
    expect(() =>
      clockReducer(s, chess(1000, ["a", "b", "c", "d", "e", "f", "g"])),
    ).toThrow();
    expect(() => clockReducer(s, chess(1000, ["Ana", "Beto"], 5_000))).toThrow();
    expect(() => clockReducer(s, chess(1000, ["Ana", "Beto"], 60_000, 61_000))).toThrow();
    expect(() => clockReducer(s, chess(1000, ["Ana", "Beto"], 60_000, -1))).toThrow();
  });
});

describe("turn_passed — liquidación y Fischer", () => {
  it("cobra al activo y pasa al siguiente (circular)", () => {
    const s = run([chess(1000), ev("turn_passed", 11_000, {})]);
    expect(s.players[0].bankMs).toBe(50_000); // 10 s cobrados a Ana
    expect(s.players[1].bankMs).toBe(60_000);
    expect(s.active).toBe(1);
    const s2 = clockReducer(s, ev("turn_passed", 16_000, {}));
    expect(s2.players[1].bankMs).toBe(55_000);
    expect(s2.active).toBe(0); // circular
  });
  it("suma el incremento al que acaba de mover, también en negativo", () => {
    const s = run([chess(1000, ["Ana", "Beto"], 10_000, 5_000), ev("turn_passed", 26_000, {})]);
    // Ana gastó 25 s de 10 s: banco -15 s, +5 s de Fischer = -10 s, bandera puesta.
    expect(s.players[0].bankMs).toBe(-10_000);
    expect(s.players[0].flagged).toBe(true);
    expect(s.active).toBe(1);
  });
  it("inválido sin configurar o en pausa", () => {
    expect(() => clockReducer(initialClockState(), ev("turn_passed", 1000, {}))).toThrow();
    const paused = run([chess(1000), ev("clock_paused", 2000, {})]);
    expect(() => clockReducer(paused, ev("turn_passed", 3000, {}))).toThrow();
  });
});

describe("pausa y reanudación", () => {
  it("la pausa liquida y el intervalo pausado no se cobra", () => {
    const s = run([
      chess(1000),
      ev("clock_paused", 11_000, {}),   // Ana: 50 s
      ev("clock_resumed", 61_000, {}),  // 50 s de pausa: gratis
      ev("turn_passed", 66_000, {}),    // 5 s más de Ana
    ]);
    expect(s.players[0].bankMs).toBe(45_000);
    expect(s.paused).toBe(false);
  });
  it("pausar en pausa o reanudar sin pausa lanzan", () => {
    const paused = run([chess(1000), ev("clock_paused", 2000, {})]);
    expect(() => clockReducer(paused, ev("clock_paused", 3000, {}))).toThrow();
    const running = run([chess(1000)]);
    expect(() => clockReducer(running, ev("clock_resumed", 2000, {}))).toThrow();
  });
});

describe("bandera", () => {
  it("cruza una vez y no se desfija aunque el banco vuelva a positivo", () => {
    const s = run([
      chess(1000, ["Ana", "Beto"], 10_000, 60_000),
      ev("turn_passed", 12_000, {}), // Ana ok: 8 s + 60 s
      ev("turn_passed", 23_000, {}), // Beto gastó 11 s de 10: bandera, -1+60=59 s
    ]);
    expect(s.players[1].flagged).toBe(true);
    expect(s.players[1].bankMs).toBe(59_000);
    const s2 = clockReducer(s, ev("turn_passed", 24_000, {}));
    expect(s2.players[1].flagged).toBe(true); // persiste
  });
});

describe("cuenta atrás", () => {
  it("configura, arranca, liquida a 0 y no baja de ahí", () => {
    const s = run([
      ev("countdown_configured", 1000, { durationMs: 5_000 }),
      ev("countdown_started", 2000, {}),
      ev("clock_paused", 4000, {}), // 2 s consumidos, quedan 3 s
    ]);
    expect(s.countdownLeftMs).toBe(3_000);
    const done = run([
      ev("countdown_configured", 1000, { durationMs: 5_000 }),
      ev("countdown_started", 2000, {}),
      ev("countdown_reset", 60_000, {}), // llegó a 0 mucho antes: liquida a 0, luego recarga
    ]);
    expect(done.countdownLeftMs).toBe(5_000);
    expect(done.countdownRunning).toBe(false);
  });
  it("pausar una cuenta agotada lanza y arrancar de nuevo recarga primero", () => {
    const base = run([
      ev("countdown_configured", 1000, { durationMs: 5_000 }),
      ev("countdown_started", 2000, {}),
    ]);
    // A las 7.5 s la liquidación la deja en 0 y parada: pausar lanza.
    expect(() => clockReducer(base, ev("clock_paused", 7_500, {}))).toThrow();
    // Reset + start tras agotarse recarga a la duración completa.
    const restarted = clockReducer(
      clockReducer(base, ev("countdown_reset", 8_000, {})),
      ev("countdown_started", 9_000, {}),
    );
    expect(restarted.countdownRunning).toBe(true);
    expect(restarted.countdownLeftMs).toBe(5_000);
  });
  it("rechaza duraciones fuera de rango", () => {
    const s = initialClockState();
    expect(() =>
      clockReducer(s, ev("countdown_configured", 1000, { durationMs: 1_000 })),
    ).toThrow();
    expect(() =>
      clockReducer(s, ev("countdown_configured", 1000, { durationMs: 8_000_000 })),
    ).toThrow();
  });
});

describe("clock_reset", () => {
  it("vuelve a sin-configurar conservando la config para precargar", () => {
    const s = run([
      chess(1000, ["Ana", "Beto"], 60_000, 5_000),
      ev("turn_passed", 11_000, {}),
      ev("clock_reset", 20_000, {}),
    ]);
    expect(s.mode).toBeNull();
    expect(s.active).toBeNull();
    expect(s.players).toEqual([
      { name: "Ana", bankMs: 60_000, flagged: false },
      { name: "Beto", bankMs: 60_000, flagged: false },
    ]);
    expect(s.initialMs).toBe(60_000);
    expect(s.incrementMs).toBe(5_000);
  });
  it("sin modo configurado lanza", () => {
    expect(() => clockReducer(initialClockState(), ev("clock_reset", 1000, {}))).toThrow();
  });
});

describe("monotonía y replay", () => {
  it("un at hacia atrás lanza (log corrupto)", () => {
    const s = run([chess(1000)]);
    expect(() => clockReducer(s, ev("turn_passed", 999, {}))).toThrow();
  });
  it("replayClock rechaza eventos desconocidos", () => {
    const alien = makeEvent("dice_rolled", { count: 1, sides: 6, results: [3] }, 1000) as PlayEvent;
    expect(() => replayClock(null, [alien])).toThrow();
  });
});

describe("compactación", () => {
  it("re-basa conservando los bancos liquidados", () => {
    const log: ClockEvent[] = [chess(1000)];
    for (let i = 0; i < CLOCK_COMPACT_THRESHOLD; i++) {
      log.push(ev("turn_passed", 2000 + i * 1000, {}));
    }
    const before = replayClock(null, log);
    const compacted = compactClockIfNeeded({ base: null, log });
    expect(compacted.log.length).toBeLessThan(log.length);
    expect(replayClock(compacted.base, compacted.log)).toEqual(before);
  });
});
```

- [ ] **Step 4: Verificar que fallan**

Run: `fnm exec --using=22 -- npx.cmd vitest run src/lib/play/clock/reducer.test.ts`
Expected: FAIL — módulos inexistentes.

- [ ] **Step 5: Implementar `reducer.ts`**

```ts
import type { PlayEvent } from "@/lib/play/core/types";
import { CLOCK_EVENT_TYPES, type ClockEvent } from "./events";
import { initialClockState, type ClockState } from "./types";

// Reducer PURO del reloj (spec reloj §1): valida el payload y la monotonía de
// `at`, y LIQUIDA el tiempo transcurrido entre eventos antes de aplicar cada
// uno. Jamás llama a Date.now() — el tiempo viene en los eventos.

export const CLOCK_MAX_PLAYERS = 6;
export const CLOCK_INITIAL_MS_MIN = 10_000;
export const CLOCK_INITIAL_MS_MAX = 7_200_000;
export const CLOCK_INCREMENT_MS_MAX = 60_000;
export const CLOCK_DURATION_MS_MIN = 5_000;
export const CLOCK_DURATION_MS_MAX = 7_200_000;

function assertNames(names: readonly string[]): void {
  if (names.length < 2 || names.length > CLOCK_MAX_PLAYERS) {
    throw new Error(`jugadores fuera de 2..${CLOCK_MAX_PLAYERS}`);
  }
  const seen = new Set<string>();
  for (const name of names) {
    if (name.trim() === "" || name !== name.trim()) throw new Error("nombre vacío o sin recortar");
    if (seen.has(name)) throw new Error("nombre duplicado");
    seen.add(name);
  }
}

// Liquida el tiempo corrido entre lastEventAt y `at` sobre quien corresponda.
// También valida la monotonía: un log con tiempos hacia atrás está corrupto.
function settle(state: ClockState, at: number): ClockState {
  if (at < state.lastEventAt) throw new Error("timestamp hacia atrás");
  const elapsed = at - state.lastEventAt;
  if (state.mode === "chess" && state.active !== null && !state.paused) {
    const players = state.players.map((p, i) => {
      if (i !== state.active) return p;
      const bankMs = p.bankMs - elapsed;
      return { ...p, bankMs, flagged: p.flagged || bankMs <= 0 };
    });
    return { ...state, players, lastEventAt: at };
  }
  if (state.mode === "countdown" && state.countdownRunning && !state.paused) {
    const countdownLeftMs = Math.max(0, state.countdownLeftMs - elapsed);
    return { ...state, countdownLeftMs, countdownRunning: countdownLeftMs > 0, lastEventAt: at };
  }
  return { ...state, lastEventAt: at };
}

export function clockReducer(state: ClockState, event: ClockEvent): ClockState {
  const s = settle(state, event.at);
  switch (event.type) {
    case "chess_configured": {
      const { players, initialMs, incrementMs } = event.payload;
      assertNames(players);
      if (
        !Number.isInteger(initialMs) ||
        initialMs < CLOCK_INITIAL_MS_MIN ||
        initialMs > CLOCK_INITIAL_MS_MAX
      ) {
        throw new Error("initialMs fuera de rango");
      }
      if (
        !Number.isInteger(incrementMs) ||
        incrementMs < 0 ||
        incrementMs > CLOCK_INCREMENT_MS_MAX
      ) {
        throw new Error("incrementMs fuera de rango");
      }
      return {
        ...s,
        mode: "chess",
        players: players.map((name) => ({ name, bankMs: initialMs, flagged: false })),
        active: 0,
        initialMs,
        incrementMs,
        paused: false,
      };
    }
    case "countdown_configured": {
      const { durationMs } = event.payload;
      if (
        !Number.isInteger(durationMs) ||
        durationMs < CLOCK_DURATION_MS_MIN ||
        durationMs > CLOCK_DURATION_MS_MAX
      ) {
        throw new Error("durationMs fuera de rango");
      }
      return {
        ...s,
        mode: "countdown",
        durationMs,
        countdownLeftMs: durationMs,
        countdownRunning: false,
        paused: false,
      };
    }
    case "turn_passed": {
      if (s.mode !== "chess" || s.active === null) throw new Error("sin reloj de ajedrez activo");
      if (s.paused) throw new Error("en pausa");
      const mover = s.active;
      const players = s.players.map((p, i) =>
        i === mover ? { ...p, bankMs: p.bankMs + s.incrementMs } : p,
      );
      return { ...s, players, active: (mover + 1) % players.length };
    }
    case "clock_paused": {
      const chessRunning = s.mode === "chess" && s.active !== null && !s.paused;
      const countdownRunning = s.mode === "countdown" && s.countdownRunning && !s.paused;
      if (!chessRunning && !countdownRunning) throw new Error("nada corriendo que pausar");
      return { ...s, paused: true };
    }
    case "clock_resumed": {
      if (!s.paused) throw new Error("no está en pausa");
      return { ...s, paused: false };
    }
    case "countdown_started": {
      if (s.mode !== "countdown") throw new Error("sin cuenta atrás configurada");
      if (s.countdownRunning) throw new Error("ya corriendo");
      // Arrancar tras agotarse recarga primero.
      const countdownLeftMs = s.countdownLeftMs <= 0 ? s.durationMs : s.countdownLeftMs;
      return { ...s, countdownLeftMs, countdownRunning: true, paused: false };
    }
    case "countdown_reset": {
      if (s.mode !== "countdown") throw new Error("sin cuenta atrás configurada");
      return { ...s, countdownLeftMs: s.durationMs, countdownRunning: false, paused: false };
    }
    case "clock_reset": {
      if (s.mode === null) throw new Error("nada que reiniciar");
      return {
        ...s,
        mode: null,
        active: null,
        paused: false,
        countdownRunning: false,
        countdownLeftMs: s.durationMs,
        players: s.players.map((p) => ({ name: p.name, bankMs: s.initialMs, flagged: false })),
      };
    }
  }
}

function isClockEvent(event: PlayEvent): event is ClockEvent {
  return (CLOCK_EVENT_TYPES as ReadonlySet<string>).has(event.type);
}

// Replay desde base (o inicial). Lanza ante evento desconocido o inválido.
export function replayClock(base: ClockState | null, log: PlayEvent[]): ClockState {
  return log.reduce((state, event) => {
    if (!isClockEvent(event)) throw new Error(`evento desconocido: ${event.type}`);
    return clockReducer(state, event);
  }, base ?? initialClockState());
}

// Compactación: mismo contrato que el Aleatorio (umbral 200 / cola 20). La
// liquidación vive en el estado re-basado, así que no necesita cuidado extra.
export const CLOCK_COMPACT_THRESHOLD = 200;
export const CLOCK_COMPACT_KEEP = 20;

export function compactClockIfNeeded(input: { base: ClockState | null; log: PlayEvent[] }): {
  base: ClockState | null;
  log: PlayEvent[];
} {
  if (input.log.length <= CLOCK_COMPACT_THRESHOLD) return input;
  const cut = input.log.length - CLOCK_COMPACT_KEEP;
  return {
    base: replayClock(input.base, input.log.slice(0, cut)),
    log: input.log.slice(cut),
  };
}
```

- [ ] **Step 6: Verificar que pasan + typecheck**

Run: `fnm exec --using=22 -- npx.cmd vitest run src/lib/play/clock/reducer.test.ts` — Expected: PASS.
Run: `fnm exec --using=22 -- npx.cmd tsc --noEmit` — Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add src/lib/play/clock/types.ts src/lib/play/clock/events.ts src/lib/play/clock/reducer.ts src/lib/play/clock/reducer.test.ts
git commit -m "feat(play): motor del reloj -- liquidacion por timestamps, Fischer, pausa y cuenta atras que muere en 0

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01G4eSiCCSCeeEzbYQK1mSS4"
```

---

### Task 3: Selectores del reloj (TDD) + hooks `useClock` y `useNow`

**Files:**
- Create: `src/lib/play/clock/selectors.ts`
- Test: `src/lib/play/clock/selectors.test.ts`
- Create: `src/lib/play/clock/use-clock.ts`
- Create: `src/components/play/clock/use-now.ts`

**Interfaces:**
- Consumes: `ClockState` (Task 2), `useCompanionStore` (Task 1).
- Produces: `remainingAt(state, now, player?)`, `flaggedAt(state, now, player?)`, `formatMs(ms)`; `useClock(identity)` (store sin feed/clear, clave `` `${identity}:clock` ``); `useNow(enabled, stepMs?)` (tick de UI). Tasks 4-5 los consumen.

- [ ] **Step 1: Tests que fallan (`selectors.test.ts`)**

```ts
import { describe, expect, it } from "vitest";
import { makeEvent } from "@/lib/play/core/events";
import type { ClockEvent } from "./events";
import { clockReducer } from "./reducer";
import { initialClockState } from "./types";
import { flaggedAt, formatMs, remainingAt } from "./selectors";

const ev = <T extends ClockEvent["type"]>(
  type: T,
  at: number,
  payload: Extract<ClockEvent, { type: T }>["payload"],
) => makeEvent(type, payload, at) as ClockEvent;

const chessAt1000 = [
  ev("chess_configured", 1000, { players: ["Ana", "Beto"], initialMs: 60_000, incrementMs: 0 }),
].reduce(clockReducer, initialClockState());

describe("remainingAt", () => {
  it("descuenta lo corrido solo al jugador activo", () => {
    expect(remainingAt(chessAt1000, 11_000, 0)).toBe(50_000);
    expect(remainingAt(chessAt1000, 11_000, 1)).toBe(60_000);
  });
  it("en pausa el tiempo no corre", () => {
    const paused = clockReducer(chessAt1000, ev("clock_paused", 11_000, {}));
    expect(remainingAt(paused, 99_000, 0)).toBe(50_000);
  });
  it("cuenta atrás corriendo se clava en 0", () => {
    const cd = [
      ev("countdown_configured", 1000, { durationMs: 5_000 }),
      ev("countdown_started", 2000, {}),
    ].reduce(clockReducer, initialClockState());
    expect(remainingAt(cd, 4_000)).toBe(3_000);
    expect(remainingAt(cd, 60_000)).toBe(0);
  });
});

describe("flaggedAt", () => {
  it("cruza en vivo sin esperar liquidación y persiste tras liquidar", () => {
    expect(flaggedAt(chessAt1000, 30_000, 0)).toBe(false);
    expect(flaggedAt(chessAt1000, 61_001, 0)).toBe(true); // en vivo
    const settled = clockReducer(chessAt1000, ev("turn_passed", 62_000, {}));
    expect(flaggedAt(settled, 62_000, 0)).toBe(true); // persistida
  });
  it("cuenta atrás: bandera al llegar a 0", () => {
    const cd = [
      ev("countdown_configured", 1000, { durationMs: 5_000 }),
      ev("countdown_started", 2000, {}),
    ].reduce(clockReducer, initialClockState());
    expect(flaggedAt(cd, 6_000)).toBe(false);
    expect(flaggedAt(cd, 7_001)).toBe(true);
  });
});

describe("formatMs", () => {
  it("m:ss, h:mm:ss y negativo con signo", () => {
    expect(formatMs(7_000)).toBe("0:07");
    expect(formatMs(754_000)).toBe("12:34");
    expect(formatMs(3_723_000)).toBe("1:02:03");
    expect(formatMs(-5_000)).toBe("−0:05");
    expect(formatMs(0)).toBe("0:00");
  });
});
```

- [ ] **Step 2: Verificar que fallan**

Run: `fnm exec --using=22 -- npx.cmd vitest run src/lib/play/clock/selectors.test.ts`
Expected: FAIL — `selectors` no existe.

- [ ] **Step 3: Implementar `selectors.ts`**

```ts
import type { ClockState } from "./types";

// Restante vivo a la hora `now`: banco liquidado menos lo corrido desde el
// último evento (solo si ese banco está corriendo). Con `player` = ajedrez;
// sin él = cuenta atrás (clavada en 0: nunca negativa).
export function remainingAt(state: ClockState, now: number, player?: number): number {
  const since = Math.max(0, now - state.lastEventAt);
  if (player !== undefined) {
    const p = state.players[player];
    if (!p || state.mode !== "chess") return 0;
    const running = state.active === player && !state.paused;
    return p.bankMs - (running ? since : 0);
  }
  if (state.mode !== "countdown") return 0;
  const running = state.countdownRunning && !state.paused;
  return Math.max(0, state.countdownLeftMs - (running ? since : 0));
}

// ¿Cruzó el cero a la hora `now`? En ajedrez la bandera liquidada persiste
// (spec: no se desfija salvo reconfigurar) y además se detecta EN VIVO para
// que la UI no espere al siguiente evento.
export function flaggedAt(state: ClockState, now: number, player?: number): boolean {
  if (player !== undefined) {
    if (state.mode !== "chess") return false;
    const p = state.players[player];
    if (!p) return false; // índice fuera de rango: sin bandera, no «caído»
    return p.flagged || remainingAt(state, now, player) <= 0;
  }
  return state.mode === "countdown" && remainingAt(state, now) <= 0;
}

// m:ss (o h:mm:ss desde 1 h), con signo − en negativo. El segundo en curso se
// trunca hacia abajo: 59.9 s restantes se leen 0:59.
export function formatMs(ms: number): string {
  const neg = ms < 0;
  const total = Math.floor(Math.abs(ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const core =
    h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
      : `${m}:${String(sec).padStart(2, "0")}`;
  return neg ? `−${core}` : core;
}
```

- [ ] **Step 4: Verificar que pasan**

Run: `fnm exec --using=22 -- npx.cmd vitest run src/lib/play/clock/selectors.test.ts` — Expected: PASS.

- [ ] **Step 5: Hooks**

`src/lib/play/clock/use-clock.ts`:

```ts
"use client";

import {
  useCompanionStore,
  type CompanionEmit,
} from "@/lib/play/core/use-companion-store";
import type { ClockState } from "./types";
import type { ClockEvent } from "./events";
import { clockReducer, compactClockIfNeeded, replayClock } from "./reducer";

/**
 * Store del acompañante «Reloj» sobre el hook genérico de core. Clave propia
 * (`${identity}:clock`) para no pisar el registro del Aleatorio, que usa la
 * identidad a secas. Sin feed ni clear: el historial del reloj no se lista.
 */
export function useClock(identity: string): {
  state: ClockState;
  emit: CompanionEmit<ClockEvent>;
  undo: () => void;
  canUndo: boolean;
  loaded: boolean;
} {
  return useCompanionStore<ClockState, ClockEvent>({
    storageKey: `${identity}:clock`,
    replay: replayClock,
    reducer: clockReducer,
    compact: compactClockIfNeeded,
  });
}
```

`src/components/play/clock/use-now.ts`:

```ts
"use client";

import { useEffect, useState } from "react";

// Tick de UI: re-render periódico mientras algo corre. El cómputo del tiempo
// NO depende de este tick (remainingAt deriva de timestamps) — solo refresca
// lo que se ve. 250 ms: el segundo visible nunca llega >0,25 s tarde.
export function useNow(enabled: boolean, stepMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), stepMs);
    return () => clearInterval(id);
  }, [enabled, stepMs]);
  return now;
}
```

- [ ] **Step 6: Typecheck + commit**

Run: `fnm exec --using=22 -- npx.cmd tsc --noEmit` — Expected: sin errores.

```bash
git add src/lib/play/clock/selectors.ts src/lib/play/clock/selectors.test.ts src/lib/play/clock/use-clock.ts src/components/play/clock/use-now.ts
git commit -m "feat(play): selectores del reloj y hooks useClock/useNow -- restante vivo, bandera y formato

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01G4eSiCCSCeeEzbYQK1mSS4"
```

---

### Task 4: Pantalla del reloj — modo ajedrez (setup + juego) y ruta

**Files:**
- Create: `src/app/partidas/reloj/page.tsx`
- Create: `src/components/play/clock/clock-screen.tsx`
- Create: `src/components/play/clock/chess-setup.tsx`
- Create: `src/components/play/clock/chess-game.tsx`
- Modify: `messages/es.json` (namespace `play.clock`)

**Interfaces:**
- Consumes: `useClock`, `useNow`, selectores (Task 3), constantes de rango (Task 2), `usePlayers` de core, `buttonVariants`, `SEAT_ACCENT` de `@/lib/play/ui/seats`.
- Produces: `ClockScreen({ identity })`; `ChessSetup`/`ChessGame` internos. Task 5 añade el panel de cuenta atrás al hueco marcado en `ClockScreen`.

- [ ] **Step 1: Página**

`src/app/partidas/reloj/page.tsx`:

```tsx
import type { Metadata } from "next";
import { Suspense } from "react";
import { connection } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server";
import { PlayFrame } from "@/components/play/play-frame";
import { ClockScreen } from "@/components/play/clock/clock-screen";

export const metadata: Metadata = { title: "Reloj — Biblioshare" };

// Mismo boundary de petición que el Aleatorio (#435): la identidad depende de
// la sesión y no se puede leer durante el prerender. Anónimo funciona entero.
async function Screen() {
  await connection();
  const identity = (await getCurrentUser())?.id ?? "anon";
  // key: si la sesión cambia en caliente, el hook entero se REMONTA (clase #680).
  return <ClockScreen key={identity} identity={identity} />;
}

export default function ClockPage() {
  return (
    <PlayFrame>
      <Suspense fallback={null}>
        <Screen />
      </Suspense>
    </PlayFrame>
  );
}
```

- [ ] **Step 2: `clock-screen.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useClock } from "@/lib/play/clock/use-clock";
import { ChessSetup } from "./chess-setup";
import { ChessGame } from "./chess-game";

type Tab = "chess" | "countdown";
const TABS: Tab[] = ["chess", "countdown"];

/**
 * Pantalla del acompañante «Reloj» (spec reloj §2): pestañas-chip como el
 * Aleatorio. En ajedrez, setup o juego según haya chess_configured vigente.
 * La pestaña de cuenta atrás entra en la tarea siguiente.
 */
export function ClockScreen({ identity }: { identity: string }) {
  const t = useTranslations("play.clock");
  const clock = useClock(identity);
  const [tab, setTab] = useState<Tab>("chess");

  if (!clock.loaded) return null;

  return (
    <div>
      <h1 className="font-serif text-[26px] font-semibold">{t("title")}</h1>
      <p className="mt-1 text-[14px] text-muted-foreground">{t("subtitle")}</p>

      <div role="tablist" aria-label={t("title")} className="mt-4 flex flex-wrap gap-2">
        {TABS.map((id) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-chip border px-3 py-1.5 text-[13px] ${
              tab === id ? "border-foreground bg-surface-muted font-semibold" : "border-border"
            }`}
          >
            {t(`tabs.${id}`)}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "chess" ? (
          clock.state.mode === "chess" ? (
            <ChessGame state={clock.state} emit={clock.emit} />
          ) : (
            <ChessSetup identity={identity} state={clock.state} emit={clock.emit} />
          )
        ) : null}
        {/* countdown: Task 5 */}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `chess-setup.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { usePlayers } from "@/lib/play/core/use-players";
import type { CompanionEmit } from "@/lib/play/core/use-companion-store";
import type { ClockEvent } from "@/lib/play/clock/events";
import type { ClockState } from "@/lib/play/clock/types";
import {
  CLOCK_INCREMENT_MS_MAX,
  CLOCK_INITIAL_MS_MAX,
  CLOCK_INITIAL_MS_MIN,
  CLOCK_MAX_PLAYERS,
} from "@/lib/play/clock/reducer";

const TIME_PRESETS_MIN = [1, 3, 5, 10, 15, 30];
const INCREMENT_PRESETS_S = [0, 5, 10, 30];

/**
 * Setup del reloj de ajedrez: lista propia de jugadores (habituales a un
 * toque), tiempo inicial e incremento Fischer. «Empezar» emite
 * chess_configured. Tras un reset, el estado conserva la config anterior y
 * este formulario la precarga.
 */
export function ChessSetup({
  identity,
  state,
  emit,
}: {
  identity: string;
  state: ClockState;
  emit: CompanionEmit<ClockEvent>;
}) {
  const t = useTranslations("play.clock");
  const { players: regulars } = usePlayers(identity);
  const [players, setPlayers] = useState<string[]>(state.players.map((p) => p.name));
  const [name, setName] = useState("");
  const [minutes, setMinutes] = useState(Math.round(state.initialMs / 60_000) || 5);
  const [customMinutes, setCustomMinutes] = useState("");
  const [incrementS, setIncrementS] = useState(Math.round(state.incrementMs / 1000));
  const [customIncrement, setCustomIncrement] = useState("");

  function add(candidate: string) {
    const trimmed = candidate.trim();
    if (trimmed === "" || players.includes(trimmed) || players.length >= CLOCK_MAX_PLAYERS) return;
    setPlayers([...players, trimmed]);
    setName("");
  }

  const chips = regulars.filter((r) => !players.includes(r.name)).slice(0, 6);

  const parsedCustomMin = Number(customMinutes);
  const initialMs =
    customMinutes !== "" && Number.isFinite(parsedCustomMin)
      ? Math.round(parsedCustomMin * 60_000)
      : minutes * 60_000;
  const parsedCustomInc = Number(customIncrement);
  const incrementMs =
    customIncrement !== "" && Number.isFinite(parsedCustomInc)
      ? Math.round(parsedCustomInc * 1000)
      : incrementS * 1000;

  const valid =
    players.length >= 2 &&
    Number.isInteger(initialMs) &&
    initialMs >= CLOCK_INITIAL_MS_MIN &&
    initialMs <= CLOCK_INITIAL_MS_MAX &&
    Number.isInteger(incrementMs) &&
    incrementMs >= 0 &&
    incrementMs <= CLOCK_INCREMENT_MS_MAX;

  const chipClass = (selected: boolean) =>
    `rounded-chip border px-3 py-1.5 text-[13px] font-semibold ${
      selected ? "border-foreground bg-surface-muted" : "border-border"
    }`;

  return (
    <div>
      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-2" aria-label={t("regulars")}>
          {chips.map((r) => (
            <button
              key={r.playerId}
              type="button"
              onClick={() => add(r.name)}
              className="rounded-chip border border-border px-3 py-1 text-[13px]"
            >
              {r.name}
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex gap-2">
        <input
          value={name}
          placeholder={t("namePlaceholder")}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add(name);
          }}
          aria-label={t("nameLabel")}
          className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1.5 text-[14px]"
        />
        <button
          type="button"
          onClick={() => add(name)}
          className="rounded-chip border border-border px-3 py-1.5 text-[13px]"
        >
          {t("add")}
        </button>
      </div>

      {players.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {players.map((p) => (
            <li key={p}>
              <button
                type="button"
                onClick={() => setPlayers(players.filter((x) => x !== p))}
                aria-label={t("remove", { name: p })}
                className="rounded-chip border border-border px-3 py-1 text-[13px]"
              >
                {p} ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-[13px] text-muted-foreground">{t("playersHint")}</p>
      )}

      <p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {t("initial")}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {TIME_PRESETS_MIN.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={customMinutes === "" && minutes === m}
            onClick={() => {
              setCustomMinutes("");
              setMinutes(m);
            }}
            className={chipClass(customMinutes === "" && minutes === m)}
          >
            {t("minutes", { n: m })}
          </button>
        ))}
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={120}
          value={customMinutes}
          placeholder="min"
          onChange={(e) => setCustomMinutes(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={t("customMinutes")}
          className="w-20 rounded-md border border-border bg-surface px-2 py-1.5 text-[14px]"
        />
      </div>

      <p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {t("increment")}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {INCREMENT_PRESETS_S.map((sec) => (
          <button
            key={sec}
            type="button"
            aria-pressed={customIncrement === "" && incrementS === sec}
            onClick={() => {
              setCustomIncrement("");
              setIncrementS(sec);
            }}
            className={chipClass(customIncrement === "" && incrementS === sec)}
          >
            {sec === 0 ? t("noIncrement") : t("plusSeconds", { n: sec })}
          </button>
        ))}
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={60}
          value={customIncrement}
          placeholder="s"
          onChange={(e) => setCustomIncrement(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={t("customIncrement")}
          className="w-20 rounded-md border border-border bg-surface px-2 py-1.5 text-[14px]"
        />
      </div>

      <button
        type="button"
        disabled={!valid}
        onClick={() => emit("chess_configured", { players, initialMs, incrementMs })}
        className={buttonVariants("primary", "mt-5 w-full justify-center py-3 text-[15px]")}
      >
        {t("start")}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: `chess-game.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { CompanionEmit } from "@/lib/play/core/use-companion-store";
import type { ClockEvent } from "@/lib/play/clock/events";
import type { ClockState } from "@/lib/play/clock/types";
import { flaggedAt, formatMs, remainingAt } from "@/lib/play/clock/selectors";
import { buzz } from "@/components/play/random/stage/stage-helpers";
import { SEAT_ACCENT } from "@/lib/play/ui/seats";
import { useNow } from "./use-now";

/**
 * Juego del reloj de ajedrez: una zona grande por jugador; tocar la ACTIVA
 * pasa el turno. El tiempo visible se deriva por remainingAt con un tick de
 * 250 ms — pausar apaga el tick. Bandera + buzz al cruzar 0; el banco sigue
 * en negativo (agotarse no detiene la partida, spec reloj brainstorm).
 */
export function ChessGame({
  state,
  emit,
}: {
  state: ClockState;
  emit: CompanionEmit<ClockEvent>;
}) {
  const t = useTranslations("play.clock");
  const running = state.active !== null && !state.paused;
  const now = useNow(running);
  const [confirming, setConfirming] = useState(false);
  // Buzz al cruzar 0: una vez por jugador y configuración.
  const buzzed = useRef<Set<number>>(new Set());
  useEffect(() => {
    state.players.forEach((_, i) => {
      if (flaggedAt(state, now, i) && !buzzed.current.has(i)) {
        buzzed.current.add(i);
        buzz();
      }
    });
  }, [state, now]);

  return (
    <div>
      <div className={`grid gap-3 ${state.players.length > 2 ? "grid-cols-2" : "grid-cols-1"}`}>
        {state.players.map((p, i) => {
          const active = state.active === i;
          const flagged = flaggedAt(state, now, i);
          const seat = SEAT_ACCENT[i % SEAT_ACCENT.length];
          return (
            <button
              key={p.name}
              type="button"
              data-testid={`clock-zone-${i}`}
              data-active={active}
              onClick={() => {
                if (active && !state.paused) emit("turn_passed", {});
              }}
              className={`flex flex-col items-center gap-1 rounded-card border p-5 text-center transition-colors ${
                active ? "bg-surface-muted" : "border-border bg-surface"
              }`}
              style={active ? { borderColor: `var(${seat.varName})`, borderWidth: 2 } : undefined}
            >
              <span className="flex items-center gap-2 text-[14px] font-semibold">
                <span
                  aria-hidden
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: `var(${seat.varName})` }}
                />
                {p.name}
                {flagged ? <span aria-label={t("flag")}>⚑</span> : null}
              </span>
              <span
                data-testid={`clock-time-${i}`}
                className={`font-serif text-[38px] font-semibold leading-none tabular-nums ${
                  flagged ? "text-play-danger" : ""
                }`}
              >
                {formatMs(remainingAt(state, now, i))}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-center gap-3">
        {state.paused ? (
          <button
            type="button"
            onClick={() => emit("clock_resumed", {})}
            className="rounded-chip border border-border px-4 py-2 text-[14px] font-semibold"
          >
            {t("resume")}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => emit("clock_paused", {})}
            className="rounded-chip border border-border px-4 py-2 text-[14px] font-semibold"
          >
            {t("pause")}
          </button>
        )}
        {confirming ? (
          <button
            type="button"
            onClick={() => {
              emit("clock_reset", {});
              setConfirming(false);
            }}
            className="p-2 text-[12px] text-play-danger underline"
          >
            {t("resetConfirm")}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="p-2 text-[12px] text-muted-foreground underline"
          >
            {t("reset")}
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: i18n — namespace `play.clock`**

En `messages/es.json`, dentro de `play` (junto a `random`), añadir:

```json
"clock": {
  "title": "Reloj",
  "subtitle": "Reloj de ajedrez y cuenta atrás para cualquier juego.",
  "tabs": { "chess": "Ajedrez", "countdown": "Cuenta atrás" },
  "regulars": "Tus habituales",
  "nameLabel": "Nombre del jugador",
  "namePlaceholder": "Añadir jugador…",
  "add": "Añadir",
  "remove": "Quitar a {name}",
  "playersHint": "Añade entre 2 y 6 jugadores.",
  "initial": "Tiempo inicial",
  "increment": "Incremento",
  "minutes": "{n} min",
  "customMinutes": "Minutos personalizados",
  "noIncrement": "Sin incremento",
  "plusSeconds": "+{n} s",
  "customIncrement": "Segundos de incremento",
  "start": "Empezar",
  "pause": "Pausa",
  "resume": "Reanudar",
  "reset": "Reiniciar",
  "resetConfirm": "¿Seguro? Reinicia el reloj",
  "flag": "Sin tiempo",
  "duration": "Duración",
  "seconds": "{n} s",
  "customSeconds": "Segundos personalizados"
}
```

- [ ] **Step 6: Verificar**

Run: `fnm exec --using=22 -- npx.cmd tsc --noEmit` — Expected: sin errores.
Verificación manual rápida NO requerida aquí (e2e llega en Task 6); basta typecheck.

- [ ] **Step 7: Commit**

```bash
git add src/app/partidas/reloj/page.tsx src/components/play/clock/clock-screen.tsx src/components/play/clock/chess-setup.tsx src/components/play/clock/chess-game.tsx messages/es.json
git commit -m "feat(play): pantalla del reloj -- setup con habituales y juego por zonas tocables con Fischer

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01G4eSiCCSCeeEzbYQK1mSS4"
```

---

### Task 5: Cuenta atrás

**Files:**
- Create: `src/components/play/clock/countdown-panel.tsx`
- Modify: `src/components/play/clock/clock-screen.tsx` (montar el panel)

**Interfaces:**
- Consumes: `useNow`, selectores, constantes `CLOCK_DURATION_MS_MIN/MAX`, `buzz`.
- Produces: `CountdownPanel({ state, emit })`.

- [ ] **Step 1: `countdown-panel.tsx`**

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import type { CompanionEmit } from "@/lib/play/core/use-companion-store";
import type { ClockEvent } from "@/lib/play/clock/events";
import type { ClockState } from "@/lib/play/clock/types";
import { flaggedAt, formatMs, remainingAt } from "@/lib/play/clock/selectors";
import { buzz } from "@/components/play/random/stage/stage-helpers";
import { useNow } from "./use-now";

const PRESETS_S = [30, 60, 120, 300, 600];

const RADIUS = 88;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * Cuenta atrás compartida: presets + custom, aro de progreso SVG y CTA de
 * estado (Empezar/Pausar/Reanudar). Al llegar a 0 el motor la clava (no hay
 * negativo): buzz una vez y el aro queda completo en danger.
 */
export function CountdownPanel({
  state,
  emit,
}: {
  state: ClockState;
  emit: CompanionEmit<ClockEvent>;
}) {
  const t = useTranslations("play.clock");
  const configured = state.mode === "countdown";
  const running = configured && state.countdownRunning && !state.paused;
  const now = useNow(running);
  const [customSeconds, setCustomSeconds] = useState("");

  const left = configured ? remainingAt(state, now) : state.durationMs;
  const done = configured && flaggedAt(state, now);
  const buzzedFor = useRef<number | null>(null);
  useEffect(() => {
    if (done && buzzedFor.current !== state.lastEventAt) {
      buzzedFor.current = state.lastEventAt;
      buzz();
    }
    if (!done) buzzedFor.current = null;
  }, [done, state.lastEventAt]);

  const progress = configured && state.durationMs > 0 ? left / state.durationMs : 1;

  function configure(durationMs: number) {
    emit("countdown_configured", { durationMs });
  }

  const parsedCustom = Number(customSeconds);
  const chipClass = (selected: boolean) =>
    `rounded-chip border px-3 py-1.5 text-[13px] font-semibold ${
      selected ? "border-foreground bg-surface-muted" : "border-border"
    }`;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS_S.map((sec) => (
          <button
            key={sec}
            type="button"
            aria-pressed={configured && state.durationMs === sec * 1000}
            disabled={running}
            onClick={() => configure(sec * 1000)}
            className={chipClass(configured && state.durationMs === sec * 1000)}
          >
            {sec < 60 ? t("seconds", { n: sec }) : t("minutes", { n: sec / 60 })}
          </button>
        ))}
        <input
          type="number"
          inputMode="numeric"
          min={5}
          max={7200}
          value={customSeconds}
          placeholder="s"
          disabled={running}
          onChange={(e) => setCustomSeconds(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && Number.isInteger(parsedCustom)) configure(parsedCustom * 1000);
          }}
          onBlur={() => {
            if (customSeconds !== "" && Number.isInteger(parsedCustom)) {
              configure(parsedCustom * 1000);
            }
          }}
          onFocus={(e) => e.currentTarget.select()}
          aria-label={t("customSeconds")}
          className="w-20 rounded-md border border-border bg-surface px-2 py-1.5 text-[14px]"
        />
      </div>

      <div className="mt-5 flex justify-center">
        <svg viewBox="0 0 200 200" className="h-56 w-56" aria-hidden="true">
          <circle cx="100" cy="100" r={RADIUS} fill="none" stroke="var(--border)" strokeWidth="8" />
          <circle
            cx="100"
            cy="100"
            r={RADIUS}
            fill="none"
            stroke={done ? "var(--play-danger)" : "var(--accent-ink)"}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
            transform="rotate(-90 100 100)"
          />
          <text
            x="100"
            y="100"
            textAnchor="middle"
            dominantBaseline="central"
            className="font-serif"
            fontSize="40"
            fontWeight="600"
            fill={done ? "var(--play-danger)" : "var(--foreground)"}
            style={{ fontVariantNumeric: "tabular-nums" }}
            data-testid="countdown-time"
          >
            {formatMs(left)}
          </text>
        </svg>
      </div>

      {/* `|| done`: en vivo (sin evento posterior) el estado aún dice
          countdownRunning=true con left=0 — el CTA honesto es «Empezar», que
          recarga primero. */}
      {!configured || (!state.countdownRunning && !state.paused) || done ? (
        <button
          type="button"
          disabled={!configured}
          onClick={() => emit("countdown_started", {})}
          className={buttonVariants("primary", "mt-3 w-full justify-center py-3 text-[15px]")}
        >
          {t("start")}
        </button>
      ) : state.paused ? (
        <button
          type="button"
          onClick={() => emit("clock_resumed", {})}
          className={buttonVariants("primary", "mt-3 w-full justify-center py-3 text-[15px]")}
        >
          {t("resume")}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => emit("clock_paused", {})}
          className={buttonVariants("primary", "mt-3 w-full justify-center py-3 text-[15px]")}
        >
          {t("pause")}
        </button>
      )}
      <div className="mt-2 text-center">
        <button
          type="button"
          disabled={!configured}
          onClick={() => emit("countdown_reset", {})}
          className="p-2 text-[12px] text-muted-foreground underline disabled:opacity-40"
        >
          {t("reset")}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Montar en `clock-screen.tsx`**

Añadir el import `import { CountdownPanel } from "./countdown-panel";` y sustituir
`{/* countdown: Task 5 */}` por:

```tsx
        {tab === "countdown" ? <CountdownPanel state={clock.state} emit={clock.emit} /> : null}
```

- [ ] **Step 3: Verificar + commit**

Run: `fnm exec --using=22 -- npx.cmd tsc --noEmit` — Expected: sin errores.

```bash
git add src/components/play/clock/countdown-panel.tsx src/components/play/clock/clock-screen.tsx
git commit -m "feat(play): cuenta atras con aro de progreso -- presets, CTA de estado y muerte en cero

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01G4eSiCCSCeeEzbYQK1mSS4"
```

---

### Task 6: Hub (marca + tarjeta) + e2e + verificación completa

**Files:**
- Create: `src/components/play/marks/clock-table-mark.tsx`
- Modify: `src/components/play/tool-grid.tsx` (tarjeta tras la del Aleatorio)
- Modify: `messages/es.json` (`play.tools.clock.name`)
- Test: `e2e/partidas-reloj.spec.ts`

**Interfaces:**
- Consumes: `SEAT_ACCENT`.
- Produces: nada nuevo para otras tareas.

- [ ] **Step 1: `clock-table-mark.tsx`**

```tsx
import { SEAT_ACCENT } from "@/lib/play/ui/seats";

/**
 * La marca del Reloj es un reloj de ajedrez clásico sobre fieltro: caja con
 * dos esferas y dos pulsadores — el hundido en color de asiento delata quién
 * mueve. Agujas en --accent-ink, como el «20» de la marca del Aleatorio. Sin
 * texto ni <title>: la etiqueta la pone la tarjeta que lo envuelve.
 */
export function ClockTableMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden focusable="false">
      <ellipse cx="32" cy="54" rx="24" ry="5" fill="var(--play-felt)" />
      {/* Pulsadores: el izquierdo hundido (turno del asiento 1). */}
      <rect x="14" y="18" width="12" height="6" rx="2" fill={`var(${SEAT_ACCENT[0].varName})`} />
      <rect x="38" y="14" width="12" height="8" rx="2" fill={`var(${SEAT_ACCENT[1].varName})`} />
      {/* Caja. */}
      <rect
        x="8"
        y="22"
        width="48"
        height="28"
        rx="5"
        fill="var(--surface)"
        stroke="var(--play-rail)"
        strokeWidth="1.5"
      />
      {/* Dos esferas con agujas. */}
      <circle cx="21" cy="36" r="9" fill="var(--surface)" stroke="var(--play-rail)" strokeWidth="1.5" />
      <circle cx="43" cy="36" r="9" fill="var(--surface)" stroke="var(--play-rail)" strokeWidth="1.5" />
      <line x1="21" y1="36" x2="21" y2="30" stroke="var(--accent-ink)" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="21" y1="36" x2="25" y2="38" stroke="var(--accent-ink)" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="43" y1="36" x2="43" y2="31" stroke="var(--accent-ink)" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="43" y1="36" x2="40" y2="33" stroke="var(--accent-ink)" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
```

- [ ] **Step 2: Tarjeta en `tool-grid.tsx`**

Añadir el import `import { ClockTableMark } from "./marks/clock-table-mark";` y, ENTRE la
tarjeta del Aleatorio y la de «más herramientas», insertar:

```tsx
      {/* El Reloj, como el Aleatorio, vive FUERA del registro (acompañante sin
          partida): tarjeta estática. */}
      <li>
        <Link
          href="/partidas/reloj"
          className="flex flex-col items-center gap-3 rounded-card border border-border bg-surface p-4 transition-colors hover:bg-surface-muted"
        >
          <ClockTableMark className="h-16 w-16" />
          <span className="text-center font-serif text-[15px] font-semibold">
            {t("tools.clock.name")}
          </span>
        </Link>
      </li>
```

- [ ] **Step 3: i18n de la tarjeta**

En `messages/es.json`, dentro de `play.tools` (tras el objeto `random` si existe, o junto a
sus hermanos), añadir:

```json
"clock": { "name": "Reloj" }
```

- [ ] **Step 4: e2e `e2e/partidas-reloj.spec.ts`**

```ts
import { test, expect } from "@playwright/test";

// Acompañante «Reloj» (spec reloj). Anónimo, IDB propio (clave :clock).
// Viewport móvil como el resto de Play.
test.use({ viewport: { width: 390, height: 844 } });

test("ajedrez: configurar, pasar turno, pausar y sobrevivir a la recarga", async ({ page }) => {
  await page.goto("/partidas/reloj");
  await expect(page.getByRole("heading", { name: "Reloj" })).toBeVisible();

  for (const name of ["Ana", "Beto"]) {
    await page.getByLabel("Nombre del jugador").fill(name);
    await page.getByRole("button", { name: /^añadir$/i }).click();
  }
  await page.getByRole("button", { name: "1 min", exact: true }).click();
  await page.getByRole("button", { name: /^empezar$/i }).click();

  // Ana activa; pasar turno activa a Beto.
  await expect(page.getByTestId("clock-zone-0")).toHaveAttribute("data-active", "true");
  await expect(page.getByTestId("clock-time-0")).toHaveText(/^(1:00|0:5\d)$/);
  await page.getByTestId("clock-zone-0").click();
  await expect(page.getByTestId("clock-zone-1")).toHaveAttribute("data-active", "true");

  // Pausar congela el número.
  await page.getByRole("button", { name: /^pausa$/i }).click();
  const frozen = await page.getByTestId("clock-time-1").innerText();
  await page.waitForTimeout(1200);
  await expect(page.getByTestId("clock-time-1")).toHaveText(frozen);

  // Recargar conserva bancos, activo y pausa (IDB + timestamps).
  await page.reload();
  await expect(page.getByTestId("clock-zone-1")).toHaveAttribute("data-active", "true");
  await expect(page.getByTestId("clock-time-1")).toHaveText(frozen);
  await page.getByRole("button", { name: /^reanudar$/i }).click();
  await expect(page.getByRole("button", { name: /^pausa$/i })).toBeVisible();
});

test("cuenta atrás de 5 s llega a 0:00 y el CTA vuelve a Empezar", async ({ page }) => {
  await page.goto("/partidas/reloj");
  await page.getByRole("tab", { name: "Cuenta atrás" }).click();

  await page.getByLabel("Segundos personalizados").fill("5");
  await page.getByLabel("Segundos personalizados").press("Enter");
  await expect(page.getByTestId("countdown-time")).toHaveText("0:05");
  await page.getByRole("button", { name: /^empezar$/i }).click();
  await expect(page.getByTestId("countdown-time")).toHaveText("0:00", { timeout: 7000 });
  await expect(page.getByRole("button", { name: /^empezar$/i })).toBeVisible();
});

test("la tarjeta del hub navega al reloj", async ({ page }) => {
  await page.goto("/partidas");
  await page.getByRole("link", { name: "Reloj", exact: true }).click();
  await expect(page).toHaveURL(/\/partidas\/reloj$/);
  await expect(page.getByRole("heading", { name: "Reloj" })).toBeVisible();
});
```

- [ ] **Step 5: Verificación completa**

Run (en orden):
1. `fnm exec --using=22 -- npx.cmd tsc --noEmit` — Expected: sin errores.
2. `fnm exec --using=22 -- npx.cmd vitest run src/lib/play` — Expected: PASS todo (clock + random + core intactos).
3. `fnm exec --using=22 -- npm.cmd run test:e2e -- partidas-reloj.spec.ts` — Expected: 3/3 PASS.
4. `fnm exec --using=22 -- npm.cmd run test:e2e -- partidas-aleatorio.spec.ts` — Expected: 5/5 PASS (la migración del hook no rompió nada).

- [ ] **Step 6: Commit**

```bash
git add src/components/play/marks/clock-table-mark.tsx src/components/play/tool-grid.tsx messages/es.json e2e/partidas-reloj.spec.ts
git commit -m "feat(play): tarjeta del Reloj en el hub, marca de reloj de ajedrez y e2e del acompanante

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01G4eSiCCSCeeEzbYQK1mSS4"
```
